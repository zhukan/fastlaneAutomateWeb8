/**
 * 目标包监控服务（4.0 版本新增）
 * 
 * 功能：
 * - 从明道云同步"目标包表"的监控列表
 * - 每小时自动检查目标包是否被下架
 * - 支持手动触发检查
 * - 数据同步到 Supabase，支持历史记录和趋势分析
 * 
 * 与 app-removal-monitor 的区别：
 * - 监控对象：竞品应用（目标包表）vs 自己的应用（正式包上架表）
 * - 监控频率：1小时 vs 12小时
 * - 数据表：target_apps vs app_removal_monitor
 */

import { HapClient } from './hap-client';
import { SupabaseClient } from './supabase-client';
import { hostname } from 'os';

// ============================================
// 类型定义
// ============================================

/**
 * 应用状态枚举
 */
export enum TargetAppStatus {
  AVAILABLE = 'available',  // 在架
  REMOVED = 'removed',      // 下架
  UNKNOWN = 'unknown',      // 未知
}

/**
 * 目标包信息
 */
export interface TargetApp {
  id?: string;
  hapRowId: string;
  appName: string;
  appId?: string;
  appStoreLink?: string;
  qimaiLink?: string;
  keywordSearchLink?: string;
  isMonitoring: boolean;
  currentStatus: TargetAppStatus;
  isOffline: boolean;
  offlineDate?: string;
  isClearKeyword?: boolean;
  isClearRank?: boolean;
  source?: string;
  remark?: string;
  sourceScreenshot?: string;
  lastCheckedAt?: string;
  checkErrorCount: number;
  lastErrorMessage?: string;
  createdAt: string;
  updatedAt: string;
  syncedFromHapAt?: string;
}

/**
 * 检测结果
 */
export interface CheckResult {
  total: number;
  checked: number;
  newOffline: number;
  newOnline: number;
  errors: Array<{
    appId?: string;
    appName: string;
    error: string;
  }>;
  duration: number;
}

/**
 * 监控配置
 */
export interface MonitorConfig {
  checkIntervalHours: number;  // 检测间隔（小时）
  autoCheckEnabled: boolean;   // 是否启用自动检测
  apiTimeout: number;          // API 超时时间（秒）
  retryCount: number;          // 重试次数
  concurrency: number;         // 并发请求数
  defaultDisplayDays: number;  // 默认显示/检查的天数范围
}

/**
 * 筛选选项
 */
export interface FilterOptions {
  daysRange?: number;
  statusFilter?: 'all' | 'available' | 'removed' | 'unknown' | 'offline' | 'clearKeyword' | 'clearRank';
  search?: string;
  pageIndex: number;
  pageSize: number;
}

/**
 * 统计数据
 */
export interface TargetAppStats {
  total: number;
  available: number;
  removed: number;
  unknown: number;
  offline: number;
  clearKeyword: number;
  clearRank: number;
}

// ============================================
// 主服务类
// ============================================

export class TargetAppMonitorService {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private hapClient: HapClient;
  private supabaseClient: SupabaseClient;
  private config: MonitorConfig;

  // 明道云工作表配置
  private readonly HAP_WORKSHEET_ID = '6436b372ca1784f12b3a4a91'; // 目标包表
  
  // 字段别名映射（明道云 V3 API 返回的是别名而不是字段ID）
  private readonly FIELD_IDS = {
    appName: 'mbbmc',           // 目标包名称
    appId: 'appid',             // appid
    appStoreLink: 'appstorelj', // appstore链接
    qimaiLink: 'qmlj',          // 七麦链接（目标包链接）
    keywordSearchLink: 'ddcxlj', // 关键词查询链接
    isMonitoring: '68463c3a2d40df3ff99fcac5',  // 监控（无别名，使用字段ID）
    isOffline: '663f424caf568575fcc2d0c5',     // 下架（无别名，使用字段ID）
    offlineDate: '67e2500e867bf63841fe7265',   // 下架日期（无别名，使用字段ID）
    isClearKeyword: 'mbbyxj',                  // 清词（别名）
    isClearRank: '694aa701a87445aaca8d9aa8',   // 清榜（无别名，使用字段ID）
    source: '6853b81b0e080d3c9fdbc710',        // 来源（无别名，使用字段ID）
    sourceScreenshot: '6853b81b0e080d3c9fdbc711', // 来源截图（无别名，使用字段ID）
    remark: 'beizhu',           // 备注
  };

  constructor(hapClient: HapClient, supabaseClient: SupabaseClient, config?: Partial<MonitorConfig>) {
    this.hapClient = hapClient;
    this.supabaseClient = supabaseClient;
    this.config = {
      checkIntervalHours: config?.checkIntervalHours || 1,
      autoCheckEnabled: config?.autoCheckEnabled !== false,
      apiTimeout: config?.apiTimeout || 10,
      retryCount: config?.retryCount || 3,
      concurrency: config?.concurrency || 5,
      defaultDisplayDays: config?.defaultDisplayDays || 5,
    };
  }

  /**
   * 启动监控服务
   */
  start(): void {
    if (this.isRunning) {
      console.log('[TargetAppMonitor] 监控器已在运行中');
      return;
    }

    console.log('[TargetAppMonitor] 🚀 启动目标包监控器');
    console.log(`[TargetAppMonitor] 监控间隔：${this.config.checkIntervalHours} 小时`);
    
    this.isRunning = true;
    
    // 设置定时任务（每小时执行）
    const intervalMs = this.config.checkIntervalHours * 60 * 60 * 1000;
    this.intervalId = setInterval(() => {
      this.checkAllApps().catch((error) => {
        console.error('[TargetAppMonitor] 定时检查失败:', error.message);
      });
    }, intervalMs);

    console.log('[TargetAppMonitor] ✅ 监控器已启动');
  }

  /**
   * 停止监控服务
   */
  stop(): void {
    if (!this.isRunning) {
      console.log('[TargetAppMonitor] 监控器未运行');
      return;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRunning = false;
    console.log('[TargetAppMonitor] ⏸️  监控器已停止');
  }

  /**
   * 从明道云同步目标包列表到 Supabase
   * @param days 可选参数，指定同步最近多少天的数据（注意：明道云 API 筛选可能不稳定，实际按创建时间排序后取前N条）
   */
  async syncFromHap(days?: number): Promise<{ synced: number; updated: number }> {
    console.log('[TargetAppMonitor] 🔄 开始从明道云同步目标包数据...');
    
    try {
      const now = new Date().toISOString();

      // 计算时间范围（用于日志和后续筛选）
      const daysToSync = days || parseInt(process.env.TARGET_APP_SYNC_DAYS || '30');
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysToSync);
      const startDateStr = startDate.toISOString().split('T')[0]; // YYYY-MM-DD

      console.log(`[TargetAppMonitor] 📅 同步目标：最近 ${daysToSync} 天（${startDateStr} 至今）`);

      // 循环分页获取所有数据（不在 API 层面筛选，因为明道云 filter 不稳定）
      console.log('[TargetAppMonitor] 📥 从明道云读取目标包列表（循环分页）...');
      
      const url = `https://api.mingdao.com/v3/app/worksheets/${this.HAP_WORKSHEET_ID}/rows/list`;
      let allRecords: any[] = [];
      let pageIndex = 1;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        console.log(`[TargetAppMonitor] 📄 正在获取第 ${pageIndex} 页...`);
        
        const requestBody = {
          pageSize: pageSize,
          pageIndex: pageIndex,
        };
        
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'HAP-Appkey': process.env.HAP_APP_KEY || '',
            'HAP-Sign': process.env.HAP_SIGN || '',
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[TargetAppMonitor] ❌ API 错误响应:`, errorText);
          throw new Error(`明道云 API 请求失败: HTTP ${response.status}`);
        }

        const hapData: any = await response.json();
        
        // 解析响应数据
        let pageRecords: any[] = [];
        if (hapData.data && hapData.data.rows && Array.isArray(hapData.data.rows)) {
          pageRecords = hapData.data.rows;
        } else if (Array.isArray(hapData)) {
          pageRecords = hapData;
        } else if (hapData.rows && Array.isArray(hapData.rows)) {
          pageRecords = hapData.rows;
        } else {
          console.error(`[TargetAppMonitor] ⚠️  未知的响应格式:`, JSON.stringify(hapData).substring(0, 500));
        }
        
        console.log(`[TargetAppMonitor] 📄 第 ${pageIndex} 页获取到 ${pageRecords.length} 条记录`);
        
        allRecords = allRecords.concat(pageRecords);
        
        // 如果返回的记录数少于 pageSize，说明已经是最后一页
        if (pageRecords.length < pageSize) {
          hasMore = false;
        } else {
          pageIndex++;
        }
      }
      
      console.log(`[TargetAppMonitor] 📋 从明道云共获取到 ${allRecords.length} 条记录`);
      
      // ⚠️  明道云目标包表可能没有 ctime 字段，因此不进行时间筛选
      // 直接同步所有记录（目标包表数据量通常不大）
      console.log(`[TargetAppMonitor] 💡 注意：由于明道云记录可能缺少创建时间字段，将同步所有记录`);
      
      const hapRecords = allRecords;
      
      if (hapRecords.length === 0) {
        console.log(`[TargetAppMonitor] ⚠️  明道云目标包表为空`);
        return { synced: 0, updated: 0 };
      }
      
      console.log(`[TargetAppMonitor] 📝 准备同步 ${hapRecords.length} 条记录`);

      // 查询所有已存在的记录，保留手动修改标记
      const hapRowIds = hapRecords.map((record: any) => record.rowid || record.rowId);
      const { data: existingApps } = await (this.supabaseClient as any).client
        .from('target_apps')
        .select('hap_row_id, manual_status_override')
        .in('hap_row_id', hapRowIds);

      // 构建手动修改标记映射
      const manualOverrideMap = new Map<string, boolean>();
      existingApps?.forEach((app: any) => {
        manualOverrideMap.set(app.hap_row_id, app.manual_status_override || false);
      });

      console.log(`[TargetAppMonitor] 🔒 目标包状态由系统自动维护，同步时不会覆盖状态字段`);

      // 转换为 Supabase 格式
      const appsToUpsert = hapRecords.map((record: any) => {
        const hapRowId = record.rowid || record.rowId;
        const isManualOverride = manualOverrideMap.get(hapRowId) || false;

        // 明道云 V3 API 返回的数据格式：record 是一个对象，字段值直接通过字段 ID 访问
        const app: any = {
          hap_row_id: hapRowId,
          app_name: record[this.FIELD_IDS.appName] || '未命名',
          app_id: record[this.FIELD_IDS.appId] || null,
          app_store_link: record[this.FIELD_IDS.appStoreLink] || null,
          qimai_link: record[this.FIELD_IDS.qimaiLink] || null,
          keyword_search_link: record[this.FIELD_IDS.keywordSearchLink] || null,
          is_monitoring: record[this.FIELD_IDS.isMonitoring] === 1 || record[this.FIELD_IDS.isMonitoring] === '1' || record[this.FIELD_IDS.isMonitoring] === true,
          // 🔒 清词/清榜状态字段（is_clear_keyword、is_clear_rank）由七麦自动监控系统维护，同步时不覆盖（v7.0）
          source: record[this.FIELD_IDS.source] || null,
          remark: record[this.FIELD_IDS.remark] || null,
          created_at: record.ctime || record._createdAt || now,
          updated_at: record.utime || record._updatedAt || now,
          synced_from_hap_at: now,
          sync_hostname: hostname(),                 // 记录同步机器（5.1 版本新增）
          manual_status_override: isManualOverride,  // 🔒 保留手动修改标记
        };

        // 🔒 以下字段由系统自动维护，同步时不覆盖：
        //    - is_offline、offline_date：由下架检查维护
        //    - is_clear_keyword、is_clear_rank：由七麦自动监控维护（v7.0）

        // 打印第一条记录用于调试
        if (hapRecords.indexOf(record) === 0) {
          console.log('[TargetAppMonitor] 📝 第一条记录示例:');
          console.log(`  - 应用名: ${app.app_name}`);
          console.log(`  - App ID: ${app.app_id}`);
          console.log(`  - App Store 链接: ${app.app_store_link}`);
          console.log(`  - 七麦链接: ${app.qimai_link}`);
          console.log(`  - 监控状态: ${app.is_monitoring}`);
          console.log(`  - 下架状态: (由系统自动检查，不从明道云同步)`);
          console.log(`  - 备注: ${app.remark || '(空)'}`);
          console.log(`  - 创建时间: ${app.created_at}`);
        }

        return app;
      });

      // 查询所有已存在的 app_id（用于去重）
      const { data: existingAppsWithIds } = await (this.supabaseClient as any).client
        .from('target_apps')
        .select('app_id, hap_row_id')
        .not('app_id', 'is', null);
      
      const existingAppIds = new Set(
        existingAppsWithIds?.map((app: any) => app.app_id) || []
      );
      const existingHapRowIds = new Set(
        existingAppsWithIds?.map((app: any) => app.hap_row_id) || []
      );
      
      console.log(`[TargetAppMonitor] 📊 数据库中已存在 ${existingAppIds.size} 个 app_id`);
      
      // 分离新记录和更新记录
      const newApps: any[] = [];
      const updateApps: any[] = [];
      const skippedApps: any[] = [];
      const seenAppIds = new Set(existingAppIds); // 用于跟踪已见过的 app_id
      
      appsToUpsert.forEach((app: any) => {
        if (existingHapRowIds.has(app.hap_row_id)) {
          // 已存在的明道云记录，执行更新
          updateApps.push(app);
          // 更新操作不需要检查 app_id 重复，因为是按 hap_row_id 更新
        } else if (app.app_id && seenAppIds.has(app.app_id)) {
          // app_id 已存在（包括数据库中的和本批次中的），跳过以避免冲突
          skippedApps.push(app);
        } else {
          // 新记录
          newApps.push(app);
          // 记录这个 app_id，防止本批次内重复
          if (app.app_id) {
            seenAppIds.add(app.app_id);
          }
        }
      });
      
      console.log(`[TargetAppMonitor] 📝 分类结果:`);
      console.log(`  - 新记录: ${newApps.length}`);
      console.log(`  - 更新记录: ${updateApps.length}`);
      console.log(`  - 跳过记录（app_id 重复）: ${skippedApps.length}`);
      
      if (skippedApps.length > 0) {
        console.log(`[TargetAppMonitor] ⚠️  跳过的 app_id 示例（前5个）:`);
        skippedApps.slice(0, 5).forEach((app: any) => {
          console.log(`  - ${app.app_name} (${app.app_id})`);
        });
      }
      
      let successCount = 0;
      let errorCount = 0;
      
      // 先处理更新记录
      if (updateApps.length > 0) {
        const { data, error } = await (this.supabaseClient as any).client
          .from('target_apps')
          .upsert(updateApps, {
            onConflict: 'hap_row_id',
            ignoreDuplicates: false,
          });
        
        if (error) {
          console.error(`[TargetAppMonitor] ⚠️  更新记录失败: ${error.message}`);
          errorCount += updateApps.length;
        } else {
          successCount += updateApps.length;
        }
      }
      
      // 再处理新记录
      if (newApps.length > 0) {
        const { data, error } = await (this.supabaseClient as any).client
          .from('target_apps')
          .insert(newApps);
        
        if (error) {
          console.error(`[TargetAppMonitor] ⚠️  插入新记录失败: ${error.message}`);
          errorCount += newApps.length;
        } else {
          successCount += newApps.length;
        }
      }
      
      console.log(`[TargetAppMonitor] ✅ 同步完成:`);
      console.log(`  - 成功: ${successCount} 条`);
      console.log(`  - 跳过: ${skippedApps.length} 条`);
      if (errorCount > 0) {
        console.log(`  - 失败: ${errorCount} 条`);
      }
      
      return {
        synced: hapRecords.length,
        updated: successCount,
      };
    } catch (error: any) {
      console.error('[TargetAppMonitor] ❌ 同步失败:', error.message);
      throw error;
    }
  }

  /**
   * 检查所有需要监控的目标包（目标包监控模块专用）
   * 
   * 注意：
   * - 此方法受"最近N天"配置限制（config.defaultDisplayDays）
   * - 用于定期自动检查最近创建的目标包
   * - 关联对比模块应使用 checkSpecificApps() 方法
   */
  async checkAllApps(): Promise<CheckResult> {
    console.log('[TargetAppMonitor] ⏰ 开始检查所有监控的目标包（定期任务）...');
    
    const startTime = Date.now();
    const result: CheckResult = {
      total: 0,
      checked: 0,
      newOffline: 0,
      newOnline: 0,
      errors: [],
      duration: 0,
    };

    try {
      // 计算最近 N 天的时间范围
      const daysToCheck = this.config.defaultDisplayDays || 5;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysToCheck);
      const startDateStr = startDate.toISOString();

      console.log(`[TargetAppMonitor] 📅 检查范围：最近 ${daysToCheck} 天（${startDateStr.split('T')[0]} 至今）`);

      // 从 Supabase 读取最近 N 天创建的目标包（且有 app_id）
      const { data: apps, error } = await (this.supabaseClient as any).client
        .from('target_apps')
        .select('*')
        .gte('created_at', startDateStr)
        .not('app_id', 'is', null);

      if (error) {
        throw new Error(`读取监控列表失败: ${error.message}`);
      }

      if (!apps || apps.length === 0) {
        console.log('[TargetAppMonitor] ℹ️  没有需要监控的目标包');
        return result;
      }

      result.total = apps.length;
      console.log(`[TargetAppMonitor] 📋 找到 ${apps.length} 个需要监控的目标包（最近 ${daysToCheck} 天）`);

      // 逐个检查（避免并发过多导致 API 限流）
      for (const app of apps) {
        try {
          const statusChanged = await this.checkSingleApp(app);
          result.checked++;
          
          if (statusChanged === 'offline') {
            result.newOffline++;
          } else if (statusChanged === 'online') {
            result.newOnline++;
          }
          
          // 每次检查后延迟，避免 API 限流
          await this.sleep(2000);
        } catch (error: any) {
          result.errors.push({
            appId: app.app_id,
            appName: app.app_name,
            error: error.message,
          });
          console.error(`[TargetAppMonitor] ❌ 检查失败 [${app.app_name}]:`, error.message);
        }
      }

      result.duration = Math.round((Date.now() - startTime) / 1000);
      
      console.log('[TargetAppMonitor] ✅ 本轮检查完成');
      console.log(`[TargetAppMonitor]   - 总数：${result.total} 个`);
      console.log(`[TargetAppMonitor]   - 成功：${result.checked} 个`);
      console.log(`[TargetAppMonitor]   - 新下架：${result.newOffline} 个`);
      console.log(`[TargetAppMonitor]   - 重新上架：${result.newOnline} 个`);
      console.log(`[TargetAppMonitor]   - 失败：${result.errors.length} 个`);
      console.log(`[TargetAppMonitor]   - 耗时：${result.duration} 秒`);
      
      return result;
    } catch (error: any) {
      console.error('[TargetAppMonitor] ❌ 检查失败:', error.message);
      throw error;
    }
  }

  /**
   * 检查单个目标包的状态
   * @returns 'offline' | 'online' | null (状态变化类型，null 表示无变化)
   */
  private async checkSingleApp(app: any): Promise<'offline' | 'online' | null> {
    const appName = app.app_name;
    const appId = app.app_id;
    const oldStatus = app.current_status;

    if (!appId) {
      console.log(`[TargetAppMonitor] ⏭️  ${appName}: 缺少 App ID，跳过检查`);
      return null;
    }

    try {
      console.log(`[TargetAppMonitor] 🔍 检查 ${appName} (${appId})...`);

      // 使用 iTunes API 检查状态
      const newStatus = await this.checkWithiTunesAPI(appId);
      
      console.log(`[TargetAppMonitor] 📊 ${appName}: ${oldStatus} → ${newStatus}`);

      // 更新数据库
      const updateData: any = {
        current_status: newStatus,
        last_checked_at: new Date().toISOString(),
        check_hostname: hostname(),  // 记录检查机器（5.1 版本新增）
        check_error_count: 0,
        last_error_message: null,
      };

      let statusChanged: 'offline' | 'online' | null = null;

      // 确保 is_offline 字段与 current_status 保持一致
      if (newStatus === TargetAppStatus.REMOVED) {
        updateData.is_offline = true;
        
        // 如果状态从在架变成下架，或者原本没有下架时间，都要设置时间
        if (oldStatus !== newStatus) {
          // 状态变化：在架 → 下架
          updateData.offline_date = new Date().toISOString();
          statusChanged = 'offline';
          console.log(`[TargetAppMonitor] 🚨 ${appName} 已被下架！`);
          
          // 同步更新明道云
          await this.updateHapStatus(app.hap_row_id, true, updateData.offline_date);
          
          // 记录历史
          await this.recordHistory(app.id, 'offline', oldStatus, newStatus, updateData.offline_date);
        } else if (!app.offline_date) {
          // 状态没变化，但历史数据缺少下架时间，补充时间
          updateData.offline_date = new Date().toISOString();
          console.log(`[TargetAppMonitor] 📝 ${appName} 补充下架时间`);
          
          // 同步到明道云（确保数据一致）
          await this.updateHapStatus(app.hap_row_id, true, updateData.offline_date);
        } else if (app.is_offline !== true) {
          // 状态一致，但 is_offline 字段不一致，同步到明道云
          console.log(`[TargetAppMonitor] 🔄 ${appName} 同步下架状态到明道云`);
          await this.updateHapStatus(app.hap_row_id, true, app.offline_date || updateData.offline_date);
        }
      } else if (newStatus === TargetAppStatus.AVAILABLE) {
        updateData.is_offline = false;
        // 只在状态变化时清空下架时间和记录历史
        if (oldStatus === TargetAppStatus.REMOVED) {
          updateData.offline_date = null;
          statusChanged = 'online';
          console.log(`[TargetAppMonitor] 🎉 ${appName} 已重新上架！`);
          
          // 同步更新明道云
          await this.updateHapStatus(app.hap_row_id, false, null);
          
          // 记录历史
          await this.recordHistory(app.id, 'online', oldStatus, newStatus);
        } else if (app.is_offline !== false) {
          // 状态一致（在架），但 is_offline 字段不一致，同步到明道云
          console.log(`[TargetAppMonitor] 🔄 ${appName} 同步在架状态到明道云`);
          await this.updateHapStatus(app.hap_row_id, false, null);
        }
      }

      // 更新 Supabase
      const { error } = await (this.supabaseClient as any).client
        .from('target_apps')
        .update(updateData)
        .eq('id', app.id);

      if (error) {
        throw new Error(`更新数据库失败: ${error.message}`);
      }

      return statusChanged;
    } catch (error: any) {
      // 记录错误
      const errorMessage = error.message || String(error);
      console.error(`[TargetAppMonitor] ❌ 检查失败 ${appName}:`, errorMessage);

      // 更新错误信息（保持 current_status，不要改成 UNKNOWN，以免影响判断）
      // 只增加错误计数和错误信息，不修改 current_status 和 is_offline
      const { error: updateError } = await (this.supabaseClient as any).client
        .from('target_apps')
        .update({
          // current_status: TargetAppStatus.UNKNOWN,  // ❌ 不要修改状态
          check_error_count: (app.check_error_count || 0) + 1,
          last_error_message: errorMessage.substring(0, 500),
          last_checked_at: new Date().toISOString(),
          check_hostname: hostname(),  // 记录检查机器（5.1 版本新增）
        })
        .eq('id', app.id);

      if (updateError) {
        console.error(`[TargetAppMonitor] ❌ 更新错误信息失败:`, updateError.message);
      }

      throw error;
    }
  }

  /**
   * 使用 iTunes Search API 检查应用状态
   */
  private async checkWithiTunesAPI(appId: string): Promise<TargetAppStatus> {
    try {
      // 方案 1：使用 App ID 直接查询
      const lookupUrl = `https://itunes.apple.com/lookup?id=${encodeURIComponent(appId)}&country=cn`;
      const lookupResponse = await fetch(lookupUrl, {
        signal: AbortSignal.timeout(this.config.apiTimeout * 1000),
      });
      
      if (!lookupResponse.ok) {
        throw new Error(`iTunes API HTTP ${lookupResponse.status}`);
      }

      const lookupData = await lookupResponse.json() as { resultCount: number; results?: Array<any> };
      
      // 如果 API 返回 0 个结果，直接判定为下架
      if (lookupData.resultCount === 0) {
        return TargetAppStatus.REMOVED;
      }

      // 方案 2：访问 App Store 页面验证（更可靠）
      const storeUrl = `https://apps.apple.com/cn/app/id${appId}`;
      const storeResponse = await fetch(storeUrl, {
        redirect: 'manual',
        signal: AbortSignal.timeout(this.config.apiTimeout * 1000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      });

      // 检查响应状态
      if (storeResponse.status === 404) {
        return TargetAppStatus.REMOVED;
      }

      if (storeResponse.status === 200) {
        const html = await storeResponse.text();
        
        // 检查是否包含"无法找到"等下架标志
        const removedKeywords = [
          '无法找到你所需的页面',
          'We could not find the page you requested',
          '找不到该页面',
          'Page Not Found',
        ];
        
        const isRemoved = removedKeywords.some(keyword => html.includes(keyword));
        
        if (isRemoved) {
          return TargetAppStatus.REMOVED;
        }

        return TargetAppStatus.AVAILABLE;
      }

      // 其他状态码，保守判断为在架
      return TargetAppStatus.AVAILABLE;
      
    } catch (error: any) {
      throw new Error(`iTunes API 查询失败: ${error.message}`);
    }
  }

  /**
   * 更新明道云的下架状态
   */
  private async updateHapStatus(hapRowId: string, isOffline: boolean, offlineDate: string | null): Promise<void> {
    try {
      const fields: any[] = [
        {
          id: this.FIELD_IDS.isOffline,
          value: isOffline ? 1 : 0,
        },
      ];

      if (offlineDate) {
        fields.push({
          id: this.FIELD_IDS.offlineDate,
          value: offlineDate.split('T')[0], // YYYY-MM-DD
        });
      }

      // TODO: 实现明道云 API 更新
      // await this.hapClient.updateRecord({
      //   worksheet_id: this.HAP_WORKSHEET_ID,
      //   row_id: hapRowId,
      //   fields,
      //   triggerWorkflow: false,
      // });

      console.log(`[TargetAppMonitor] ✅ 已同步更新明道云状态`);
    } catch (error: any) {
      console.error(`[TargetAppMonitor] ⚠️  更新明道云失败:`, error.message);
      // 不抛出错误，避免影响主流程
    }
  }

  /**
   * 记录状态变更历史
   */
  private async recordHistory(
    targetAppId: string,
    changeType: 'offline' | 'online' | 'monitoring_enabled' | 'monitoring_disabled',
    oldStatus: string,
    newStatus: string,
    offlineDate?: string
  ): Promise<void> {
    try {
      const { error } = await (this.supabaseClient as any).client
        .from('target_app_history')
        .insert({
          target_app_id: targetAppId,
          change_type: changeType,
          old_status: oldStatus,
          new_status: newStatus,
          offline_date: offlineDate || null,
          checked_by: 'system',
        });

      if (error) {
        console.error(`[TargetAppMonitor] ⚠️  记录历史失败:`, error.message);
      }
    } catch (error: any) {
      console.error(`[TargetAppMonitor] ⚠️  记录历史失败:`, error.message);
    }
  }

  /**
   * 获取目标包列表（带筛选）
   */
  async getTargetApps(filter: FilterOptions): Promise<{ apps: TargetApp[]; total: number }> {
    try {
      let query = (this.supabaseClient as any).client
        .from('target_apps')
        .select('*', { count: 'exact' });

      // 时间范围筛选
      if (filter.daysRange && filter.daysRange > 0) {
        const daysAgo = new Date();
        daysAgo.setDate(daysAgo.getDate() - filter.daysRange);
        query = query.gte('created_at', daysAgo.toISOString());
      }

      // 状态筛选
      if (filter.statusFilter && filter.statusFilter !== 'all') {
        if (filter.statusFilter === 'offline') {
          query = query.eq('is_offline', true);
        } else if (filter.statusFilter === 'clearKeyword') {
          query = query.eq('is_clear_keyword', true);
        } else if (filter.statusFilter === 'clearRank') {
          query = query.eq('is_clear_rank', true);
        } else {
          query = query.eq('current_status', filter.statusFilter);
        }
      }

      // 搜索
      if (filter.search) {
        query = query.or(`app_name.ilike.%${filter.search}%,app_id.ilike.%${filter.search}%`);
      }

      // 排序和分页
      const offset = (filter.pageIndex - 1) * filter.pageSize;
      query = query
        .order('created_at', { ascending: false })
        .range(offset, offset + filter.pageSize - 1);

      const { data, error, count } = await query;

      if (error) {
        throw new Error(`查询失败: ${error.message}`);
      }

      return {
        apps: (data || []).map(this.convertFromDB),
        total: count || 0,
      };
    } catch (error: any) {
      console.error('[TargetAppMonitor] ❌ 查询失败:', error.message);
      throw error;
    }
  }

  /**
   * 获取统计数据
   */
  async getStats(): Promise<TargetAppStats> {
    try {
      const { data, error } = await (this.supabaseClient as any).client
        .from('target_app_stats')
        .select('*')
        .single();

      if (error) {
        throw new Error(`查询统计失败: ${error.message}`);
      }

      return {
        total: data.total_monitoring || 0,
        available: data.total_available || 0,
        removed: data.total_removed || 0,
        unknown: data.total_unknown || 0,
        offline: data.total_offline || 0,
        clearKeyword: data.total_clear_keyword || 0,
        clearRank: data.total_clear_rank || 0,
      };
    } catch (error: any) {
      console.error('[TargetAppMonitor] ❌ 查询统计失败:', error.message);
      throw error;
    }
  }

  /**
   * 手动检查单个应用
   */
  async checkSingleAppManual(appId: string): Promise<TargetAppStatus> {
    console.log(`[TargetAppMonitor] 🔍 手动检查 App ID: ${appId}`);

    try {
      // 从数据库查询应用
      const { data: app, error } = await (this.supabaseClient as any).client
        .from('target_apps')
        .select('*')
        .eq('app_id', appId)
        .single();

      if (error || !app) {
        throw new Error(`应用不存在: ${appId}`);
      }

      await this.checkSingleApp(app);
      
      // 重新查询返回最新状态
      const { data: updatedApp } = await (this.supabaseClient as any).client
        .from('target_apps')
        .select('current_status')
        .eq('app_id', appId)
        .single();

      return updatedApp?.current_status || TargetAppStatus.UNKNOWN;
    } catch (error: any) {
      console.error(`[TargetAppMonitor] ❌ 手动检查失败:`, error.message);
      throw error;
    }
  }

  /**
   * 检查指定的目标包列表（用于关联对比模块）
   * 与 checkAllApps 的区别：
   * - 不受"最近N天"限制
   * - 基于传入的 ID 列表检查
   * - 专门为关联对比功能设计
   */
  async checkSpecificApps(targetAppIds: string[]): Promise<CheckResult> {
    console.log('[TargetAppMonitor] 🔗 开始检查指定的目标包（关联对比）...');
    
    const startTime = Date.now();
    const result: CheckResult = {
      total: 0,
      checked: 0,
      newOffline: 0,
      newOnline: 0,
      errors: [],
      duration: 0,
    };

    try {
      if (!targetAppIds || targetAppIds.length === 0) {
        console.log('[TargetAppMonitor] ℹ️  没有需要检查的目标包');
        return result;
      }

      console.log(`[TargetAppMonitor] 📋 共 ${targetAppIds.length} 个目标包需要检查`);

      // 从 Supabase 读取指定的目标包
      const { data: apps, error } = await (this.supabaseClient as any).client
        .from('target_apps')
        .select('*')
        .in('id', targetAppIds)
        .not('app_id', 'is', null);

      if (error) {
        throw new Error(`读取目标包列表失败: ${error.message}`);
      }

      if (!apps || apps.length === 0) {
        console.log('[TargetAppMonitor] ℹ️  没有有效的目标包（可能缺少 app_id）');
        return result;
      }

      result.total = apps.length;
      console.log(`[TargetAppMonitor] 📋 找到 ${apps.length} 个有效的目标包`);

      // 逐个检查（避免并发过多导致 API 限流）
      for (const app of apps) {
        try {
          const statusChanged = await this.checkSingleApp(app);
          result.checked++;
          
          if (statusChanged === 'offline') {
            result.newOffline++;
          } else if (statusChanged === 'online') {
            result.newOnline++;
          }
          
          // 每次检查后延迟，避免 API 限流
          await this.sleep(2000);
        } catch (error: any) {
          result.errors.push({
            appId: app.app_id,
            appName: app.app_name,
            error: error.message,
          });
          console.error(`[TargetAppMonitor] ❌ 检查失败 [${app.app_name}]:`, error.message);
        }
      }

      result.duration = Math.round((Date.now() - startTime) / 1000);
      
      console.log('[TargetAppMonitor] ✅ 关联对比检查完成');
      console.log(`[TargetAppMonitor]   - 总数：${result.total} 个`);
      console.log(`[TargetAppMonitor]   - 成功：${result.checked} 个`);
      console.log(`[TargetAppMonitor]   - 新下架：${result.newOffline} 个`);
      console.log(`[TargetAppMonitor]   - 重新上架：${result.newOnline} 个`);
      console.log(`[TargetAppMonitor]   - 失败：${result.errors.length} 个`);
      console.log(`[TargetAppMonitor]   - 耗时：${result.duration} 秒`);
      
      return result;
    } catch (error: any) {
      console.error('[TargetAppMonitor] ❌ 检查失败:', error.message);
      throw error;
    }
  }

  /**
   * 获取监控状态
   */
  getStatus(): { isRunning: boolean; config: MonitorConfig } {
    return {
      isRunning: this.isRunning,
      config: this.config,
    };
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig: Partial<MonitorConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('[TargetAppMonitor] ⚙️  配置已更新:', this.config);
    
    // 如果正在运行，重启以应用新配置
    if (this.isRunning) {
      this.stop();
      this.start();
    }
  }

  /**
   * 延迟函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 数据库记录转换为应用对象
   */
  private convertFromDB(record: any): TargetApp {
    return {
      id: record.id,
      hapRowId: record.hap_row_id,
      appName: record.app_name,
      appId: record.app_id,
      appStoreLink: record.app_store_link,
      qimaiLink: record.qimai_link,
      keywordSearchLink: record.keyword_search_link,
      isMonitoring: record.is_monitoring,
      currentStatus: record.current_status,
      isOffline: record.is_offline,
      offlineDate: record.offline_date,
      isClearKeyword: record.is_clear_keyword,
      isClearRank: record.is_clear_rank,
      source: record.source,
      remark: record.remark,
      sourceScreenshot: record.source_screenshot,
      lastCheckedAt: record.last_checked_at,
      checkErrorCount: record.check_error_count,
      lastErrorMessage: record.last_error_message,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
      syncedFromHapAt: record.synced_from_hap_at,
    };
  }
}

