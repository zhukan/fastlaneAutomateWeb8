/**
 * 下架排查服务
 * 
 * 功能：
 * 1. 从明道云同步已下架App的完整操作记录
 * 2. 提供时间线视图查询接口
 * 3. 支持自动和手动数据同步
 * 
 * 版本：6.0
 * 创建日期：2025-12-31
 */

import { HapClient, APP_STATUS_KEYS } from './hap-client';
import { SupabaseClient } from './supabase-client';
import { hostname } from 'os';

// ==================== 接口定义 ====================

/**
 * 下架App信息
 */
export interface RemovedApp {
  id: string;
  bundleId: string;
  appName: string;
  appId: string | null;
  accountName: string | null;
  removalTime: string | null;
  totalOperations: number;
  firstReleaseTime: string | null;
  lastUpdateTime: string | null;
  survivalDays: number | null;
  keywordSearchUrl: string | null;  // ⭐ 关键词查询链接
  targetPackageUrl: string | null;  // ⭐ 目标包链接
  qimaiUrl: string | null;          // ⭐ 七麦链接
  createdAt: string;
  updatedAt: string;
}

/**
 * 操作记录（时间线事件）
 */
export interface OperationRecord {
  id: string;
  bundleId: string;
  operationType: 'RELEASE' | 'UPDATE';
  operationTime: string;
  appName: string | null;
  version: string | null;
  adVersion: string | null;
  operator: string | null;
  location: string | null;
  status: string | null;
  releaseType: string | null;
  remarks: string | null;
  hapSourceTable: 'production_release' | 'update_task';
}

/**
 * 同步结果
 */
export interface SyncResult {
  success: boolean;
  syncLogId: string;
  stats: {
    totalRemovedApps: number;
    syncedApps: number;
    newApps: number;
    updatedApps: number;
    totalOperations: number;
    newOperations: number;
    totalAccounts: number;
    newAccounts: number;
  };
  durationSeconds: number;
  error?: string;
}

/**
 * 同步状态
 */
export interface SyncStatus {
  lastSyncTime: string | null;
  isRunning: boolean;
  lastSyncStatus: 'COMPLETED' | 'FAILED' | 'IN_PROGRESS' | null;
  lastSyncStats: any | null;
}

// ==================== 服务类 ====================

export class AppRemovalInvestigationService {
  // 明道云字段 ID（来自 PRD6.0.md）
  private readonly FIELD_IDS = {
    // 账号上的产品表 (643418197f0301fb51750f00)
    PRODUCTS: {
      APP_NAME: '64341ac46d6df8983a7f7af3',
      BUNDLE_ID: '64b3a82fa75368cd24c99d8d',
      APP_ID: '643418197f0301fb51750f02',
      ACCOUNT: '64341940fa601169896433f6',           // 关联字段
      ACCOUNT_NAME: '64369d9b05108c17907e6a00',      // Lookup
      APP_STATUS: '64366ef856462b8747391a08',
      REMOVAL_TIME: '645c67ec7861415e0edf3565',
      KEYWORD_SEARCH_URL: '650b048db57c0312e55e7a4c',  // ⭐ 关键词查询链接
      TARGET_PACKAGE_URL: '664c223a0b1a039a5fb30000',  // ⭐ 目标包链接
      QIMAI_URL: '65388cadea09c5df35ec81c6',          // ⭐ 七麦链接
    },
    
    // App生产发布表 (65612ddfc96f80bfabe5df2e) - 在App工厂应用下
    PRODUCTION: {
      BUNDLE_ID: '64b168be624fef0d46c1105b',
      APP_NAME: '64b168be624fef0d46c11058',
      VERSION: '64b168be624fef0d46c11068',
      AD_VERSION: '6655a94ca87340a9754f7c41',         // ⭐ 广告代码版本
      OPERATOR: '6810850325726172e2468246',           // ⭐ 生产人
      LOCATION: '64cdf3e1784014033c3348d8',           // ⭐ 发布地点
      RELEASE_TIME: '64b168be624fef0d46c1106b',
      FIRST_SUBMIT_TIME: '64b168be624fef0d46c1106e',
      RELEASE_PERSON: '64b3ead57658fd2098b7e311',
      STATUS: '64b168be624fef0d46c11054',
      RELEASE_TYPE: '64b168be624fef0d46c11055',
      DEVELOPER_ACCOUNT: '64b168be624fef0d46c1105d',
      DEBUG_COMPLETE_TIME: '64b3effda75368cd24c9b97c',
      PACKAGE_UPLOAD_TIME: '64b3effda75368cd24c9b97d',
      REMARKS: '64b168be624fef0d46c11069',
    },
    
    // App更新任务表 (640ab32a56058b3df8803af2) - 在二维奇智应用下
    UPDATE: {
      TASK_NAME: '64097218d867a5c9c89b043b',          // 标题字段
      PRODUCT_RELATION: '6437343d6e173a52dea04494',   // 关联到"账号上的产品"
      VERSION: '641f033f5815faac860d15de',            // ⭐ 版本号
      AD_VERSION: '6943850dee1f6a984701555f',         // ⭐ 广告代码版本（正确的字段ID）
      RELEASE_PERSON: '64366cddcb42afb8b5e79583',
      RELEASE_STATUS: '6436a3aa56462b8747397762',
      SUBMIT_TIME: '641ee11b56350b78574cf7c1',
      DEBUG_COMPLETE_TIME: '641ee11b56350b78574cf7c0',
      PACKAGE_UPLOAD_TIME: '6420f9639c0aa3e8b33d0f63',
      REMARKS: '6415a35b543f450698f389a9',
      RELEASE_TYPE: '643741df6e173a52dea04836',
      RELEASE_LOCATION: '681c60e03847f34d19aeb44c',    // 发布地点
    },
    
    // 苹果开发者账号表 (640adea9c04c8d453ff1ce52)
    ACCOUNTS: {
      ACCOUNT_EMAIL: '640adea9c04c8d453ff1ce53',          // 邮箱
      ACCOUNT_STATUS: '6432921f1a26322d585e393b',         // 账号状态 ⭐
      ACCOUNT_SOURCE: '6435534e05108c17907c9766',         // 账号来源（Relation）⭐⭐
      ACCOUNT_SOURCE_NAME: '64f0050bfe6380ec34433b31',    // 账号来源名称（Lookup）⭐⭐
      ACCOUNT_EXPIRY_DATE: '6502c1411329a664bacf97d1',    // 账号到期时间
      ACCOUNT_CLOSED_DATE: '652f23b6b2073276dba1975b',    // 账号关停时间（苹果官方）
      PENDING_CLOSE_DATE: '658b7fe0e86fbf3934eb63ad',     // 标记为等待关停时间（业务关停时间）⭐⭐⭐ 优先使用
      ACCOUNT_REGION: '6642e102a048b0f22a27df53',         // 注册地
      ACCOUNT_QUALITY: '6539fe639c47bf4d041672be',        // 账号质量标记 ⭐⭐
      ACCOUNT_PRODUCT_COUNT: '657eb6aa8d3800f9a1b01c13',  // 账号上的产品数量
      REGISTRATION_DATE: '6434fb461c0252233e97750c',     // 账号开通时间（PRD 336行）
    },
  };

  private readonly WORKSHEETS = {
    PRODUCTS: process.env.HAP_WORKSHEET_PRODUCTS || '643418197f0301fb51750f00',
    ACCOUNTS: process.env.HAP_WORKSHEET_ACCOUNTS || '640adea9c04c8d453ff1ce52',
    PRODUCTION: process.env.HAP_WORKSHEET_PRODUCTION_RELEASES || '65612ddfc96f80bfabe5df2e',
    UPDATE: process.env.HAP_WORKSHEET_UPDATE_TASKS || '640ab32a56058b3df8803af2',
  };

  private autoSyncInterval: NodeJS.Timeout | null = null;
  private isSyncing = false;

  constructor(
    private hapClient: HapClient,
    private supabaseClient: SupabaseClient
  ) {}

  // ==================== 数据同步 ====================

  /**
   * 完整同步：从明道云同步所有下架App及其操作记录
   */
  async syncAll(triggeredBy: 'MANUAL' | 'AUTO' | 'SYSTEM' = 'MANUAL'): Promise<SyncResult> {
    if (this.isSyncing) {
      throw new Error('同步正在进行中，请稍候再试');
    }

    this.isSyncing = true;
    const startTime = Date.now();
    
    // 创建同步日志
    const { data: syncLog, error: logError } = await (this.supabaseClient as any).client
      .from('removal_investigation_sync_logs')
      .insert({
        sync_type: 'FULL',
        sync_status: 'STARTED',
        triggered_by: triggeredBy,
        hostname: hostname(),
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (logError) {
      this.isSyncing = false;
      throw new Error(`创建同步日志失败: ${logError.message}`);
    }

    const syncLogId = syncLog.id;

    try {
      console.log('[RemovalInvestigation] 🚀 开始同步下架排查数据...');
      
      // 1. 同步开发者账号
      const accountsResult = await this.syncDeveloperAccounts();
      console.log(`[RemovalInvestigation] ✅ 同步账号: ${accountsResult.synced} 个 (新增: ${accountsResult.new})`);
      
      // 2. 同步下架App列表
      const appsResult = await this.syncRemovedApps();
      console.log(`[RemovalInvestigation] ✅ 同步下架App: ${appsResult.synced} 个 (新增: ${appsResult.new}, 更新: ${appsResult.updated})`);
      
      // 3. 同步操作记录
      const operationsResult = await this.syncOperationRecords();
      console.log(`[RemovalInvestigation] ✅ 同步操作记录: ${operationsResult.synced} 个 (新增: ${operationsResult.new})`);
      
      const durationSeconds = Math.round((Date.now() - startTime) / 1000);
      
      // 更新同步日志为完成
      await (this.supabaseClient as any).client
        .from('removal_investigation_sync_logs')
        .update({
          sync_status: 'COMPLETED',
          total_removed_apps: appsResult.total,
          synced_apps: appsResult.synced,
          new_apps: appsResult.new,
          updated_apps: appsResult.updated,
          total_operations: operationsResult.synced,
          new_operations: operationsResult.new,
          total_accounts: accountsResult.synced,
          new_accounts: accountsResult.new,
          completed_at: new Date().toISOString(),
          duration_seconds: durationSeconds,
        })
        .eq('id', syncLogId);

      this.isSyncing = false;
      
      return {
        success: true,
        syncLogId,
        stats: {
          totalRemovedApps: appsResult.total,
          syncedApps: appsResult.synced,
          newApps: appsResult.new,
          updatedApps: appsResult.updated,
          totalOperations: operationsResult.synced,
          newOperations: operationsResult.new,
          totalAccounts: accountsResult.synced,
          newAccounts: accountsResult.new,
        },
        durationSeconds,
      };
      
    } catch (error: any) {
      console.error('[RemovalInvestigation] ❌ 同步失败:', error);
      
      // 更新同步日志为失败
      await (this.supabaseClient as any).client
        .from('removal_investigation_sync_logs')
        .update({
          sync_status: 'FAILED',
          error_message: error.message,
          completed_at: new Date().toISOString(),
          duration_seconds: Math.round((Date.now() - startTime) / 1000),
        })
        .eq('id', syncLogId);

      this.isSyncing = false;
      throw error;
    }
  }

  /**
   * 增量同步（只同步最近新增的下架App及其操作记录）
   */
  async syncIncremental(triggeredBy: 'MANUAL' | 'AUTO' | 'SYSTEM' = 'MANUAL'): Promise<SyncResult> {
    if (this.isSyncing) {
      throw new Error('同步正在进行中，请稍候再试');
    }

    this.isSyncing = true;
    const startTime = Date.now();
    
    // 创建同步日志
    const { data: syncLog, error: logError } = await (this.supabaseClient as any).client
      .from('removal_investigation_sync_logs')
      .insert({
        sync_type: 'INCREMENTAL',
        sync_status: 'STARTED',
        triggered_by: triggeredBy,
        hostname: hostname(),
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (logError) {
      this.isSyncing = false;
      throw new Error(`创建同步日志失败: ${logError.message}`);
    }

    const syncLogId = syncLog.id;

    try {
      console.log('[RemovalInvestigation] 🔄 开始增量同步...');

      // ⭐ 新增：先同步缺失的开发者账号
      console.log('[RemovalInvestigation] 👤 同步缺失的开发者账号...');
      const accountsResult = await this.syncMissingAccounts();
      console.log(`[RemovalInvestigation] ✅ 同步账号: ${accountsResult.synced} 个 (新增: ${accountsResult.new})`);

      // 1. 同步下架App列表（使用upsert，会自动处理新增和更新）
      console.log('[RemovalInvestigation] 📦 同步下架App列表...');
      const appsResult = await this.syncRemovedApps();
      
      // 2. 只为最近新增的App同步操作记录（最近1天）
      console.log('[RemovalInvestigation] 📝 为新增App同步操作记录...');
      const operationsResult = await this.syncOperationRecordsIncremental();
      
      const durationSeconds = Math.round((Date.now() - startTime) / 1000);
      
      // 更新同步日志为完成
      await (this.supabaseClient as any).client
        .from('removal_investigation_sync_logs')
        .update({
          sync_status: 'COMPLETED',
          total_removed_apps: appsResult.total,
          synced_apps: appsResult.synced,
          new_apps: appsResult.new,
          updated_apps: appsResult.updated,
          total_operations: operationsResult.synced,
          new_operations: operationsResult.new,
          total_accounts: accountsResult.synced,
          new_accounts: accountsResult.new,
          completed_at: new Date().toISOString(),
          duration_seconds: durationSeconds,
        })
        .eq('id', syncLogId);

      this.isSyncing = false;
      
      console.log(`[RemovalInvestigation] ✅ 增量同步完成，耗时 ${durationSeconds}秒`);
      
      return {
        success: true,
        syncLogId,
        stats: {
          totalRemovedApps: appsResult.total,
          syncedApps: appsResult.synced,
          newApps: appsResult.new,
          updatedApps: appsResult.updated,
          totalOperations: operationsResult.synced,
          newOperations: operationsResult.new,
          totalAccounts: accountsResult.synced,
          newAccounts: accountsResult.new,
        },
        durationSeconds,
      };
      
    } catch (error: any) {
      console.error('[RemovalInvestigation] ❌ 增量同步失败:', error);
      
      // 更新同步日志为失败
      await (this.supabaseClient as any).client
        .from('removal_investigation_sync_logs')
        .update({
          sync_status: 'FAILED',
          error_message: error.message || String(error),
          completed_at: new Date().toISOString(),
          duration_seconds: Math.round((Date.now() - startTime) / 1000),
        })
        .eq('id', syncLogId);

      this.isSyncing = false;
      throw error;
    }
  }

  /**
   * 同步开发者账号信息
   */
  private async syncDeveloperAccounts(): Promise<{ synced: number; new: number }> {
    console.log('[RemovalInvestigation] 📋 同步开发者账号...');
    
    // 从明道云获取所有账号记录
    const accountsData = await this.fetchAllFromHap(
      this.WORKSHEETS.ACCOUNTS,
      {},
      false // 使用二维奇智应用认证
    );
    
    console.log(`[RemovalInvestigation] 获取到 ${accountsData.length} 个账号记录`);
    
    if (accountsData.length === 0) {
      console.log('[RemovalInvestigation] ⚠️  账号表无数据');
      return { synced: 0, new: 0 };
    }
    
    let newCount = 0;
    
    for (const record of accountsData) {
      const hapAccountId = record.rowid;
      const email = this.getFieldValue(record, this.FIELD_IDS.ACCOUNTS.ACCOUNT_EMAIL);
      const status = this.parseOptionField(this.getFieldValue(record, this.FIELD_IDS.ACCOUNTS.ACCOUNT_STATUS));
      const sourceName = this.getFieldValue(record, this.FIELD_IDS.ACCOUNTS.ACCOUNT_SOURCE_NAME);
      const sourceRelation = this.getFieldValue(record, this.FIELD_IDS.ACCOUNTS.ACCOUNT_SOURCE);
      const expiryDate = this.getFieldValue(record, this.FIELD_IDS.ACCOUNTS.ACCOUNT_EXPIRY_DATE);
      const closedDate = this.getFieldValue(record, this.FIELD_IDS.ACCOUNTS.ACCOUNT_CLOSED_DATE);
      const pendingCloseDate = this.getFieldValue(record, this.FIELD_IDS.ACCOUNTS.PENDING_CLOSE_DATE);
      const region = this.parseOptionField(this.getFieldValue(record, this.FIELD_IDS.ACCOUNTS.ACCOUNT_REGION));
      const quality = this.getFieldValue(record, this.FIELD_IDS.ACCOUNTS.ACCOUNT_QUALITY);
      // ⚠️ 注意：不再使用明道云的产品数量字段，因为它可能只统计未下架的产品
      // const productCount = this.getFieldValue(record, this.FIELD_IDS.ACCOUNTS.ACCOUNT_PRODUCT_COUNT);
      const regDate = this.getFieldValue(record, this.FIELD_IDS.ACCOUNTS.REGISTRATION_DATE);
      
      // 解析账号来源类型（多选字段）
      let sourceType: string[] = [];
      if (sourceRelation && Array.isArray(sourceRelation) && sourceRelation.length > 0) {
        // sourceRelation 是关联字段，包含 [{sid: "xxx", name: "xxx"}]
        sourceType = sourceRelation.map((item: any) => item.name).filter(Boolean);
      }
      
      // 解析质量标记（多选字段）
      let qualityIssues: string[] = [];
      if (quality && Array.isArray(quality)) {
        qualityIssues = quality.map((item: any) => 
          typeof item === 'string' ? item : item.value || item.name
        ).filter(Boolean);
      }
      
      // Upsert到数据库（暂时不更新 account_product_count，稍后统一计算）
      const { error } = await (this.supabaseClient as any).client
        .from('ri_developer_accounts')
        .upsert({
          hap_account_id: hapAccountId,
          account_email: email,
          account_name: email, // 使用邮箱作为名称
          account_status: status,
          account_source: sourceName, // 使用Lookup字段，直接显示名称
          account_source_type: sourceType,
          account_expiry_date: expiryDate ? new Date(expiryDate).toISOString() : null,
          account_closed_date: closedDate ? new Date(closedDate).toISOString() : null,
          pending_close_date: pendingCloseDate ? new Date(pendingCloseDate).toISOString() : null,
          account_region: region,
          account_quality_issues: qualityIssues,
          // account_product_count 将在下面的 updateAccountProductCounts() 中统一更新
          registration_date: regDate ? new Date(regDate).toISOString().split('T')[0] : null,
          synced_from_hap_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'hap_account_id',
        });
      
      if (error) {
        console.error(`[RemovalInvestigation] 同步账号失败 ${hapAccountId}:`, error.message);
      } else {
        newCount++;
      }
    }
    
    // 🔧 统一更新所有账号的产品数量（包含所有状态）
    console.log('[RemovalInvestigation] 📊 统计账号产品数量（包含所有状态）...');
    await this.updateAccountProductCounts();
    
    return { synced: accountsData.length, new: newCount };
  }

  /**
   * 增量同步缺失的开发者账号
   * 找出明道云"账号上的产品"表关联到的、但本地没有的账号
   */
  private async syncMissingAccounts(): Promise<{ synced: number; new: number }> {
    console.log('[RemovalInvestigation] 📋 同步缺失的开发者账号...');

    // 1. 从明道云"账号上的产品"表获取所有关联的账号ID
    const productsData = await this.fetchAllFromHap(
      this.WORKSHEETS.PRODUCTS,
      {},
      false
    );

    const hapAccountIdsFromProducts = new Set<string>();

    for (const record of productsData) {
      const accountRelation = this.getFieldValue(record, this.FIELD_IDS.PRODUCTS.ACCOUNT);
      if (accountRelation && Array.isArray(accountRelation) && accountRelation.length > 0) {
        const hapAccountId = accountRelation[0].sid;
        if (hapAccountId) {
          hapAccountIdsFromProducts.add(hapAccountId);
        }
      }
    }

    console.log(`[RemovalInvestigation] 产品表关联了 ${hapAccountIdsFromProducts.size} 个账号`);

    if (hapAccountIdsFromProducts.size === 0) {
      return { synced: 0, new: 0 };
    }

    // 2. 获取本地已有的账号ID
    const { data: localAccounts, error: localError } = await (this.supabaseClient as any).client
      .from('ri_developer_accounts')
      .select('hap_account_id');

    if (localError) {
      console.error('[RemovalInvestigation] 获取本地账号失败:', localError.message);
      return { synced: 0, new: 0 };
    }

    const localAccountIds = new Set((localAccounts || []).map((a: any) => a.hap_account_id));

    // 3. 找出缺失的账号ID
    const missingAccountIds = Array.from(hapAccountIdsFromProducts).filter(
      id => !localAccountIds.has(id)
    );

    console.log(`[RemovalInvestigation] 发现 ${missingAccountIds.length} 个缺失账号`);

    if (missingAccountIds.length === 0) {
      return { synced: 0, new: 0 };
    }

    // 4. 从明道云账号表拉取这些缺失账号的详细信息
    const accountsData = await this.fetchAllFromHap(
      this.WORKSHEETS.ACCOUNTS,
      {},
      false
    );

    const newAccounts = accountsData.filter((record: any) => {
      const hapAccountId = record.rowid;
      return missingAccountIds.includes(hapAccountId);
    });

    console.log(`[RemovalInvestigation] 找到 ${newAccounts.length} 个缺失账号的详细信息`);

    if (newAccounts.length === 0) {
      return { synced: 0, new: 0 };
    }

    // 5. 插入新账号
    let newCount = 0;

    for (const record of newAccounts) {
      const hapAccountId = record.rowid;
      const email = this.getFieldValue(record, this.FIELD_IDS.ACCOUNTS.ACCOUNT_EMAIL);
      const status = this.parseOptionField(this.getFieldValue(record, this.FIELD_IDS.ACCOUNTS.ACCOUNT_STATUS));
      const sourceName = this.getFieldValue(record, this.FIELD_IDS.ACCOUNTS.ACCOUNT_SOURCE_NAME);
      const sourceRelation = this.getFieldValue(record, this.FIELD_IDS.ACCOUNTS.ACCOUNT_SOURCE);
      const expiryDate = this.getFieldValue(record, this.FIELD_IDS.ACCOUNTS.ACCOUNT_EXPIRY_DATE);
      const closedDate = this.getFieldValue(record, this.FIELD_IDS.ACCOUNTS.ACCOUNT_CLOSED_DATE);
      const pendingCloseDate = this.getFieldValue(record, this.FIELD_IDS.ACCOUNTS.PENDING_CLOSE_DATE);
      const region = this.parseOptionField(this.getFieldValue(record, this.FIELD_IDS.ACCOUNTS.ACCOUNT_REGION));
      const quality = this.getFieldValue(record, this.FIELD_IDS.ACCOUNTS.ACCOUNT_QUALITY);
      const regDate = this.getFieldValue(record, this.FIELD_IDS.ACCOUNTS.REGISTRATION_DATE);

      // 解析账号来源类型（多选字段）
      let sourceType: string[] = [];
      if (sourceRelation && Array.isArray(sourceRelation) && sourceRelation.length > 0) {
        sourceType = sourceRelation.map((item: any) => item.name).filter(Boolean);
      }

      // 解析质量标记（多选字段）
      let qualityIssues: string[] = [];
      if (quality && Array.isArray(quality)) {
        qualityIssues = quality.map((item: any) =>
          typeof item === 'string' ? item : item.value || item.name
        ).filter(Boolean);
      }

      const { error } = await (this.supabaseClient as any).client
        .from('ri_developer_accounts')
        .upsert({
          hap_account_id: hapAccountId,
          account_email: email,
          account_name: email,
          account_status: status,
          account_source: sourceName,
          account_source_type: sourceType,
          account_expiry_date: expiryDate ? new Date(expiryDate).toISOString() : null,
          account_closed_date: closedDate ? new Date(closedDate).toISOString() : null,
          pending_close_date: pendingCloseDate ? new Date(pendingCloseDate).toISOString() : null,
          account_region: region,
          account_quality_issues: qualityIssues,
          registration_date: regDate ? new Date(regDate).toISOString().split('T')[0] : null,
          synced_from_hap_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'hap_account_id',
        });

      if (error) {
        console.error(`[RemovalInvestigation] 同步缺失账号失败 ${hapAccountId}:`, error.message);
      } else {
        newCount++;
      }
    }

    // 6. 统一更新产品数量
    console.log('[RemovalInvestigation] 📊 统计新增账号的产品数量...');
    await this.updateAccountProductCounts();

    return { synced: newAccounts.length, new: newCount };
  }

  /**
   * 统计并更新所有账号的产品数量（包含所有状态）
   * 
   * 说明：
   * - 从"账号上的产品"表查询所有产品
   * - 按账号分组统计数量（包含所有状态，不排除已下架）
   * - 批量更新数据库
   */
  private async updateAccountProductCounts(): Promise<void> {
    try {
      // 1. 从明道云获取"账号上的产品"表的所有记录
      console.log('[RemovalInvestigation] 查询所有产品记录...');
      const productsData = await this.fetchAllFromHap(
        this.WORKSHEETS.PRODUCTS,
        {},
        false // 使用二维奇智应用认证
      );
      
      console.log(`[RemovalInvestigation] 获取到 ${productsData.length} 个产品记录`);
      
      // 2. 按账号分组统计
      const accountProductMap = new Map<string, number>();
      
      for (const product of productsData) {
        const accountRelation = this.getFieldValue(product, this.FIELD_IDS.PRODUCTS.ACCOUNT);
        
        if (accountRelation && Array.isArray(accountRelation) && accountRelation.length > 0) {
          const accountId = accountRelation[0].sid || accountRelation[0];
          if (accountId) {
            const currentCount = accountProductMap.get(accountId) || 0;
            accountProductMap.set(accountId, currentCount + 1);
          }
        }
      }
      
      console.log(`[RemovalInvestigation] 统计完成，共 ${accountProductMap.size} 个账号有产品关联`);
      
      // 3. 获取数据库中所有账号（处理分页，确保获取全部）
      console.log('[RemovalInvestigation] 获取数据库中所有账号...');
      const allAccounts: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;
      
      while (hasMore) {
        const { data, error } = await (this.supabaseClient as any).client
          .from('ri_developer_accounts')
          .select('hap_account_id')
          .range(page * pageSize, (page + 1) * pageSize - 1);
        
        if (error) {
          console.error('[RemovalInvestigation] 获取账号列表失败:', error.message);
          return;
        }
        
        if (data && data.length > 0) {
          allAccounts.push(...data);
          
          if (data.length < pageSize) {
            hasMore = false;
          } else {
            page++;
          }
        } else {
          hasMore = false;
        }
      }
      
      console.log(`[RemovalInvestigation] 数据库中共有 ${allAccounts.length} 个账号`);
      
      // 4. 批量更新所有账号的产品数量
      let updateCount = 0;
      for (const account of allAccounts) {
        const hapAccountId = account.hap_account_id;
        const productCount = accountProductMap.get(hapAccountId) || 0;
        
        const { error } = await (this.supabaseClient as any).client
          .from('ri_developer_accounts')
          .update({
            account_product_count: productCount,
            updated_at: new Date().toISOString(),
          })
          .eq('hap_account_id', hapAccountId);
        
        if (error) {
          console.error(`[RemovalInvestigation] 更新账号 ${hapAccountId} 产品数量失败:`, error.message);
        } else {
          updateCount++;
        }
      }
      
      console.log(`[RemovalInvestigation] ✅ 产品数量更新完成，共更新 ${updateCount} 个账号`);
      
    } catch (error: any) {
      console.error('[RemovalInvestigation] ❌ 统计产品数量失败:', error.message);
      // 不抛出错误，避免影响整体同步流程
    }
  }

  /**
   * 同步下架App列表
   */
  private async syncRemovedApps(): Promise<{ total: number; synced: number; new: number; updated: number }> {
    console.log('[RemovalInvestigation] 📦 同步下架App列表...');
    
    // 从明道云获取所有"APP被下架"状态的App
    const removedAppsData = await this.fetchAllFromHap(
      this.WORKSHEETS.PRODUCTS,
      {
        filter: {
          type: 'group',
          logic: 'AND',
          children: [
            {
              type: 'condition',
              field: this.FIELD_IDS.PRODUCTS.APP_STATUS,
              operator: 'eq',
              value: [APP_STATUS_KEYS.APP_REMOVED],
            },
          ],
        },
      }
    );
    
    console.log(`[RemovalInvestigation] 获取到 ${removedAppsData.length} 个下架App`);
    
    let newCount = 0;
    let updatedCount = 0;
    
    for (const record of removedAppsData) {
      const bundleId = this.getFieldValue(record, this.FIELD_IDS.PRODUCTS.BUNDLE_ID);
      const appName = this.getFieldValue(record, this.FIELD_IDS.PRODUCTS.APP_NAME);
      const appId = this.getFieldValue(record, this.FIELD_IDS.PRODUCTS.APP_ID);
      const accountName = this.getFieldValue(record, this.FIELD_IDS.PRODUCTS.ACCOUNT_NAME);
      const removalTime = this.getFieldValue(record, this.FIELD_IDS.PRODUCTS.REMOVAL_TIME);
      const hapProductRowId = record.rowid;
      
      // ⭐ 读取链接字段
      const keywordSearchUrl = this.getFieldValue(record, this.FIELD_IDS.PRODUCTS.KEYWORD_SEARCH_URL);
      const targetPackageUrl = this.getFieldValue(record, this.FIELD_IDS.PRODUCTS.TARGET_PACKAGE_URL);
      const qimaiUrl = this.getFieldValue(record, this.FIELD_IDS.PRODUCTS.QIMAI_URL);
      
      // 🐛 调试：输出第一条记录的链接字段数据
      if (removedAppsData.indexOf(record) === 0) {
        console.log('[RemovalInvestigation] 🐛 第一条记录的链接字段：');
        console.log('  - 关键词查询链接:', keywordSearchUrl || '(null)');
        console.log('  - 目标包链接:', targetPackageUrl || '(null)');
        console.log('  - 七麦链接:', qimaiUrl || '(null)');
        console.log('  - 原始数据字段keys（前50个）:', Object.keys(record).slice(0, 50).join(', '));
      }
      
      // 获取关联的账号
      const accountRelation = this.getFieldValue(record, this.FIELD_IDS.PRODUCTS.ACCOUNT);
      let accountId = null;
      let hapAccountId = null;
      
      if (accountRelation && Array.isArray(accountRelation) && accountRelation.length > 0) {
        hapAccountId = accountRelation[0].sid;
        
        // 查找本地账号ID
        const { data: accountData } = await (this.supabaseClient as any).client
          .from('ri_developer_accounts')
          .select('id')
          .eq('hap_account_id', hapAccountId)
          .single();
        
        if (accountData) {
          accountId = accountData.id;
        }
      }
      
      if (!bundleId) {
        console.warn('[RemovalInvestigation] 跳过无Bundle ID的记录');
        continue;
      }
      
      // 检查是否已存在
      const { data: existing } = await (this.supabaseClient as any).client
        .from('removed_apps')
        .select('id')
        .eq('bundle_id', bundleId)
        .single();
      
      const appData = {
        bundle_id: bundleId,
        app_name: appName || 'Unknown',
        app_id: appId,
        account_id: accountId,
        hap_account_id: hapAccountId,
        account_name: accountName,
        removal_time: removalTime ? new Date(removalTime).toISOString() : null,
        app_status: 'APP被下架',
        keyword_search_url: keywordSearchUrl,  // ⭐ 关键词查询链接
        target_package_url: targetPackageUrl,  // ⭐ 目标包链接
        qimai_url: qimaiUrl,                   // ⭐ 七麦链接
        hap_product_row_id: hapProductRowId,
        synced_from_hap_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      
      if (existing) {
        // 更新
        const { error } = await (this.supabaseClient as any).client
          .from('removed_apps')
          .update(appData)
          .eq('id', existing.id);
        
        if (error) {
          console.error(`[RemovalInvestigation] 更新App失败 ${bundleId}:`, error.message);
        } else {
          updatedCount++;
        }
      } else {
        // 新增
        const { error } = await (this.supabaseClient as any).client
          .from('removed_apps')
          .insert(appData);
        
        if (error) {
          console.error(`[RemovalInvestigation] 插入App失败 ${bundleId}:`, error.message);
        } else {
          newCount++;
        }
      }
    }
    
    return { 
      total: removedAppsData.length, 
      synced: newCount + updatedCount, 
      new: newCount, 
      updated: updatedCount 
    };
  }

  /**
   * 同步操作记录（发布+更新）
   */
  private async syncOperationRecords(): Promise<{ synced: number; new: number }> {
    console.log('[RemovalInvestigation] 📝 同步操作记录...');
    
    // 获取所有下架App的bundle_id列表（分批查询以避免1000条限制）
    let allRemovedApps: any[] = [];
    let page = 0;
    const pageSize = 1000;
    
    while (true) {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      
      const { data: batch, error: appsError } = await (this.supabaseClient as any).client
        .from('removed_apps')
        .select('id, bundle_id, removal_time')
        .range(from, to)
        .order('created_at', { ascending: true });
      
      if (appsError) {
        throw new Error(`查询下架App失败: ${appsError.message}`);
      }
      
      if (!batch || batch.length === 0) {
        break;
      }
      
      allRemovedApps = allRemovedApps.concat(batch);
      
      if (batch.length < pageSize) {
        break; // 最后一页
      }
      
      page++;
    }
    
    console.log(`[RemovalInvestigation] 为 ${allRemovedApps.length} 个App同步操作记录...`);
    
    let totalSynced = 0;
    let totalNew = 0;
    
    for (const app of allRemovedApps) {
      try {
        // 同步发布记录
        const releaseResult = await this.syncProductionRecords(app.id, app.bundle_id);
        totalSynced += releaseResult.synced;
        totalNew += releaseResult.new;
        
        // 同步更新记录
        const updateResult = await this.syncUpdateRecords(app.id, app.bundle_id);
        totalSynced += updateResult.synced;
        totalNew += updateResult.new;
        
        // 更新统计信息
        await this.updateAppStatistics(app.id, app.bundle_id, app.removal_time);
        
      } catch (error: any) {
        console.error(`[RemovalInvestigation] 同步 ${app.bundle_id} 的操作记录失败:`, error.message);
      }
    }
    
    return { synced: totalSynced, new: totalNew };
  }

  /**
   * 增量同步操作记录（只同步"明道云有但Supabase没有"的App）
   * 
   * 使用场景：
   * 1. 发现App下架
   * 2. 记录到明道云
   * 3. 手动点击"增量同步"按钮
   * 4. 系统自动识别新增的App并同步操作记录
   */
  private async syncOperationRecordsIncremental(): Promise<{ synced: number; new: number }> {
    console.log('[RemovalInvestigation] 📝 增量同步操作记录...');
    
    // 策略：找出所有"操作记录为0"的App，说明是刚同步进来的新App
    // 这些App需要同步操作记录
    const { data: appsWithoutOperations, error } = await (this.supabaseClient as any).client
      .from('removed_apps')
      .select('id, bundle_id, removal_time, total_operations')
      .or('total_operations.is.null,total_operations.eq.0')
      .order('created_at', { ascending: false });
    
    if (error) {
      throw new Error(`查询未同步操作记录的App失败: ${error.message}`);
    }
    
    if (!appsWithoutOperations || appsWithoutOperations.length === 0) {
      console.log('[RemovalInvestigation] ✅ 所有App的操作记录都已同步');
      return { synced: 0, new: 0 };
    }
    
    console.log(`[RemovalInvestigation] 📋 发现 ${appsWithoutOperations.length} 个App需要同步操作记录...`);
    
    let totalSynced = 0;
    let totalNew = 0;
    
    for (const app of appsWithoutOperations) {
      try {
        console.log(`[RemovalInvestigation]   🔄 同步 ${app.bundle_id} 的操作记录...`);
        
        // 同步发布记录
        const releaseResult = await this.syncProductionRecords(app.id, app.bundle_id);
        totalSynced += releaseResult.synced;
        totalNew += releaseResult.new;
        
        // 同步更新记录
        const updateResult = await this.syncUpdateRecords(app.id, app.bundle_id);
        totalSynced += updateResult.synced;
        totalNew += updateResult.new;
        
        // 更新统计信息
        await this.updateAppStatistics(app.id, app.bundle_id, app.removal_time);
        
        console.log(`[RemovalInvestigation]   ✅ ${app.bundle_id}: 发布${releaseResult.new}条，更新${updateResult.new}条`);
        
      } catch (error: any) {
        console.error(`[RemovalInvestigation]   ❌ ${app.bundle_id} 同步失败:`, error.message);
      }
    }
    
    console.log(`[RemovalInvestigation] ✅ 增量同步完成: 总计${totalSynced}条，新增${totalNew}条`);
    return { synced: totalSynced, new: totalNew };
  }

  /**
   * 更新App的统计信息（操作次数、时间范围、存活天数）
   */
  private async updateAppStatistics(removedAppId: string, bundleId: string, removalTime: string | null): Promise<void> {
    // 查询该App的所有操作记录
    const { data: operations, error } = await (this.supabaseClient as any).client
      .from('operation_records')
      .select('operation_time')
      .eq('removed_app_id', removedAppId)
      .order('operation_time', { ascending: true });
    
    if (error) {
      console.error(`[RemovalInvestigation] 查询操作记录失败: ${error.message}`);
      return;
    }
    
    const totalOperations = operations?.length || 0;
    let firstReleaseTime = null;
    let lastUpdateTime = null;
    let survivalDays = null;
    
    if (operations && operations.length > 0) {
      // 获取首次发布时间和最后更新时间
      firstReleaseTime = operations[0].operation_time;
      lastUpdateTime = operations[operations.length - 1].operation_time;
      
      // 计算存活天数（从首次发布到下架）
      if (firstReleaseTime && removalTime) {
        const firstDate = new Date(firstReleaseTime);
        const removalDate = new Date(removalTime);
        survivalDays = Math.floor((removalDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));
      }
    }
    
    // 更新统计字段
    await (this.supabaseClient as any).client
      .from('removed_apps')
      .update({
        total_operations: totalOperations,
        first_release_time: firstReleaseTime,
        last_update_time: lastUpdateTime,
        survival_days: survivalDays,
      })
      .eq('id', removedAppId);
  }

  /**
   * 同步App生产发布记录
   */
  private async syncProductionRecords(removedAppId: string, bundleId: string): Promise<{ synced: number; new: number }> {
    // 从App工厂应用查询发布记录
    const productionData = await this.fetchAllFromHap(
      this.WORKSHEETS.PRODUCTION,
      {
        filter: {
          type: 'group',
          logic: 'AND',
          children: [
            {
              type: 'condition',
              field: this.FIELD_IDS.PRODUCTION.BUNDLE_ID,
              operator: 'eq',
              value: bundleId,
            },
          ],
        },
      },
      true // 使用App工厂应用的认证
    );
    
    let newCount = 0;
    
    for (const record of productionData) {
      const hapRecordId = record.rowid;
      
      // 检查是否已存在
      const { data: existing } = await (this.supabaseClient as any).client
        .from('operation_records')
        .select('id')
        .eq('hap_record_id', hapRecordId)
        .single();
      
      if (existing) {
        continue; // 已存在，跳过
      }
      
      const releaseTime = this.getFieldValue(record, this.FIELD_IDS.PRODUCTION.RELEASE_TIME);
      const firstSubmitTime = this.getFieldValue(record, this.FIELD_IDS.PRODUCTION.FIRST_SUBMIT_TIME);
      const ctime = record.ctime; // 明道云记录创建时间（系统字段）
      
      // 时间字段优先级：RELEASE_TIME > FIRST_SUBMIT_TIME > ctime
      const operationTime = releaseTime || firstSubmitTime || ctime;
      
      const operator = this.parseUserField(this.getFieldValue(record, this.FIELD_IDS.PRODUCTION.OPERATOR));
      const adVersion = this.parseOptionField(this.getFieldValue(record, this.FIELD_IDS.PRODUCTION.AD_VERSION));
      const location = this.parseOptionField(this.getFieldValue(record, this.FIELD_IDS.PRODUCTION.LOCATION));
      const status = this.parseOptionField(this.getFieldValue(record, this.FIELD_IDS.PRODUCTION.STATUS));
      const releaseType = this.parseOptionField(this.getFieldValue(record, this.FIELD_IDS.PRODUCTION.RELEASE_TYPE));
      
      const operationData = {
        removed_app_id: removedAppId,
        bundle_id: bundleId,
        operation_type: 'RELEASE',
        operation_time: operationTime ? new Date(operationTime).toISOString() : new Date().toISOString(),
        app_name: this.getFieldValue(record, this.FIELD_IDS.PRODUCTION.APP_NAME),
        version: this.getFieldValue(record, this.FIELD_IDS.PRODUCTION.VERSION),
        ad_version: adVersion,
        operator: operator,
        location: location,
        status: status,
        release_type: releaseType,
        first_submit_time: this.parseDateTime(this.getFieldValue(record, this.FIELD_IDS.PRODUCTION.FIRST_SUBMIT_TIME)),
        debug_complete_time: this.parseDateTime(this.getFieldValue(record, this.FIELD_IDS.PRODUCTION.DEBUG_COMPLETE_TIME)),
        package_upload_time: this.parseDateTime(this.getFieldValue(record, this.FIELD_IDS.PRODUCTION.PACKAGE_UPLOAD_TIME)),
        remarks: this.getFieldValue(record, this.FIELD_IDS.PRODUCTION.REMARKS),
        hap_source_table: 'production_release',
        hap_record_id: hapRecordId,
        synced_from_hap_at: new Date().toISOString(),
      };
      
      const { error } = await (this.supabaseClient as any).client
        .from('operation_records')
        .insert(operationData);
      
      if (error) {
        console.error(`[RemovalInvestigation] 插入发布记录失败:`, error.message);
      } else {
        newCount++;
      }
    }
    
    return { synced: productionData.length, new: newCount };
  }

  /**
   * 同步App更新任务记录
   */
  private async syncUpdateRecords(removedAppId: string, bundleId: string): Promise<{ synced: number; new: number }> {
    // 首先需要找到该bundle_id在"账号上的产品"表中的rowid
    const productsData = await this.fetchAllFromHap(
      this.WORKSHEETS.PRODUCTS,
      {
        filter: {
          type: 'group',
          logic: 'AND',
          children: [
            {
              type: 'condition',
              field: this.FIELD_IDS.PRODUCTS.BUNDLE_ID,
              operator: 'eq',
              value: bundleId,
            },
          ],
        },
      }
    );
    
    if (productsData.length === 0) {
      return { synced: 0, new: 0 };
    }
    
    const productRowId = productsData[0].rowid;
    
    // 从更新任务表查询关联到该产品的更新记录
    const updateData = await this.fetchAllFromHap(
      this.WORKSHEETS.UPDATE,
      {
        filter: {
          type: 'group',
          logic: 'AND',
          children: [
            {
              type: 'condition',
              field: this.FIELD_IDS.UPDATE.PRODUCT_RELATION,
              operator: 'eq',  // ✅ 正确：关联字段使用 eq 操作符
              value: productRowId,  // ✅ 正确：直接传字符串，不用数组
            },
          ],
        },
      }
    );
    
    let newCount = 0;
    
    for (const record of updateData) {
      const hapRecordId = record.rowid;
      
      // 检查是否已存在
      const { data: existing } = await (this.supabaseClient as any).client
        .from('operation_records')
        .select('id')
        .eq('hap_record_id', hapRecordId)
        .single();
      
      if (existing) {
        continue;
      }
      
      const submitTime = this.getFieldValue(record, this.FIELD_IDS.UPDATE.SUBMIT_TIME);
      const debugCompleteTime = this.getFieldValue(record, this.FIELD_IDS.UPDATE.DEBUG_COMPLETE_TIME);
      const ctime = record.ctime; // 明道云记录创建时间（系统字段）
      
      // 时间字段优先级：SUBMIT_TIME > DEBUG_COMPLETE_TIME > ctime
      const operationTime = submitTime || debugCompleteTime || ctime;
      
      const operator = this.parseUserField(this.getFieldValue(record, this.FIELD_IDS.UPDATE.RELEASE_PERSON));
      const adVersion = this.parseOptionField(this.getFieldValue(record, this.FIELD_IDS.UPDATE.AD_VERSION));
      const location = this.parseOptionField(this.getFieldValue(record, this.FIELD_IDS.UPDATE.RELEASE_LOCATION));
      const status = this.parseOptionField(this.getFieldValue(record, this.FIELD_IDS.UPDATE.RELEASE_STATUS));
      const releaseType = this.parseOptionField(this.getFieldValue(record, this.FIELD_IDS.UPDATE.RELEASE_TYPE));
      
      const operationData = {
        removed_app_id: removedAppId,
        bundle_id: bundleId,
        operation_type: 'UPDATE',
        operation_time: operationTime ? new Date(operationTime).toISOString() : new Date().toISOString(),
        app_name: this.getFieldValue(record, this.FIELD_IDS.UPDATE.TASK_NAME),
        version: this.getFieldValue(record, this.FIELD_IDS.UPDATE.VERSION),
        ad_version: adVersion,
        operator: operator,
        location: location,
        status: status,
        release_type: releaseType,
        debug_complete_time: this.parseDateTime(this.getFieldValue(record, this.FIELD_IDS.UPDATE.DEBUG_COMPLETE_TIME)),
        package_upload_time: this.parseDateTime(this.getFieldValue(record, this.FIELD_IDS.UPDATE.PACKAGE_UPLOAD_TIME)),
        remarks: this.getFieldValue(record, this.FIELD_IDS.UPDATE.REMARKS),
        hap_source_table: 'update_task',
        hap_record_id: hapRecordId,
        synced_from_hap_at: new Date().toISOString(),
      };
      
      const { error } = await (this.supabaseClient as any).client
        .from('operation_records')
        .insert(operationData);
      
      if (error) {
        console.error(`[RemovalInvestigation] 插入更新记录失败:`, error.message);
      } else {
        newCount++;
      }
    }
    
    return { synced: updateData.length, new: newCount };
  }

  // ==================== 查询接口 ====================

  /**
   * 获取下架App列表
   */
  async getRemovedAppsList(
    page: number = 1,
    pageSize: number = 20,
    search?: string,
    filters?: any
  ): Promise<{ 
    apps: any[]; 
    total: number; 
    page: number; 
    pageSize: number;
    availableFilters?: {
      accountSources: string[];
      regions: string[];
      adVersions: string[];
      operators: string[];
      locations: string[];
    };
  }> {
    let query = (this.supabaseClient as any).client
      .from('removed_apps')
      .select(`
        *,
        account:ri_developer_accounts!account_id (
          account_email,
          account_source,
          account_source_type,
          account_status,
          account_expiry_date,
          account_closed_date,
          pending_close_date,
          account_region,
          account_quality_issues,
          account_product_count,
          registration_date
        )
      `, { count: 'exact' })
      .order('removal_time', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });
    
    // 处理筛选条件（数据库层面）
    if (filters) {
      // 时间范围筛选
      if (filters.removalTimeRange) {
        let { start, end } = filters.removalTimeRange;
        
        // 如果start和end是同一天，将end设置为这一天的最后一刻
        if (start && end && new Date(start).getTime() === new Date(end).getTime()) {
          const endDate = new Date(end);
          endDate.setHours(23, 59, 59, 999);
          end = endDate.toISOString();
        }
        
        if (start) {
          query = query.gte('removal_time', start);
        }
        if (end) {
          query = query.lte('removal_time', end);
        }
      }
      
      // App存活天数筛选
      if (filters.appSurvivalDays) {
        const { min, max } = filters.appSurvivalDays;
        if (min !== undefined) {
          query = query.gte('survival_days', min);
        }
        if (max !== undefined) {
          query = query.lte('survival_days', max);
        }
      }
    }
    
    // 注意：不在数据库层做搜索和账号相关筛选，因为需要在应用层处理
    // 取足够多的数据以支持应用层过滤
    const fetchSize = search || (filters && (filters.accountSources?.length > 0 || filters.accountRegions?.length > 0 || filters.accountSurvivalDays || filters.pendingCloseDateRange || filters.adVersions?.length > 0 || filters.operators?.length > 0 || filters.locations?.length > 0))
      ? 1000  // 如果有搜索或需要应用层过滤，取更多数据
      : pageSize * 3;  // 否则取3倍pageSize以提供缓冲
    
    query = query.range(0, fetchSize - 1);
    
    const { data, error, count } = await query;
    
    if (error) {
      throw new Error(`查询下架App列表失败: ${error.message}`);
    }
    
    // 转换字段名：snake_case -> camelCase
    let apps = (data || []).map((row: any) => ({
      id: row.id,
      bundleId: row.bundle_id,
      appName: row.app_name,
      appId: row.app_id,
      accountName: row.account_name,
      removalTime: row.removal_time,
      totalOperations: row.total_operations || 0,
      firstReleaseTime: row.first_release_time,
      lastUpdateTime: row.last_update_time,
      survivalDays: row.survival_days,
      keywordSearchUrl: row.keyword_search_url,  // ⭐ 关键词查询链接
      targetPackageUrl: row.target_package_url,  // ⭐ 目标包链接
      qimaiUrl: row.qimai_url,                   // ⭐ 七麦链接
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      // 账号详细信息
      accountInfo: row.account ? {
        accountEmail: row.account.account_email,
        accountSource: row.account.account_source,
        accountSourceType: row.account.account_source_type,
        accountStatus: row.account.account_status,
        accountExpiryDate: row.account.account_expiry_date,
        accountClosedDate: row.account.account_closed_date,
        pendingCloseDate: row.account.pending_close_date,
        accountRegion: row.account.account_region,
        accountQualityIssues: row.account.account_quality_issues,
        accountProductCount: row.account.account_product_count,
        registrationDate: row.account.registration_date,
      } : null,
    }));
    
    // 搜索账号邮箱（独立于筛选条件）
    if (search) {
      apps = apps.filter((app: any) => 
        app.appName?.toLowerCase().includes(search.toLowerCase()) ||
        app.bundleId?.toLowerCase().includes(search.toLowerCase()) ||
        app.accountInfo?.accountEmail?.toLowerCase().includes(search.toLowerCase())
      );
    }
    
    // 应用层过滤（针对需要JOIN的筛选条件）
    if (filters) {
      
      // 账号来源筛选
      if (filters.accountSources && filters.accountSources.length > 0) {
        apps = apps.filter((app: any) => 
          app.accountInfo?.accountSource && 
          filters.accountSources.includes(app.accountInfo.accountSource)
        );
      }
      
      // 账号区域筛选
      if (filters.accountRegions && filters.accountRegions.length > 0) {
        apps = apps.filter((app: any) =>
          app.accountInfo?.accountRegion &&
          filters.accountRegions.includes(app.accountInfo.accountRegion)
        );
      }
      
      // 账号存活天数筛选
      if (filters.accountSurvivalDays) {
        const { min, max } = filters.accountSurvivalDays;
        apps = apps.filter((app: any) => {
          if (!app.accountInfo?.registrationDate) return false;
          
          const startDate = new Date(app.accountInfo.registrationDate);
          const endDate = app.accountInfo.pendingCloseDate
            ? new Date(app.accountInfo.pendingCloseDate)
            : (app.accountInfo.accountClosedDate
              ? new Date(app.accountInfo.accountClosedDate)
              : new Date());
          
          const days = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
          
          if (min !== undefined && days < min) return false;
          if (max !== undefined && days > max) return false;
          return true;
        });
      }
      
      // 标记关停时间范围筛选
      if (filters.pendingCloseDateRange) {
        let { start, end } = filters.pendingCloseDateRange;
        
          // 如果start和end是同一天，将end设置为这一天的最后一刻
          if (start && end && new Date(start).getTime() === new Date(end).getTime()) {
            const endDate = new Date(end);
            endDate.setHours(23, 59, 59, 999);
            end = endDate.toISOString();
          }
        
        apps = apps.filter((app: any) => {
          if (!app.accountInfo?.pendingCloseDate) return false;
          const date = new Date(app.accountInfo.pendingCloseDate);
          if (start && date < new Date(start)) return false;
          if (end && date > new Date(end)) return false;
          return true;
        });
      }
      
      // 操作记录相关筛选需要额外查询
      if (filters.adVersions?.length > 0 || filters.operators?.length > 0 || filters.locations?.length > 0) {
        const bundleIds = apps.map((app: any) => app.bundleId);
        
        // 查询操作记录
        let opsQuery = (this.supabaseClient as any).client
          .from('operation_records')
          .select('bundle_id, ad_version, operator, location')
          .in('bundle_id', bundleIds);
        
        if (filters.adVersions?.length > 0) {
          opsQuery = opsQuery.in('ad_version', filters.adVersions);
        }
        if (filters.operators?.length > 0) {
          opsQuery = opsQuery.in('operator', filters.operators);
        }
        if (filters.locations?.length > 0) {
          opsQuery = opsQuery.in('location', filters.locations);
        }
        
        const { data: opsData } = await opsQuery;
        const matchedBundleIds = new Set((opsData || []).map((op: any) => op.bundle_id));
        
        apps = apps.filter((app: any) => matchedBundleIds.has(app.bundleId));
      }
    }
    
    // 获取可用的筛选选项
    const availableFilters = await this.getAvailableFilters();
    
    // 应用层过滤后的总数
    const totalFiltered = apps.length;
    
    // 应用层分页
    const from = (page - 1) * pageSize;
    const to = from + pageSize;
    const pagedApps = apps.slice(from, to);
    
    return {
      apps: pagedApps,
      total: totalFiltered,
      page,
      pageSize,
      availableFilters,
    };
  }
  
  /**
   * 获取可用的筛选选项
   */
  private async getAvailableFilters(): Promise<{
    accountSources: string[];
    regions: string[];
    adVersions: string[];
    operators: string[];
    locations: string[];
  }> {
    // 获取账号来源
    const { data: accountData } = await (this.supabaseClient as any).client
      .from('ri_developer_accounts')
      .select('account_source, account_region')
      .not('account_source', 'is', null);
    
    const accountSources: string[] = Array.from(new Set(
      (accountData || [])
        .map((a: any) => a.account_source)
        .filter(Boolean)
    )).sort() as string[];
    
    const regions: string[] = Array.from(new Set(
      (accountData || [])
        .map((a: any) => a.account_region)
        .filter(Boolean)
    )).sort() as string[];
    
    // 获取操作记录相关选项
    const { data: opsData } = await (this.supabaseClient as any).client
      .from('operation_records')
      .select('ad_version, operator, location');
    
    const adVersions: string[] = Array.from(new Set(
      (opsData || [])
        .map((op: any) => op.ad_version)
        .filter(Boolean)
    )).sort() as string[];
    
    const operators: string[] = Array.from(new Set(
      (opsData || [])
        .map((op: any) => op.operator)
        .filter(Boolean)
    )).sort() as string[];
    
    const locations: string[] = Array.from(new Set(
      (opsData || [])
        .map((op: any) => op.location)
        .filter(Boolean)
    )).sort() as string[];
    
    return {
      accountSources,
      regions,
      adVersions,
      operators,
      locations,
    };
  }

  /**
   * 获取App的操作时间线
   */
  async getAppTimeline(bundleId: string): Promise<OperationRecord[]> {
    const { data, error } = await (this.supabaseClient as any).client
      .from('operation_records')
      .select('*')
      .eq('bundle_id', bundleId)
      .order('operation_time', { ascending: true });
    
    if (error) {
      throw new Error(`查询操作记录失败: ${error.message}`);
    }
    
    // 转换字段名：snake_case -> camelCase
    const records = (data || []).map((row: any) => ({
      id: row.id,
      bundleId: row.bundle_id,
      operationType: row.operation_type?.toUpperCase() === 'RELEASE' ? 'RELEASE' : 'UPDATE',
      operationTime: row.operation_time,
      appName: row.app_name,
      version: row.version,
      adVersion: row.ad_version,
      operator: row.operator,
      location: row.location,
      status: row.status,
      releaseType: row.release_type,
      remarks: row.remarks,
      hapSourceTable: row.hap_source_table,
    }));
    
    return records;
  }

  /**
   * 获取同步状态
   */
  async getSyncStatus(): Promise<SyncStatus> {
    try {
      const { data, error } = await (this.supabaseClient as any).client
        .from('removal_investigation_sync_logs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(1)
        .single();
      
      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
        console.warn(`[RemovalInvestigation] ⚠️  查询同步日志失败: ${error.message}`);
        // 不抛出错误，返回默认状态
        return {
          lastSyncTime: null,
          isRunning: this.isSyncing,
          lastSyncStatus: null,
          lastSyncStats: null,
        };
      }
      
      return {
        lastSyncTime: data?.completed_at || null,
        isRunning: this.isSyncing,
        lastSyncStatus: data?.sync_status || null,
        lastSyncStats: data ? {
          totalRemovedApps: data.total_removed_apps,
          syncedApps: data.synced_apps,
          newApps: data.new_apps,
          totalOperations: data.total_operations,
          newOperations: data.new_operations,
        } : null,
      };
    } catch (error: any) {
      console.warn(`[RemovalInvestigation] ⚠️  查询同步状态异常: ${error.message}`);
      // 返回默认状态，不影响主流程
      return {
        lastSyncTime: null,
        isRunning: this.isSyncing,
        lastSyncStatus: null,
        lastSyncStats: null,
      };
    }
  }

  // ==================== 自动同步 ====================

  /**
   * 启动自动同步（每天凌晨3点）
   */
  startAutoSync(): void {
    if (this.autoSyncInterval) {
      console.log('[RemovalInvestigation] 自动同步已在运行中');
      return;
    }
    
    console.log('[RemovalInvestigation] 🕐 启动自动同步（每天凌晨3点）');
    
    // 计算到凌晨3点的时间
    const scheduleNextSync = () => {
      const now = new Date();
      const next3AM = new Date();
      next3AM.setHours(3, 0, 0, 0);
      
      if (next3AM <= now) {
        // 如果今天的3点已过，设置为明天3点
        next3AM.setDate(next3AM.getDate() + 1);
      }
      
      const msUntilNext = next3AM.getTime() - now.getTime();
      
      console.log(`[RemovalInvestigation] 下次自动同步时间: ${next3AM.toLocaleString()}`);
      
      this.autoSyncInterval = setTimeout(async () => {
        console.log('[RemovalInvestigation] 🔄 执行自动同步...');
        try {
          await this.syncAll('AUTO');
          console.log('[RemovalInvestigation] ✅ 自动同步完成');
        } catch (error: any) {
          console.error('[RemovalInvestigation] ❌ 自动同步失败:', error.message);
        }
        
        // 安排下一次同步
        scheduleNextSync();
      }, msUntilNext);
    };
    
    scheduleNextSync();
  }

  /**
   * 停止自动同步
   */
  stopAutoSync(): void {
    if (this.autoSyncInterval) {
      clearTimeout(this.autoSyncInterval);
      this.autoSyncInterval = null;
      console.log('[RemovalInvestigation] ⏸️  自动同步已停止');
    }
  }

  // ==================== 辅助方法 ====================

  /**
   * 从明道云获取所有记录（自动分页）
   */
  private async fetchAllFromHap(
    worksheetId: string,
    options: { filter?: any } = {},
    useProductionAuth: boolean = false
  ): Promise<any[]> {
    const allRows: any[] = [];
    let pageIndex = 1;
    const pageSize = 100;
    let hasMore = true;
    
    // 选择认证信息
    const appKey = useProductionAuth 
      ? (process.env.HAP_APP_KEY_PRODUCTION_RELEASES || this.hapClient['appKey'])
      : this.hapClient['appKey'];
    const sign = useProductionAuth
      ? (process.env.HAP_SIGN_PRODUCTION_RELEASES || this.hapClient['sign'])
      : this.hapClient['sign'];
    
    while (hasMore) {
      const url = `https://api.mingdao.com/v3/app/worksheets/${worksheetId}/rows/list`;
      
      const body: any = {
        pageSize,
        pageIndex,
        useFieldIdAsKey: true,  // 🔧 强制使用字段ID作为key
      };
      
      if (options.filter) {
        body.filter = options.filter;
      }
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'HAP-Appkey': appKey,
          'HAP-Sign': sign,
        },
        body: JSON.stringify(body),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data: any = await response.json();
      
      if (!data.success) {
        throw new Error(data.error_msg || `API Error: ${data.error_code}`);
      }
      
      const rows = data.data?.rows || [];
      allRows.push(...rows);
      
      if (rows.length < pageSize) {
        hasMore = false;
      } else {
        pageIndex++;
      }
    }
    
    return allRows;
  }

  /**
   * 从明道云记录中获取字段值
   */
  private getFieldValue(record: any, fieldId: string): any {
    // ⚠️ 注意：不能用 || null，因为 0 也是有效值
    return record[fieldId] !== undefined && record[fieldId] !== null ? record[fieldId] : null;
  }

  /**
   * 解析用户字段（关联字段）
   * ✅ 已验证：支持对象、数组、字符串等多种格式
   */
  private parseUserField(value: any): string | null {
    if (!value) return null;
    
    // 如果是字符串，尝试解析为JSON
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        value = parsed;
      } catch (e) {
        return value;
      }
    }
    
    // 如果是数组
    if (Array.isArray(value)) {
      if (value.length === 0) return null;
      return value.map((u: any) => u.fullname || u.name || u.accountId || String(u)).join(', ');
    }
    
    // 如果是对象
    if (typeof value === 'object') {
      return value.fullname || value.name || value.accountId || null;
    }
    
    return String(value);
  }

  /**
   * 解析选项字段
   * ✅ 已验证：支持对象、数组、字符串等多种格式
   */
  private parseOptionField(value: any): string | null {
    if (!value) return null;
    
    // 如果是字符串，尝试解析为JSON
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        value = parsed;
      } catch (e) {
        return value;
      }
    }
    
    // 如果是数组
    if (Array.isArray(value)) {
      if (value.length === 0) return null;
      return value.map((o: any) => o.value || o.Value || o.name || String(o)).join(', ');
    }
    
    // 如果是对象
    if (typeof value === 'object') {
      return value.value || value.Value || value.name || null;
    }
    
    return String(value);
  }

  /**
   * 解析日期时间
   */
  private parseDateTime(value: any): string | null {
    if (!value) return null;
    try {
      return new Date(value).toISOString();
    } catch {
      return null;
    }
  }

  /**
   * 获取账号详情（账号视图）
   * 返回该账号下的所有App和操作记录
   */
  async getAccountDetail(accountEmail: string): Promise<{
    apps: Array<{
      id: string;
      bundleId: string;
      appName: string;
      isRemoved: boolean;
      removalTime: string | null;
      survivalDays: number | null;
      totalOperations: number;
      keywordSearchUrl: string | null;  // ⭐ 关键词查询链接
      targetPackageUrl: string | null;  // ⭐ 目标包链接
      qimaiUrl: string | null;          // ⭐ 七麦链接
    }>;
    operations: Array<{
      id: string;
      bundleId: string;
      appName: string;
      operationType: 'RELEASE' | 'UPDATE';
      operationTime: string;
      version: string | null;
      adVersion: string | null;
      operator: string | null;
      location: string | null;
      status: string | null;
      releaseType: string | null;
      remarks: string | null;
      hapSourceTable: 'production_release' | 'update_task';
    }>;
  }> {
    console.log(`[AppRemovalInvestigationService] 🔍 获取账号详情: ${accountEmail}`);

    try {
      // 1. 从 removed_apps 中查找该账号的所有App（包括已下架和未下架的）
      const { data: removedApps, error: removedError } = await (this.supabaseClient as any).client
        .from('removed_apps')
        .select(`
          id,
          bundle_id,
          app_name,
          removal_time,
          keyword_search_url,
          target_package_url,
          qimai_url,
          account:ri_developer_accounts!account_id!inner(account_email)
        `)
        .eq('account.account_email', accountEmail);

      if (removedError) {
        throw new Error(`查询removed_apps失败: ${removedError.message}`);
      }

      const removedAppBundleIds = removedApps?.map((app: any) => app.bundle_id) || [];

      // 2. 从 operation_records 中查找该账号的所有操作记录
      // 注意：operation_records 没有直接的 account_id，需要通过 bundle_id 关联
      let operations: any[] = [];
      let operationsError = null;

      if (removedAppBundleIds.length > 0) {
        const result = await (this.supabaseClient as any).client
          .from('operation_records')
          .select(`
            id,
            bundle_id,
            app_name,
            operation_type,
            operation_time,
            version,
            ad_version,
            operator,
            location,
            status,
            release_type,
            remarks,
            hap_source_table
          `)
          .in('bundle_id', removedAppBundleIds)
          .order('operation_time', { ascending: false });
        
        operations = result.data || [];
        operationsError = result.error;
      }

      if (operationsError) {
        throw new Error(`查询operation_records失败: ${operationsError.message}`);
      }

      // 3. 合并App列表（包括removed_apps中的和operation_records中的）
      const appMap = new Map<string, {
        id: string;
        bundleId: string;
        appName: string;
        isRemoved: boolean;
        removalTime: string | null;
        survivalDays: number | null;
        totalOperations: number;
        keywordSearchUrl: string | null;  // ⭐ 关键词查询链接
        targetPackageUrl: string | null;  // ⭐ 目标包链接
        qimaiUrl: string | null;          // ⭐ 七麦链接
      }>();

      // 先添加 removed_apps 中的App
      removedApps?.forEach((app: any) => {
        const survivalDays = app.removal_time && operations?.length
          ? this.calculateSurvivalDays(
              operations.filter((op: any) => op.bundle_id === app.bundle_id),
              app.removal_time
            )
          : null;

        appMap.set(app.bundle_id, {
          id: app.id,
          bundleId: app.bundle_id,
          appName: app.app_name,
          isRemoved: !!app.removal_time,
          removalTime: app.removal_time,
          survivalDays,
          totalOperations: 0,
          keywordSearchUrl: app.keyword_search_url,  // ⭐ 关键词查询链接
          targetPackageUrl: app.target_package_url,  // ⭐ 目标包链接
          qimaiUrl: app.qimai_url,                   // ⭐ 七麦链接
        });
      });

      // 再添加 operations 中的App（可能有些App还没被记录在removed_apps中）
      operations?.forEach((op: any) => {
        if (!appMap.has(op.bundle_id)) {
          appMap.set(op.bundle_id, {
            id: `op-${op.bundle_id}`,
            bundleId: op.bundle_id,
            appName: op.app_name || op.bundle_id,
            isRemoved: false,
            removalTime: null,
            survivalDays: null,
            totalOperations: 0,
            keywordSearchUrl: null,  // ⭐ 这些App不在removed_apps表中，没有链接数据
            targetPackageUrl: null,
            qimaiUrl: null,
          });
        }
      });

      // 统计每个App的操作记录数量
      operations?.forEach((op: any) => {
        const app = appMap.get(op.bundle_id);
        if (app) {
          app.totalOperations++;
        }
      });

      // 4. 格式化操作记录
      const formattedOperations = operations?.map((op: any) => ({
        id: op.id,
        bundleId: op.bundle_id,
        appName: op.app_name,
        operationType: op.operation_type,
        operationTime: op.operation_time,
        version: op.version,
        adVersion: op.ad_version,
        operator: op.operator,
        location: op.location,
        status: op.status,
        releaseType: op.release_type,
        remarks: op.remarks,
        hapSourceTable: op.hap_source_table,
      })) || [];

      // 5. 返回结果
      const apps = Array.from(appMap.values()).sort((a, b) => {
        // 已下架的排在前面
        if (a.isRemoved && !b.isRemoved) return -1;
        if (!a.isRemoved && b.isRemoved) return 1;
        // 按操作数量排序
        return b.totalOperations - a.totalOperations;
      });

      console.log(`[AppRemovalInvestigationService] ✅ 获取账号详情成功: ${apps.length}个App, ${formattedOperations.length}条操作记录`);

      return {
        apps,
        operations: formattedOperations,
      };
    } catch (error: any) {
      console.error(`[AppRemovalInvestigationService] ❌ 获取账号详情失败:`, error);
      throw error;
    }
  }

  /**
   * 计算App存活天数
   */
  private calculateSurvivalDays(operations: any[], removalTime: string): number | null {
    if (!operations || operations.length === 0) return null;

    // 找到第一次发布的时间
    const releaseOps = operations.filter((op: any) => op.operation_type === 'RELEASE');
    if (releaseOps.length === 0) return null;

    const firstRelease = releaseOps.reduce((earliest: any, op: any) => {
      return new Date(op.operation_time) < new Date(earliest.operation_time) ? op : earliest;
    });

    const firstReleaseDate = new Date(firstRelease.operation_time);
    const removalDate = new Date(removalTime);
    const diffMs = removalDate.getTime() - firstReleaseDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    return diffDays >= 0 ? diffDays : null;
  }

  /**
   * 获取账号分组列表（账号视图）
   * 按开发者账号分组，统计每个账号下的App数量、下架数量等
   */
  async getAccountGroupList(
    page: number = 1,
    pageSize: number = 20,
    search?: string,
    filters?: any
  ): Promise<{
    accounts: Array<{
      accountEmail: string;
      accountInfo: any;
      totalApps: number;
      removedApps: number;
      activeApps: number;
      latestRemovalTime: string | null;
      accountSurvivalDays: number | null;
    }>;
    total: number;
  }> {
    console.log(`[AppRemovalInvestigationService] 📊 获取账号分组列表: page=${page}, pageSize=${pageSize}`);

    try {
      // 1. 查询所有账号（分页获取，避免Supabase 1000条限制）
      let accountsData: any[] = [];
      let accountPage = 0;
      const accountPageSize = 1000;
      let hasMoreAccounts = true;

      while (hasMoreAccounts) {
        const { data: pageData, error: pageError } = await (this.supabaseClient as any).client
          .from('ri_developer_accounts')
          .select(`
            id,
            account_email,
            account_source,
            account_status,
            account_region,
            registration_date,
            pending_close_date,
            account_closed_date,
            account_quality_issues,
            account_product_count
          `)
          .range(accountPage * accountPageSize, (accountPage + 1) * accountPageSize - 1);

        if (pageError) {
          throw new Error(`查询账号数据失败(第${accountPage + 1}页): ${pageError.message}`);
        }

        if (!pageData || pageData.length === 0) {
          hasMoreAccounts = false;
        } else {
          accountsData = accountsData.concat(pageData);
          if (pageData.length < accountPageSize) {
            hasMoreAccounts = false;
          } else {
            accountPage++;
          }
        }
      }

      // 2. 查询所有下架App（分页获取，避免Supabase 1000条限制）
      let appsData: any[] = [];
      let currentPage = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: pageData, error: pageError } = await (this.supabaseClient as any).client
          .from('removed_apps')
          .select(`
            id,
            bundle_id,
            app_name,
            removal_time,
            account_id
          `)
          .range(currentPage * pageSize, (currentPage + 1) * pageSize - 1);

        if (pageError) {
          throw new Error(`查询下架App数据失败(第${currentPage + 1}页): ${pageError.message}`);
        }

        if (!pageData || pageData.length === 0) {
          hasMore = false;
        } else {
          appsData = appsData.concat(pageData);
          if (pageData.length < pageSize) {
            hasMore = false;
          } else {
            currentPage++;
          }
        }
      }
      
      const appsError = null; // 保持兼容性

      console.log(`[AppRemovalInvestigationService] 📊 从removed_apps查询到 ${appsData?.length || 0} 个App`);

      if (!accountsData || accountsData.length === 0) {
        return { accounts: [], total: 0 };
      }

      console.log(`[AppRemovalInvestigationService] 📊 从数据库查询到 ${accountsData.length} 个账号`);

      // 3. 按账号分组并关联下架App
      const accountMap = new Map<string, any>();

      accountsData.forEach((account: any) => {
        accountMap.set(account.id, {
          accountEmail: account.account_email,
          accountInfo: {
            account_email: account.account_email,
            account_source: account.account_source,
            account_status: account.account_status,
            account_region: account.account_region,
            registration_date: account.registration_date,
            pending_close_date: account.pending_close_date,
            account_closed_date: account.account_closed_date,
            account_quality_issues: account.account_quality_issues,
            account_product_count: account.account_product_count,
          },
          totalApps: 0,
          removedApps: 0,
          activeApps: 0,
          latestRemovalTime: null,
          apps: [],
        });
      });

      // 关联下架App到对应账号
      let linkedApps = 0;
      let unlinkedApps = 0;
      let latestRemovalTimeFound: string | null = null;
      
      (appsData || []).forEach((app: any) => {
        if (!app.account_id) {
          unlinkedApps++;
          return;
        }
        
        const accountData = accountMap.get(app.account_id);
        if (!accountData) {
          unlinkedApps++;
          return;
        }

        linkedApps++;
        accountData.totalApps++;
        accountData.apps.push(app);

        if (app.removal_time) {
          accountData.removedApps++;
          // 更新最新下架时间
          if (!accountData.latestRemovalTime || new Date(app.removal_time) > new Date(accountData.latestRemovalTime)) {
            accountData.latestRemovalTime = app.removal_time;
          }
          
          // 追踪全局最新下架时间
          if (!latestRemovalTimeFound || new Date(app.removal_time) > new Date(latestRemovalTimeFound)) {
            latestRemovalTimeFound = app.removal_time;
          }
        } else {
          accountData.activeApps++;
        }
      });
      
      console.log(`[AppRemovalInvestigationService] 📊 关联结果: ${linkedApps} 个App已关联, ${unlinkedApps} 个App未关联`);

      // 4. 转换为数组并计算账号存活天数
      let accounts = Array.from(accountMap.values()).map((account: any) => {
        const survivalDays = this.calculateAccountSurvivalDays(
          account.accountInfo.registration_date,
          account.accountInfo.pending_close_date,
          account.accountInfo.account_closed_date
        );

        return {
          accountEmail: account.accountEmail,
          accountInfo: account.accountInfo,
          totalApps: account.totalApps,
          removedApps: account.removedApps,
          activeApps: account.activeApps,
          latestRemovalTime: account.latestRemovalTime,
          accountSurvivalDays: survivalDays,
        };
      });

      // 5. 搜索过滤
      if (search) {
        accounts = accounts.filter((account: any) =>
          account.accountEmail.toLowerCase().includes(search.toLowerCase())
        );
      }

      // 6. 应用筛选条件
      if (filters) {
        // 账号来源筛选
        if (filters.accountSources && filters.accountSources.length > 0) {
          accounts = accounts.filter((account: any) =>
            account.accountInfo?.account_source &&
            filters.accountSources.includes(account.accountInfo.account_source)
          );
        }

        // 账号区域筛选
        if (filters.accountRegions && filters.accountRegions.length > 0) {
          accounts = accounts.filter((account: any) =>
            account.accountInfo?.account_region &&
            filters.accountRegions.includes(account.accountInfo.account_region)
          );
        }

        // 账号存活天数筛选
        if (filters.accountSurvivalDays) {
          const { min, max } = filters.accountSurvivalDays;
          accounts = accounts.filter((account: any) => {
            if (account.accountSurvivalDays === null) return false;
            if (min !== undefined && account.accountSurvivalDays < min) return false;
            if (max !== undefined && account.accountSurvivalDays > max) return false;
            return true;
          });
        }

        // 标记关停日期范围筛选
        if (filters.pendingCloseDateRange) {
          let { start, end } = filters.pendingCloseDateRange;
          
          // 如果start和end是同一天，将end设置为这一天的最后一刻
          if (start && end && new Date(start).getTime() === new Date(end).getTime()) {
            const endDate = new Date(end);
            endDate.setHours(23, 59, 59, 999);
            end = endDate.toISOString();
          }
          
          accounts = accounts.filter((account: any) => {
            if (!account.accountInfo?.pending_close_date) return false;
            const date = new Date(account.accountInfo.pending_close_date);
            if (start && date < new Date(start)) return false;
            if (end && date > new Date(end)) return false;
            return true;
          });
        }

        // 下架时间范围筛选
        if (filters.removalTimeRange) {
          let { start, end } = filters.removalTimeRange;
          
          // 如果start和end是同一天（时间戳完全相同），说明用户选择了单个日期
          // 需要将end设置为这一天的最后一刻（+24小时）
          if (start && end && new Date(start).getTime() === new Date(end).getTime()) {
            const endDate = new Date(end);
            endDate.setHours(23, 59, 59, 999);
            end = endDate.toISOString();
          }
          
          accounts = accounts.filter((account: any) => {
            if (!account.latestRemovalTime) return false;
            const date = new Date(account.latestRemovalTime);
            const startDate = start ? new Date(start) : null;
            const endDate = end ? new Date(end) : null;
            
            if (startDate && date < startDate) return false;
            if (endDate && date > endDate) return false;
            return true;
          });
        }
      }

      // 7. 排序：取标记关停时间和最近下架时间中较新的那个，按这个时间排序
      // 核心需求：第一时间看到最新出问题的账号（不管问题是标记关停还是下架）
      accounts.sort((a: any, b: any) => {
        const aPendingClose = a.accountInfo?.pending_close_date;
        const bPendingClose = b.accountInfo?.pending_close_date;
        const aRemoval = a.latestRemovalTime;
        const bRemoval = b.latestRemovalTime;
        
        // 计算每个账号的最新问题时间（取两个时间中较新的）
        const aLatestTime = this.getLatestTime(aPendingClose, aRemoval);
        const bLatestTime = this.getLatestTime(bPendingClose, bRemoval);
        
        // 都没有时间，按下架数量排序
        if (!aLatestTime && !bLatestTime) {
          return b.removedApps - a.removedApps;
        }
        
        // 有时间的排在前面
        if (aLatestTime && !bLatestTime) return -1;
        if (!aLatestTime && bLatestTime) return 1;
        
        // 都有时间，按时间由近及远排序（最新的排前面）
        return bLatestTime! - aLatestTime!;
      });

      const total = accounts.length;

      // 8. 分页
      const startIndex = (page - 1) * pageSize;
      const paginatedAccounts = accounts.slice(startIndex, startIndex + pageSize);

      console.log(`[AppRemovalInvestigationService] ✅ 获取账号分组成功: ${total}个账号, 返回${paginatedAccounts.length}个`);

      return {
        accounts: paginatedAccounts,
        total,
      };
    } catch (error: any) {
      console.error(`[AppRemovalInvestigationService] ❌ 获取账号分组失败:`, error);
      throw error;
    }
  }

  /**
   * 获取两个时间中较新的那个（返回时间戳）
   */
  private getLatestTime(time1: string | null | undefined, time2: string | null | undefined): number | null {
    const t1 = time1 ? new Date(time1).getTime() : null;
    const t2 = time2 ? new Date(time2).getTime() : null;
    
    if (t1 === null && t2 === null) return null;
    if (t1 === null) return t2;
    if (t2 === null) return t1;
    
    return Math.max(t1, t2);
  }

  /**
   * 计算账号存活天数
   */
  private calculateAccountSurvivalDays(
    registrationDate: string | null,
    pendingCloseDate: string | null,
    accountClosedDate: string | null
  ): number | null {
    if (!registrationDate) return null;

    const startDate = new Date(registrationDate);
    const endDate = pendingCloseDate
      ? new Date(pendingCloseDate)
      : (accountClosedDate ? new Date(accountClosedDate) : new Date());

    const diffMs = endDate.getTime() - startDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    return diffDays >= 0 ? diffDays : null;
  }

  /**
   * 获取APP下架原因分析
   */
  async getRemovalAnalysis(bundleId: string): Promise<{
    bundleId: string;
    analysisContent: string | null;
    createdBy: string | null;
    updatedBy: string | null;
    createdAt: string | null;
    updatedAt: string | null;
  } | null> {
    try {
      const { data, error } = await (this.supabaseClient as any).client
        .from('app_removal_analysis')
        .select('*')
        .eq('bundle_id', bundleId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (!data) {
        return null;
      }

      return {
        bundleId: data.bundle_id,
        analysisContent: data.analysis_content,
        createdBy: data.created_by,
        updatedBy: data.updated_by,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    } catch (error) {
      console.error(`[AppRemovalInvestigationService] ❌ 获取下架原因分析失败:`, error);
      throw error;
    }
  }

  /**
   * 保存APP下架原因分析
   */
  async saveRemovalAnalysis(params: {
    bundleId: string;
    analysisContent: string;
    operator?: string;
  }): Promise<void> {
    try {
      const { bundleId, analysisContent, operator } = params;

      // 检查是否已存在
      const existing = await this.getRemovalAnalysis(bundleId);

      if (existing) {
        // 更新
        const { error } = await (this.supabaseClient as any).client
          .from('app_removal_analysis')
          .update({
            analysis_content: analysisContent,
            updated_by: operator || null,
            updated_at: new Date().toISOString(),
          })
          .eq('bundle_id', bundleId);

        if (error) throw error;
        console.log(`[AppRemovalInvestigationService] ✅ 更新下架原因分析: ${bundleId}`);
      } else {
        // 插入
        const { error } = await (this.supabaseClient as any).client
          .from('app_removal_analysis')
          .insert({
            bundle_id: bundleId,
            analysis_content: analysisContent,
            created_by: operator || null,
            updated_by: operator || null,
          });

        if (error) throw error;
        console.log(`[AppRemovalInvestigationService] ✅ 创建下架原因分析: ${bundleId}`);
      }
    } catch (error) {
      console.error(`[AppRemovalInvestigationService] ❌ 保存下架原因分析失败:`, error);
      throw error;
    }
  }

  /**
   * 导出下架App数据到Excel
   * 
   * @param filters 筛选条件
   * @param search 搜索关键词
   * @returns Excel数据（带详细字段）
   */
  async exportToExcel(params: {
    search?: string;
    filters?: any;
  }): Promise<any[]> {
    try {
      console.log('[AppRemovalInvestigationService] 📊 开始导出Excel数据...');
      
      const { search, filters } = params;

      // 查询所有符合条件的App（不分页，获取全部）
      // ⭐ 与 getApps 保持一致，明确列出需要的字段
      let query = (this.supabaseClient as any).client
        .from('removed_apps')
        .select(`
          *,
          account:ri_developer_accounts!account_id (
            account_email,
            account_source,
            account_source_type,
            account_status,
            account_expiry_date,
            account_closed_date,
            pending_close_date,
            account_region,
            account_quality_issues,
            account_product_count,
            registration_date
          )
        `)
        .order('removal_time', { ascending: false });

      // 应用搜索条件
      if (search) {
        query = query.or(`bundle_id.ilike.%${search}%,app_name.ilike.%${search}%`);
      }

      // 应用筛选条件（与getApps方法保持一致）
      if (filters) {
        // 下架时间范围
        if (filters.removalTimeRange) {
          // 支持两种格式：{start, end} 或 {from, to}
          let start = filters.removalTimeRange.start || filters.removalTimeRange.from;
          let end = filters.removalTimeRange.end || filters.removalTimeRange.to;
          
          // 如果start和end是同一天，将end设置为这一天的最后一刻
          if (start && end && new Date(start).getTime() === new Date(end).getTime()) {
            const endDate = new Date(end);
            endDate.setHours(23, 59, 59, 999);
            end = endDate.toISOString();
          }
          
          if (start) {
            query = query.gte('removal_time', start);
          }
          if (end) {
            query = query.lte('removal_time', end);
          }
        }

        // App存活天数
        if (filters.appSurvivalDays?.min !== undefined) {
          query = query.gte('survival_days', filters.appSurvivalDays.min);
        }
        if (filters.appSurvivalDays?.max !== undefined) {
          query = query.lte('survival_days', filters.appSurvivalDays.max);
        }
      }

      const { data: apps, error } = await query;

      if (error) {
        throw new Error(`查询App数据失败: ${error.message}`);
      }

      if (!apps || apps.length === 0) {
        return [];
      }

      console.log(`[AppRemovalInvestigationService] 📋 找到 ${apps.length} 个App`);

      // 转换为与 getApps 一致的格式（snake_case -> camelCase）
      const formattedApps = apps.map((app: any) => ({
        ...app,
        accountInfo: app.account ? {
          accountEmail: app.account.account_email,
          accountSource: app.account.account_source,  // ⭐ 正确的字段名：account_source
          accountSourceType: app.account.account_source_type,
          accountStatus: app.account.account_status,
          accountExpiryDate: app.account.account_expiry_date,
          accountClosedDate: app.account.account_closed_date,
          pendingCloseDate: app.account.pending_close_date,
          accountRegion: app.account.account_region,
          accountQualityIssues: app.account.account_quality_issues,
          accountProductCount: app.account.account_product_count,
          registrationDate: app.account.registration_date,
        } : null,
      }));

      // 应用账号相关的筛选（与 getApps 保持一致）
      let filteredApps = formattedApps;
      
      if (filters) {
        // 账号来源筛选
        if (filters.accountSources && filters.accountSources.length > 0) {
          filteredApps = filteredApps.filter((app: any) => 
            app.accountInfo?.accountSource && 
            filters.accountSources.includes(app.accountInfo.accountSource)
          );
        }

        // 账号区域筛选
        if (filters.accountRegions && filters.accountRegions.length > 0) {
          filteredApps = filteredApps.filter((app: any) =>
            app.accountInfo?.accountRegion &&
            filters.accountRegions.includes(app.accountInfo.accountRegion)
          );
        }

        // 账号存活天数筛选
        if (filters.accountSurvivalDays) {
          const { min, max } = filters.accountSurvivalDays;
          filteredApps = filteredApps.filter((app: any) => {
            if (!app.accountInfo?.registrationDate) return false;
            
            const survivalDays = this.calculateAccountSurvivalDays(
              app.accountInfo.registrationDate,
              app.accountInfo.pendingCloseDate,
              app.accountInfo.accountClosedDate
            );
            
            if (min !== undefined && (survivalDays === null || survivalDays < min)) {
              return false;
            }
            if (max !== undefined && (survivalDays === null || survivalDays > max)) {
              return false;
            }
            return true;
          });
        }

        // 标记关停时间范围筛选（⭐ 与 getApps 保持一致：使用 start/end）
        if (filters.pendingCloseDateRange) {
          let { start, end } = filters.pendingCloseDateRange;
          
          // 如果start和end是同一天，将end设置为这一天的最后一刻
          if (start && end && new Date(start).getTime() === new Date(end).getTime()) {
            const endDate = new Date(end);
            endDate.setHours(23, 59, 59, 999);
            end = endDate.toISOString();
          }
          
          filteredApps = filteredApps.filter((app: any) => {
            if (!app.accountInfo?.pendingCloseDate) return false;
            const date = new Date(app.accountInfo.pendingCloseDate);
            if (start && date < new Date(start)) return false;
            if (end && date > new Date(end)) return false;
            return true;
          });
        }
      }

      // 获取每个App的操作记录（用于提取广告版本、操作人、发布地点等）
      const enrichedApps = await Promise.all(
        filteredApps.map(async (app: any) => {
          // 查询操作记录
          const { data: operations, error: opsError } = await (this.supabaseClient as any).client
            .from('operation_records')
            .select('*')
            .eq('bundle_id', app.bundle_id)
            .order('operation_time', { ascending: true });

          if (opsError) {
            console.error(`[AppRemovalInvestigationService] ❌ 查询操作记录失败 [${app.bundle_id}]:`, opsError.message);
          }

          // 提取操作记录中的字段（用于筛选和导出）
          const adVersions = new Set<string>();
          const operators = new Set<string>();
          const locations = new Set<string>();

          if (operations && operations.length > 0) {
            operations.forEach((op: any) => {
              if (op.ad_version) adVersions.add(op.ad_version);
              if (op.operator) operators.add(op.operator);
              if (op.location) locations.add(op.location);
            });
          }

          // 应用操作记录相关的筛选
          if (filters) {
            // 广告版本筛选
            if (filters.adVersions && filters.adVersions.length > 0) {
              const hasMatchingAdVersion = Array.from(adVersions).some((v: string) => 
                filters.adVersions.includes(v)
              );
              if (!hasMatchingAdVersion) return null;
            }

            // 操作人筛选
            if (filters.operators && filters.operators.length > 0) {
              const hasMatchingOperator = Array.from(operators).some((o: string) => 
                filters.operators.includes(o)
              );
              if (!hasMatchingOperator) return null;
            }

            // 发布地点筛选
            if (filters.locations && filters.locations.length > 0) {
              const hasMatchingLocation = Array.from(locations).some((l: string) => 
                filters.locations.includes(l)
              );
              if (!hasMatchingLocation) return null;
            }
          }

          // 获取下架原因分析
          let analysisContent = '';
          try {
            const analysis = await this.getRemovalAnalysis(app.bundle_id);
            if (analysis) {
              analysisContent = analysis.analysisContent || '';
            }
          } catch (err) {
            // 忽略错误
          }

          // 返回丰富的数据（用于导出）
          return {
            bundleId: app.bundle_id,
            appName: app.app_name,
            appId: app.app_id,
            removalTime: app.removal_time ? new Date(app.removal_time).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '',
            survivalDays: app.survival_days,
            firstReleaseTime: app.first_release_time ? new Date(app.first_release_time).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '',
            lastUpdateTime: app.last_update_time ? new Date(app.last_update_time).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '',
            totalOperations: operations?.length || 0,
            
            // 账号信息（⭐ 使用 accountInfo，已在前面转换）
            accountEmail: app.accountInfo?.accountEmail || '',
            accountStatus: app.accountInfo?.accountStatus || '',
            accountSource: app.accountInfo?.accountSource || '',
            accountRegion: app.accountInfo?.accountRegion || '',
            accountExpiryDate: app.accountInfo?.accountExpiryDate ? new Date(app.accountInfo.accountExpiryDate).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '',
            accountClosedDate: app.accountInfo?.accountClosedDate ? new Date(app.accountInfo.accountClosedDate).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '',
            pendingCloseDate: app.accountInfo?.pendingCloseDate ? new Date(app.accountInfo.pendingCloseDate).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '',
            accountQuality: app.accountInfo?.accountQualityIssues ? (Array.isArray(app.accountInfo.accountQualityIssues) ? app.accountInfo.accountQualityIssues.join(', ') : app.accountInfo.accountQualityIssues) : '',
            accountProductCount: app.accountInfo?.accountProductCount || 0,
            
            // 操作记录汇总
            adVersions: Array.from(adVersions).join(', '),
            operators: Array.from(operators).join(', '),
            locations: Array.from(locations).join(', '),
            
            // 链接信息
            keywordSearchUrl: app.keyword_search_url || '',
            targetPackageUrl: app.target_package_url || '',
            qimaiUrl: app.qimai_url || '',
            
            // 下架原因分析
            analysisContent,
          };
        })
      );

      // 过滤掉null值（不符合筛选条件的）
      const result = enrichedApps.filter(app => app !== null);
      
      console.log(`[AppRemovalInvestigationService] ✅ 导出数据准备完成: ${result.length} 条记录`);
      
      return result;
    } catch (error) {
      console.error('[AppRemovalInvestigationService] ❌ 导出Excel失败:', error);
      throw error;
    }
  }
}

