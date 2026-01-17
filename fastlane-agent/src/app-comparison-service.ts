/**
 * App 关联对比服务
 * 
 * 功能：
 * 1. 从明道云同步"我的包"与"目标包"的关联关系
 * 2. 提供关联对比列表查询
 * 3. 支持刷新单行和批量检查
 * 
 * 版本：5.0
 * 创建日期：2025-12-25
 */

import { HapClient } from './hap-client';
import { SupabaseClient } from './supabase-client';
import { UmengClient } from './umeng-client';
import { AppStatus } from './types';

// ==================== 接口定义 ====================

/**
 * 关联对比记录
 */
export interface AppComparisonRecord {
  // 我的包信息
  myApp: {
    bundleId: string;
    appName: string;
    appId: string;
    accountName: string;
    accountEmail: string;
    status: AppStatus;
    lastChecked: string;
    umengId?: string;
    isClearKeyword?: boolean;  // 清词状态（7.0 版本新增）
    isClearRank?: boolean;     // 清榜状态（7.0 版本新增）
  };
  // 目标包信息（可能为空）
  targetApp: {
    appId: string;
    appName: string;
    note: string;
    status: string;
    isOffline: boolean;
    offlineDate?: string;
    qimaiLink?: string;
  } | null;
  // 友盟数据
  todayNew: number | null;
  yesterdayNew: number | null;
  umengAppName: string | null;  // 友盟应用名称（5.0 版本新增）
  // 操作链接
  keywordSearchUrl: string;
  qimaiUrl: string;
  appStoreUrl: string;
  umengDataUrl?: string;
}

/**
 * 统计数据
 */
export interface AppComparisonStats {
  myAppTotal: number;
  myAppAvailable: number;
  myAppRemoved: number;
  linkedCount: number;
  targetAppAvailable: number;
  targetAppRemoved: number;
}

// ==================== 服务类 ====================

export class AppComparisonService {
  // 明道云字段 ID
  private readonly FIELD_IDS = {
    // 账号上的产品表
    APP_NAME: '64341ac46d6df8983a7f7af3',
    BUNDLE_ID: '64b3a82fa75368cd24c99d8d',
    APP_ID: '643418197f0301fb51750f02',
    ACCOUNT: '64369d9b05108c17907e6a00',
    ACCOUNT_NAME: '64341940fa601169896433f6',
    UMENG_ID: '6438f8a907592fef2a98a1a6',
    TARGET_APP_RELATION: '65212229242cc1957d68f06a',  // 目标包关联字段
    TARGET_APP_NAME: '68a270a3525f8dd536db3da3',      // 目标包名称（Lookup）
    TARGET_APP_NOTE: '662f445897112d190139297b',      // 目标包备注（Lookup）
    KEYWORD_SEARCH_URL: '650b048db57c0312e55e7a4c',   // 关键词查询链接
    QIMAI_URL: '65388cadea09c5df35ec81c6',            // 七麦链接
    APPSTORE_URL: '6548da8c922ec33c68c13224',         // AppStore链接
    UMENG_DATA_URL: '6565befa8815ce3493f25907',       // 友盟数据链接
  };

  private readonly HAP_WORKSHEET_PRODUCTS = process.env.HAP_WORKSHEET_PRODUCTS || '';

  constructor(
    private hapClient: HapClient,
    private supabaseClient: SupabaseClient,
    private umengClient: UmengClient
  ) {}

  /**
   * 从明道云同步关联关系
   * 逻辑：从"我的包"出发，查询每个包在明道云中是否有关联的目标包
   */
  async syncRelationsFromHap(): Promise<{ synced: number }> {
    console.log('[AppComparisonService] 🔄 开始同步关联关系...');

    try {
      // 1. 从 Supabase 获取所有"我的包"（包括 hap_product_row_id）
      const { data: myApps, error: myAppsError } = await (this.supabaseClient as any).client
        .from('app_removal_monitor')
        .select('bundle_id, hap_product_row_id');

      if (myAppsError) {
        throw new Error(`查询我的包失败: ${myAppsError.message}`);
      }

      console.log(`[AppComparisonService] 📦 获取到 ${myApps?.length || 0} 个我的包`);

      // 2. 对于每个"我的包"，查询明道云中是否有目标包关联
      let syncedCount = 0;
      let hasRelationCount = 0;

      for (const myApp of myApps || []) {
        try {
          const bundleId = myApp.bundle_id;
          const myAppRowId = myApp.hap_product_row_id;
          
          if (!myAppRowId) {
            console.log(`[AppComparisonService] ⚠️  ${bundleId} 没有 hap_product_row_id，跳过`);
            continue;
          }
          
          console.log(`[AppComparisonService] 🔍 查询 ${bundleId} (HAP ID: ${myAppRowId}) 的目标包关联...`);

          // 从明道云查询该 Bundle ID 的记录
          const url = `https://api.mingdao.com/v3/app/worksheets/${this.HAP_WORKSHEET_PRODUCTS}/rows/list`;
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'HAP-Appkey': process.env.HAP_APP_KEY || '',
              'HAP-Sign': process.env.HAP_SIGN || '',
            },
            body: JSON.stringify({
              pageSize: 1,
              pageIndex: 1,
              filter: {
                type: 'group',
                logic: 'AND',
                children: [
                  {
                    type: 'condition',
                    field: this.FIELD_IDS.BUNDLE_ID,
                    operator: 'eq',
                    value: bundleId,
                  },
                ],
              },
            }),
          });

          if (!response.ok) {
            console.error(`[AppComparisonService] ⚠️  查询失败 (${bundleId}): HTTP ${response.status}`);
            continue;
          }

          const hapData: any = await response.json();
          const records = hapData.data?.rows || [];

          if (records.length === 0) {
            console.log(`[AppComparisonService] ⚠️  明道云中未找到 ${bundleId}`);
            continue;
          }

          const record = records[0];

          // 获取目标包关联信息
          const targetAppRelation = this.getFieldValue(record, this.FIELD_IDS.TARGET_APP_RELATION);
          
          // 解析目标包关联
          let targetAppHapRowId: string | null = null;
          let relationNote: string | null = null;

          if (targetAppRelation && Array.isArray(targetAppRelation) && targetAppRelation.length > 0) {
            // 关联字段格式: [{ sid: "目标包记录ID", name: "目标包名称", ... }]
            targetAppHapRowId = targetAppRelation[0].sid || null;
            
            // 获取备注（从 Lookup 字段）
            relationNote = this.getFieldValue(record, this.FIELD_IDS.TARGET_APP_NOTE) || null;
            
            hasRelationCount++;
            console.log(`[AppComparisonService] 📎 发现关联: ${bundleId} → 目标包HAP ID: ${targetAppHapRowId}`);
          } else {
            console.log(`[AppComparisonService] ⚪ ${bundleId} 没有关联目标包`);
          }

          // 查找目标包在 Supabase 中的 UUID
          let targetAppId: string | null = null;
          if (targetAppHapRowId) {
            const { data: targetApp } = await (this.supabaseClient as any).client
              .from('target_apps')
              .select('id')
              .eq('hap_row_id', targetAppHapRowId)
              .single();
            
            targetAppId = targetApp?.id || null;
            
            if (!targetAppId) {
              console.log(`[AppComparisonService] 🔄 目标包 ${targetAppHapRowId} 不存在，从明道云按需同步...`);
              
              // 按需同步：自动从明道云获取并同步这个特定的目标包
              try {
                const targetAppRecord = await this.fetchTargetAppFromHap(targetAppHapRowId);
                if (targetAppRecord) {
                  const { data: newTargetApp } = await (this.supabaseClient as any).client
                    .from('target_apps')
                    .insert(targetAppRecord)
                    .select('id')
                    .single();
                  
                  targetAppId = newTargetApp?.id || null;
                  console.log(`[AppComparisonService] ✅ 已同步目标包: ${targetAppId}`);
                }
              } catch (error: any) {
                console.error(`[AppComparisonService] ❌ 按需同步目标包失败:`, error.message);
              }
            }
          }

          // 插入或更新关联关系（即使没有目标包也要插入，target_app_id 为 null）
          const relationData = {
            my_app_bundle_id: bundleId,
            my_app_row_id: myAppRowId,  // 使用从 Supabase 查询的 hap_product_row_id
            target_app_id: targetAppId,
            target_app_hap_row_id: targetAppHapRowId,
            relation_note: relationNote,
            updated_at: new Date().toISOString(),
          };
          
          console.log(`[AppComparisonService] 💾 写入关联: ${bundleId} → ${targetAppId || 'null'}`);
          
          const { error } = await (this.supabaseClient as any).client
            .from('app_target_relations')
            .upsert(relationData, {
              onConflict: 'my_app_bundle_id'
            });

          if (error) {
            console.error(`[AppComparisonService] ⚠️  同步失败 (${bundleId}):`, error.message);
          } else {
            syncedCount++;
            console.log(`[AppComparisonService] ✅ ${bundleId} 同步成功`);
          }
        } catch (error: any) {
          console.error(`[AppComparisonService] ⚠️  处理记录失败:`, error.message);
        }
      }

      console.log(`[AppComparisonService] ✅ 同步完成:`);
      console.log(`  - 我的包总数: ${myApps?.length || 0} 个`);
      console.log(`  - 有目标包的: ${hasRelationCount} 个`);
      console.log(`  - 成功同步: ${syncedCount} 条`);
      return { synced: syncedCount };

    } catch (error: any) {
      console.error('[AppComparisonService] ❌ 同步关联关系失败:', error.message);
      throw error;
    }
  }

  /**
   * 获取关联对比列表
   * JOIN app_removal_monitor, app_target_relations, target_apps 三个表
   * 并从友盟 API 获取今日/昨日新增数据
   */
  async getComparisonList(): Promise<AppComparisonRecord[]> {
    try {
      // 1. 查询我的包数据（增加 limit，默认 1000 条不够）
      const { data: myApps, error: myAppsError } = await (this.supabaseClient as any).client
        .from('app_removal_monitor')
        .select('*')
        .order('last_checked_at', { ascending: false })
        .limit(5000);  // 增加查询限制到 5000 条

      if (myAppsError) {
        throw new Error(`查询我的包失败: ${myAppsError.message}`);
      }

      // 2. 查询关联关系（增加 limit，默认 1000 条不够）
      const { data: relations, error: relationsError } = await (this.supabaseClient as any).client
        .from('app_target_relations')
        .select('*')
        .limit(5000);  // 增加查询限制到 5000 条

      if (relationsError) {
        throw new Error(`查询关联关系失败: ${relationsError.message}`);
      }

      console.log(`[AppComparisonService] 📊 查询到 ${relations?.length || 0} 条关联关系`);

      // 3. 查询目标包数据（增加 limit，默认 1000 条不够）
      const { data: targetApps, error: targetAppsError } = await (this.supabaseClient as any).client
        .from('target_apps')
        .select('*')
        .limit(5000);  // 增加查询限制到 5000 条

      if (targetAppsError) {
        throw new Error(`查询目标包失败: ${targetAppsError.message}`);
      }

      // 4. 收集友盟 ID（优先使用表中数据，降级查询明道云）
      console.log('[AppComparisonService] 🔄 收集友盟 ID...');
      const bundleToUmengId: Record<string, string> = {};
      const bundlesNeedFetch: string[] = [];
      
      // 优先使用 Supabase 中已有的 umeng_id
      for (const myApp of myApps || []) {
        if (myApp.umeng_id) {
          bundleToUmengId[myApp.bundle_id] = myApp.umeng_id;
        } else {
          bundlesNeedFetch.push(myApp.bundle_id);
        }
      }
      
      console.log(`[AppComparisonService] ✅ 从 Supabase 获取 ${Object.keys(bundleToUmengId).length} 个友盟 ID`);
      
      // 降级：从明道云获取缺失的友盟 ID
      if (bundlesNeedFetch.length > 0) {
        console.log(`[AppComparisonService] 🔄 从明道云补充 ${bundlesNeedFetch.length} 个缺失的友盟 ID...`);
        const fetchedUmengIds = await this.fetchUmengIdsFromHap(bundlesNeedFetch);
        Object.assign(bundleToUmengId, fetchedUmengIds);
        
        // 将查到的友盟 ID 回写到 Supabase（异步，不阻塞）
        if (Object.keys(fetchedUmengIds).length > 0) {
          this.writeBackUmengIds(fetchedUmengIds).catch(err => {
            console.error('[AppComparisonService] ⚠️  回写友盟 ID 失败:', err.message);
          });
        }
      }

      // 5. 批量获取友盟新增数据
      const umengIds = Array.from(new Set(Object.values(bundleToUmengId).filter(id => id)));
      console.log(`[AppComparisonService] 📦 准备获取 ${umengIds.length} 个应用的友盟数据`);
      
      const umengDataMap = umengIds.length > 0 
        ? await this.umengClient.batchGetNewUsersData(umengIds)
        : new Map();

      // 6. 组装关联对比数据
      const records: AppComparisonRecord[] = [];

      for (const myApp of myApps || []) {
        // 查找关联关系
        const relation = relations?.find((r: any) => r.my_app_bundle_id === myApp.bundle_id);
        
        // 查找目标包
        let targetApp: any = null;
        if (relation?.target_app_id) {
          targetApp = targetApps?.find((t: any) => t.id === relation.target_app_id);
          // 只在找不到目标包时打印警告
          if (!targetApp) {
            console.log(`[AppComparisonService] ⚠️  未找到目标包: relation.target_app_id=${relation.target_app_id}`);
          }
        }

        // 获取友盟数据
        const umengId = bundleToUmengId[myApp.bundle_id];
        const umengData = umengId ? umengDataMap.get(umengId) : undefined;

        // 组装记录
        records.push({
          myApp: {
            bundleId: myApp.bundle_id,
            appName: myApp.app_name,
            appId: myApp.app_store_id || '',
            accountName: myApp.apple_account_name || '未知',
            accountEmail: myApp.apple_account_id || '',
            status: myApp.current_status as AppStatus,
            lastChecked: myApp.last_checked_at || myApp.created_at,
            umengId: umengId || undefined,
            isClearKeyword: myApp.is_clear_keyword || false,  // 清词状态（7.0 版本新增）
            isClearRank: myApp.is_clear_rank || false,        // 清榜状态（7.0 版本新增）
          },
          targetApp: targetApp ? {
            appId: targetApp.app_id,
            appName: targetApp.app_name,
            note: relation?.relation_note || '',
            status: this.getTargetAppStatus(targetApp),
            isOffline: targetApp.is_offline || false,
            offlineDate: targetApp.offline_date || undefined,
            qimaiLink: targetApp.qimai_link || undefined,
          } : null,
          todayNew: umengData?.todayNew ?? null,
          yesterdayNew: umengData?.yesterdayNew ?? null,
          umengAppName: umengData?.appName ?? null,  // 友盟应用名称
          keywordSearchUrl: targetApp?.keyword_search_link || '',
          qimaiUrl: myApp.qimai_url || '',  // 使用我的包的七麦链接
          appStoreUrl: targetApp?.app_store_url || '',
          // 优先使用数据库中的友盟数据链接，如果没有则拼接默认链接
          umengDataUrl: myApp.umeng_data_url || (umengId ? `https://mobile.umeng.com/apps/${umengId}/reports/trend_analysis` : undefined),
        });
      }

      console.log(`[AppComparisonService] ✅ 组装完成: ${records.length} 条记录`);
      return records;

    } catch (error: any) {
      console.error('[AppComparisonService] ❌ 查询失败:', error.message);
      throw error;
    }
  }

  /**
   * 从明道云获取指定 Bundle ID 的友盟 ID（降级逻辑）
   */
  private async fetchUmengIdsFromHap(bundleIds: string[]): Promise<Record<string, string>> {
    const result: Record<string, string> = {};

    if (bundleIds.length === 0) {
      return result;
    }

    try {
      // 批量查询明道云
      const url = `https://api.mingdao.com/v3/app/worksheets/${this.HAP_WORKSHEET_PRODUCTS}/rows/list`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'HAP-Appkey': process.env.HAP_APP_KEY || '',
          'HAP-Sign': process.env.HAP_SIGN || '',
        },
        body: JSON.stringify({
          pageSize: 1000,
          pageIndex: 1,
          filter: {
            type: 'group',
            logic: 'AND',
            children: [
              {
                type: 'condition',
                field: this.FIELD_IDS.BUNDLE_ID,
                operator: 'in',
                value: bundleIds,
              },
            ],
          },
        }),
      });

      if (!response.ok) {
        console.error(`[AppComparisonService] ⚠️  查询明道云失败: HTTP ${response.status}`);
        return result;
      }

      const hapData: any = await response.json();
      const records = hapData.data?.rows || [];

      // 构建映射
      for (const record of records) {
        const bundleId = this.getFieldValue(record, this.FIELD_IDS.BUNDLE_ID);
        const umengId = this.getFieldValue(record, this.FIELD_IDS.UMENG_ID);

        if (bundleId && umengId) {
          result[bundleId] = umengId;
        }
      }

      console.log(`[AppComparisonService] ✅ 从明道云补充 ${Object.keys(result).length} 个友盟 ID`);
      return result;

    } catch (error: any) {
      console.error('[AppComparisonService] ❌ 从明道云获取友盟 ID 失败:', error.message);
      return result;
    }
  }

  /**
   * 将友盟 ID 回写到 Supabase（异步，不阻塞）
   */
  private async writeBackUmengIds(bundleToUmengId: Record<string, string>): Promise<void> {
    try {
      console.log(`[AppComparisonService] 💾 回写 ${Object.keys(bundleToUmengId).length} 个友盟 ID 到 Supabase...`);
      
      for (const [bundleId, umengId] of Object.entries(bundleToUmengId)) {
        const { error } = await (this.supabaseClient as any).client
          .from('app_removal_monitor')
          .update({ umeng_id: umengId })
          .eq('bundle_id', bundleId);
        
        if (error) {
          console.error(`[AppComparisonService] ⚠️  回写失败 (${bundleId}):`, error.message);
        }
      }
      
      console.log(`[AppComparisonService] ✅ 友盟 ID 回写完成`);
    } catch (error: any) {
      console.error('[AppComparisonService] ❌ 回写友盟 ID 失败:', error.message);
    }
  }

  /**
   * 获取统计数据
   */
  async getStats(): Promise<AppComparisonStats> {
    try {
      const records = await this.getComparisonList();

      const stats: AppComparisonStats = {
        myAppTotal: records.length,
        myAppAvailable: records.filter(r => r.myApp.status === AppStatus.AVAILABLE).length,
        myAppRemoved: records.filter(r => r.myApp.status === AppStatus.REMOVED).length,
        linkedCount: records.filter(r => r.targetApp !== null).length,
        targetAppAvailable: records.filter(r => r.targetApp && !r.targetApp.isOffline).length,
        targetAppRemoved: records.filter(r => r.targetApp && r.targetApp.isOffline).length,
      };

      return stats;

    } catch (error: any) {
      console.error('[AppComparisonService] ❌ 统计失败:', error.message);
      throw error;
    }
  }

  /**
   * 刷新单行数据（我的包 + 目标包）
   * 调用现有的 AppRemovalMonitor 和 TargetAppMonitorService
   */
  async refreshRow(bundleId: string): Promise<void> {
    console.log(`[AppComparisonService] 🔄 刷新行数据: ${bundleId}`);

    try {
      // 1. 刷新我的包状态
      // 这里需要调用 AppRemovalMonitor.checkSingleApp()
      // 由于 AppRemovalMonitor 是独立服务，我们通过 Supabase 触发更新
      // 实际检查逻辑在 server.ts 中调用

      // 2. 查找关联的目标包
      const { data: relation } = await (this.supabaseClient as any).client
        .from('app_target_relations')
        .select('target_app_id')
        .eq('my_app_bundle_id', bundleId)
        .single();

      if (relation?.target_app_id) {
        // 3. 刷新目标包状态
        // 同样通过 server.ts 中的逻辑调用
        console.log(`[AppComparisonService] 🔄 需要刷新关联的目标包: ${relation.target_app_id}`);
      }

      console.log(`[AppComparisonService] ✅ 刷新完成: ${bundleId}`);

    } catch (error: any) {
      console.error(`[AppComparisonService] ❌ 刷新失败 (${bundleId}):`, error.message);
      throw error;
    }
  }

  /**
   * 批量检查所有包
   */
  async checkAllApps(): Promise<{ checked: number }> {
    console.log('[AppComparisonService] 🔄 批量检查所有包...');

    try {
      const records = await this.getComparisonList();
      
      // 实际的检查逻辑在 server.ts 中调用 AppRemovalMonitor 和 TargetAppMonitorService
      // 这里只返回需要检查的数量
      
      console.log(`[AppComparisonService] ✅ 需要检查 ${records.length} 个包`);
      return { checked: records.length };

    } catch (error: any) {
      console.error('[AppComparisonService] ❌ 批量检查失败:', error.message);
      throw error;
    }
  }

  // ==================== 辅助方法 ====================

  /**
   * 从明道云记录中获取字段值
   */
  private getFieldValue(record: any, fieldId: string): any {
    if (!record || !fieldId) return null;
    return record[fieldId] || null;
  }

  /**
   * 获取目标包状态描述（支持组合状态）
   */
  private getTargetAppStatus(targetApp: any): string {
    const statuses: string[] = [];
    
    // 基础状态：在架/下架
    if (targetApp.current_status === 'removed' || targetApp.is_offline) {
      statuses.push('下架');
    } else {
      statuses.push('在架');
    }
    
    // 附加状态：清词、清榜
    if (targetApp.is_clear_keyword) {
      statuses.push('清词');
    }
    if (targetApp.is_clear_rank) {
      statuses.push('清榜');
    }
    
    // 如果只有"在架"状态，直接返回
    if (statuses.length === 1 && statuses[0] === '在架') {
      return '在架';
    }
    
    // 组合多个状态，用 " + " 连接
    return statuses.join(' + ');
  }

  /**
   * 单独同步某一条记录的关联关系（使用 bundle_id 查询明道云）
   */
  async syncSingleRelation(bundleId: string): Promise<{ success: boolean; message: string }> {
    try {
      console.log(`[AppComparisonService] 🔄 开始单独同步: ${bundleId}`);

      // 1. 查询我的包信息（确保在 Supabase 中存在）
      console.log(`[AppComparisonService] 📍 步骤1: 查询 Supabase 中的 ${bundleId} 信息...`);
      const { data: myApp, error: myAppError } = await (this.supabaseClient as any).client
        .from('app_removal_monitor')
        .select('*')
        .eq('bundle_id', bundleId)
        .single();

      if (myAppError) {
        console.error(`[AppComparisonService] ❌ Supabase 查询错误:`, myAppError);
        throw new Error(`查询 Bundle ID 失败: ${myAppError.message}`);
      }

      if (!myApp) {
        console.error(`[AppComparisonService] ❌ 未找到 Bundle ID: ${bundleId}`);
        throw new Error(`未找到 Bundle ID: ${bundleId}`);
      }

      console.log(`[AppComparisonService] ✅ 找到应用:`, {
        bundleId: myApp.bundle_id,
        appName: myApp.app_name,
        hapProductRowId: myApp.hap_product_row_id
      });

      // 2. 从明道云查询这个包的目标包关联（使用 bundle_id 过滤）
      console.log(`[AppComparisonService] 📍 步骤2: 从明道云查询 ${bundleId} 的目标包关联...`);
      
      const hapAppKey = process.env.HAP_APP_KEY || '';
      const hapSign = process.env.HAP_SIGN || '';
      
      if (!hapAppKey || !hapSign) {
        console.error(`[AppComparisonService] ❌ 环境变量未设置`);
        throw new Error('HAP_APP_KEY 或 HAP_SIGN 环境变量未设置');
      }
      
      console.log(`[AppComparisonService] 🔑 使用认证: AppKey=${hapAppKey.substring(0, 8)}..., Sign=${hapSign.substring(0, 8)}...`);
      console.log(`[AppComparisonService] 🔑 Worksheet ID: ${this.HAP_WORKSHEET_PRODUCTS}`);
      console.log(`[AppComparisonService] 🔑 Bundle ID 字段: ${this.FIELD_IDS.BUNDLE_ID}`);
      
      const url = `https://api.mingdao.com/v3/app/worksheets/${this.HAP_WORKSHEET_PRODUCTS}/rows/list`;
      const requestBody = {
        pageSize: 1,
        pageIndex: 1,
        filter: {
          type: 'group',
          logic: 'AND',
          children: [
            {
              type: 'condition',
              field: this.FIELD_IDS.BUNDLE_ID,
              operator: 'eq',
              value: bundleId,
            },
          ],
        },
      };
      
      console.log(`[AppComparisonService] 📤 请求 URL: ${url}`);
      console.log(`[AppComparisonService] 📤 请求体:`, JSON.stringify(requestBody, null, 2));
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'HAP-Appkey': hapAppKey,
          'HAP-Sign': hapSign,
        },
        body: JSON.stringify(requestBody),
      });
      
      console.log(`[AppComparisonService] 📥 响应状态码: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[AppComparisonService] ❌ 明道云 API 错误响应 (${response.status}):`, errorText.substring(0, 500));
        throw new Error(`查询明道云失败: HTTP ${response.status}`);
      }

      const responseText = await response.text();
      console.log(`[AppComparisonService] 📥 响应内容长度: ${responseText.length} 字符`);
      console.log(`[AppComparisonService] 📥 响应内容前500字符:`, responseText.substring(0, 500));
      
      let hapData: any;
      try {
        hapData = JSON.parse(responseText);
        console.log(`[AppComparisonService] ✅ 成功解析 JSON 响应`);
      } catch (e) {
        console.error(`[AppComparisonService] ❌ 明道云返回的不是 JSON:`, responseText.substring(0, 500));
        throw new Error(`明道云返回的不是有效的 JSON 数据，可能是认证失败`);
      }
      
      console.log(`[AppComparisonService] 📊 明道云响应结构:`, {
        hasData: !!hapData.data,
        hasRows: !!hapData.data?.rows,
        rowCount: hapData.data?.rows?.length || 0
      });
      
      const records = hapData.data?.rows || [];

      if (records.length === 0) {
        console.error(`[AppComparisonService] ❌ 明道云中未找到 ${bundleId}`);
        throw new Error(`明道云中未找到 ${bundleId}`);
      }

      const record = records[0];
      console.log(`[AppComparisonService] ✅ 找到明道云记录，记录 ID: ${record.rowid}`);

      // 获取目标包关联信息
      console.log(`[AppComparisonService] 📍 步骤3: 解析目标包关联信息...`);
      const targetAppRelation = this.getFieldValue(record, this.FIELD_IDS.TARGET_APP_RELATION);
      
      console.log(`[AppComparisonService] 🔍 目标包关联字段值:`, targetAppRelation);
      console.log(`[AppComparisonService] 🔍 目标包关联字段 ID: ${this.FIELD_IDS.TARGET_APP_RELATION}`);
      
      // 解析目标包关联
      let targetAppHapRowId: string | null = null;
      let relationNote: string | null = null;

      if (targetAppRelation && Array.isArray(targetAppRelation) && targetAppRelation.length > 0) {
        // 关联字段格式: [{ sid: "目标包记录ID", name: "目标包名称", ... }]
        targetAppHapRowId = targetAppRelation[0].sid || null;
        
        // 获取备注（从 Lookup 字段）
        relationNote = this.getFieldValue(record, this.FIELD_IDS.TARGET_APP_NOTE) || null;
        
        console.log(`[AppComparisonService] ✅ 发现关联:`, {
          bundleId,
          targetAppHapRowId,
          relationNote
        });
      } else {
        console.log(`[AppComparisonService] ⚪ ${bundleId} 没有关联目标包`);
        
        // 删除可能存在的旧关联
        const { error: deleteError } = await (this.supabaseClient as any).client
          .from('app_target_relations')
          .delete()
          .eq('my_app_bundle_id', bundleId);

        if (deleteError) {
          console.error(`[AppComparisonService] ⚠️  删除旧关联失败:`, deleteError);
        } else {
          console.log(`[AppComparisonService] 🗑️  已删除旧关联（如果存在）`);
        }

        return { success: true, message: '该应用未关联目标包' };
      }

      // 3. 查找或同步目标包
      console.log(`[AppComparisonService] 📍 步骤4: 查找或同步目标包...`);
      let targetAppId: string | null = null;
      if (targetAppHapRowId) {
        console.log(`[AppComparisonService] 🔍 在 Supabase 中查找目标包: ${targetAppHapRowId}`);
        const { data: targetApp, error: targetAppError } = await (this.supabaseClient as any).client
          .from('target_apps')
          .select('id, app_name')
          .eq('hap_row_id', targetAppHapRowId)
          .single();
        
        if (targetAppError && targetAppError.code !== 'PGRST116') {
          console.error(`[AppComparisonService] ❌ 查询目标包失败:`, targetAppError);
        }
        
        targetAppId = targetApp?.id || null;
        
        if (targetAppId) {
          console.log(`[AppComparisonService] ✅ 找到目标包:`, {
            id: targetAppId,
            appName: targetApp.app_name,
            hapRowId: targetAppHapRowId
          });
        } else {
          console.log(`[AppComparisonService] 🔄 目标包 ${targetAppHapRowId} 不存在，从明道云按需同步...`);
          
          // 按需同步：自动从明道云获取并同步这个特定的目标包
          try {
            const targetAppRecord = await this.fetchTargetAppFromHap(targetAppHapRowId);
            if (targetAppRecord) {
              console.log(`[AppComparisonService] 💾 插入目标包记录:`, {
                appName: targetAppRecord.app_name,
                appId: targetAppRecord.app_id
              });
              
              const { data: newTargetApp, error: insertError } = await (this.supabaseClient as any).client
                .from('target_apps')
                .insert(targetAppRecord)
                .select('id')
                .single();
              
              if (insertError) {
                console.error(`[AppComparisonService] ❌ 插入目标包失败:`, insertError);
                throw new Error(`插入目标包失败: ${insertError.message}`);
              }
              
              targetAppId = newTargetApp?.id || null;
              console.log(`[AppComparisonService] ✅ 已同步目标包: ${targetAppId}`);
            } else {
              console.error(`[AppComparisonService] ❌ 从明道云获取目标包返回空`);
              throw new Error('从明道云获取目标包失败');
            }
          } catch (error: any) {
            console.error(`[AppComparisonService] ❌ 按需同步目标包失败:`, error);
            throw new Error(`同步目标包失败: ${error.message}`);
          }
        }
      }

      // 4. 建立/更新关联关系
      console.log(`[AppComparisonService] 📍 步骤5: 建立/更新关联关系...`);
      const relationData = {
        my_app_bundle_id: bundleId,
        my_app_row_id: myApp.hap_product_row_id,
        target_app_id: targetAppId,
        target_app_hap_row_id: targetAppHapRowId,
        relation_note: relationNote,
        updated_at: new Date().toISOString(),
      };
      
      console.log(`[AppComparisonService] 💾 关联数据:`, relationData);
      
      const { error } = await (this.supabaseClient as any).client
        .from('app_target_relations')
        .upsert(relationData, {
          onConflict: 'my_app_bundle_id',
        });

      if (error) {
        console.error(`[AppComparisonService] ❌ 建立关联关系失败:`, error);
        throw new Error(`建立关联关系失败: ${error.message}`);
      }

      console.log(`[AppComparisonService] ✅ ${bundleId} 关联同步完成！`);
      return { success: true, message: '同步成功' };

    } catch (error: any) {
      console.error(`[AppComparisonService] ❌ 单独同步失败:`, error);
      console.error(`[AppComparisonService] ❌ 错误堆栈:`, error.stack);
      throw error;
    }
  }

  /**
   * 从明道云按需获取单个目标包记录
   */
  private async fetchTargetAppFromHap(hapRowId: string): Promise<any | null> {
    const HAP_WORKSHEET_TARGET_APPS = '6436b372ca1784f12b3a4a91'; // 目标包表 ID
    
    // 字段 ID 映射（与 target-app-monitor.ts 保持一致）
    const FIELD_IDS = {
      appName: 'mbbmc',           // 目标包名称
      appId: 'appid',             // appid
      appStoreLink: 'appstorelj', // appstore链接
      qimaiLink: 'qmlj',          // 七麦链接
      keywordSearchLink: 'ddcxlj', // 关键词查询链接
      isMonitoring: '68463c3a2d40df3ff99fcac5',  // 监控
      isOffline: '663f424caf568575fcc2d0c5',     // 下架
      offlineDate: '67e2500e867bf63841fe7265',   // 下架日期
      isClearKeyword: 'mbbyxj',                  // 清词
      isClearRank: '694aa701a87445aaca8d9aa8',   // 清榜
      source: '6853b81b0e080d3c9fdbc710',        // 来源
      sourceScreenshot: '6853b81b0e080d3c9fdbc711', // 来源截图
      remark: 'beizhu',           // 备注
    };

    try {
      const url = `https://api.mingdao.com/v3/app/worksheets/${HAP_WORKSHEET_TARGET_APPS}/rows/get`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'HAP-Appkey': process.env.HAP_APP_KEY || '',
          'HAP-Sign': process.env.HAP_SIGN || '',
        },
        body: JSON.stringify({
          row_id: hapRowId,
        }),
      });

      if (!response.ok) {
        console.error(`[AppComparisonService] ⚠️  明道云 API 请求失败: HTTP ${response.status}`);
        return null;
      }
      
      const data: any = await response.json();
      if (!data) return null;

      const now = new Date().toISOString();

      // 转换为 Supabase 格式（与 target-app-monitor.ts 保持一致）
      const targetAppRecord: any = {
        hap_row_id: hapRowId,
        app_name: data[FIELD_IDS.appName] || '未命名',
        app_id: data[FIELD_IDS.appId] || null,
        app_store_link: data[FIELD_IDS.appStoreLink] || null,
        qimai_link: data[FIELD_IDS.qimaiLink] || null,
        keyword_search_link: data[FIELD_IDS.keywordSearchLink] || null,
        is_monitoring: data[FIELD_IDS.isMonitoring] === 1 || data[FIELD_IDS.isMonitoring] === '1' || data[FIELD_IDS.isMonitoring] === true,
        is_clear_keyword: data[FIELD_IDS.isClearKeyword] === 1 || data[FIELD_IDS.isClearKeyword] === '1' || data[FIELD_IDS.isClearKeyword] === true,
        is_clear_rank: data[FIELD_IDS.isClearRank] === 1 || data[FIELD_IDS.isClearRank] === '1' || data[FIELD_IDS.isClearRank] === true,
        source: data[FIELD_IDS.source] || null,
        remark: data[FIELD_IDS.remark] || null,
        created_at: data.ctime || data._createdAt || now,
        updated_at: data.utime || data._updatedAt || now,
        synced_from_hap_at: now,
      };

      // 🔒 下架状态字段（is_offline、offline_date）由系统自动检查维护，按需同步新记录时也不从明道云读取
      // 清词/清榜状态字段（is_clear_keyword、is_clear_rank）从明道云同步，因为系统无法自动检测
      targetAppRecord.manual_status_override = false; // 新记录默认不锁定

      console.log(`[AppComparisonService] 📝 从明道云获取目标包: ${targetAppRecord.app_name} (${targetAppRecord.app_id})`);
      
      return targetAppRecord;
    } catch (error: any) {
      console.error(`[AppComparisonService] ❌ 从明道云获取目标包失败:`, error.message);
      return null;
    }
  }
}

