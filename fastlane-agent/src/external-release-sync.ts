/**
 * 外部审核同步服务
 * 
 * 功能：
 * - 从明道云同步"正式包审核中"的记录到 Supabase releases 表
 * - 支持两张表：App生产发布表（首次发布）+ App更新任务表（升级发布）
 * - 去重逻辑：bundle_id + version
 * - 复用现有审核监控系统
 * 
 * 版本：8.0
 * 创建日期：2026-01-17
 */

import { HapClient } from './hap-client';
import { SupabaseClient } from './supabase-client';
import { createClient } from '@supabase/supabase-js';

// ==================== 字段ID定义 ====================

const FIELD_IDS = {
  // App生产发布表 (65612ddfc96f80bfabe5df2e)
  PRODUCTION: {
    APP_NAME: '64b168be624fef0d46c11058',
    VERSION: '64b168be624fef0d46c11068',
    BUNDLE_ID: '64b168be624fef0d46c1105b',
    RELEASE_TIME: '64b168be624fef0d46c1106b',
    RELEASE_PERSON: '64b3ead57658fd2098b7e311',
    STATUS: '64b168be624fef0d46c11054',
    DEVELOPER_ACCOUNT: '64b168be624fef0d46c1105d', // 关联字段
  },
  
  // App更新任务表 (640ab32a56058b3df8803af2)
  UPDATE: {
    TASK_NAME: '64097218d867a5c9c89b043b',
    VERSION: '641f033f5815faac860d15de',
    SUBMIT_TIME: '641ee11b56350b78574cf7c1',
    RELEASE_PERSON: '64366cddcb42afb8b5e79583',
    RELEASE_STATUS: '6436a3aa56462b8747397762',
    PRODUCT_RELATION: '6437343d6e173a52dea04494', // 关联到"账号上的产品"
    APP_ID: '643a18f30c49f729a4893c46', // App ID
  },
  
  // 账号上的产品表 (643418197f0301fb51750f00)
  PRODUCTS: {
    BUNDLE_ID: '64b3a82fa75368cd24c99d8d',
    ACCOUNT_RELATION: '64341940fa601169896433f6', // 苹果开发者账号关联
  },
};

// 状态Key值（明道云V3 API使用）
const STATUS_KEYS = {
  PRODUCTION_REVIEWING: '37f6baa7-3045-49f7-b28a-fd340ced3ba8', // App生产发布表：正式包审核中
  UPDATE_REVIEWING: 'a82b43e3-1d40-4d3e-b87d-1d3a80c489bf',     // App更新任务表：正式包审核中
};

// 表ID
const WORKSHEETS = {
  PRODUCTION: process.env.HAP_WORKSHEET_PRODUCTION_RELEASES || '65612ddfc96f80bfabe5df2e',
  UPDATE: process.env.HAP_WORKSHEET_UPDATE_TASKS || '640ab32a56058b3df8803af2',
  PRODUCTS: process.env.HAP_WORKSHEET_PRODUCTS || '643418197f0301fb51750f00',
};

// ==================== 接口定义 ====================

export interface ExternalReleaseSyncResult {
  success: boolean;
  data?: {
    newCount: number;
    existCount: number;
    failCount: number;
    failedApps: Array<{
      appName: string;
      version: string;
      error: string;
    }>;
  };
  error?: string;
}

interface ReleaseRecord {
  bundleId: string;
  appName: string;
  version: string;
  accountEmail: string; // Apple ID 邮箱
  appStoreId: string | null; // App Store ID（数字）
  submittedAt: string;
  deployedBy: string;
  apiKeyId: string;
  apiKeyIssuerId: string;
  apiKeyContent: string;
  teamId: string;
  itcTeamId?: string;
}

// ==================== 服务类 ====================

export class ExternalReleaseSync {
  private isSyncing = false;
  private supabase: ReturnType<typeof createClient>;

  constructor(
    private hapClient: HapClient,
    private supabaseClient: SupabaseClient
  ) {
    // 直接创建 Supabase client 用于原始查询
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase 环境变量未配置');
    }
    
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * 同步外部提交的审核记录
   */
  async syncExternalReleases(): Promise<ExternalReleaseSyncResult> {
    if (this.isSyncing) {
      throw new Error('同步正在进行中，请稍候再试');
    }

    this.isSyncing = true;

    try {
      console.log('[ExternalReleaseSync] 🚀 开始同步外部审核记录...');

      const result = {
        newCount: 0,
        existCount: 0,
        failCount: 0,
        failedApps: [] as Array<{ appName: string; version: string; error: string }>,
      };

      // 1. 从"App生产发布表"读取"正式包审核中"记录
      console.log('[ExternalReleaseSync] 📋 查询App生产发布表...');
      const productionRecords = await this.fetchProductionReleases();
      console.log(`[ExternalReleaseSync] 找到 ${productionRecords.length} 条生产发布记录`);

      // 2. 从"App更新任务表"读取"正式包审核中"记录
      console.log('[ExternalReleaseSync] 📋 查询App更新任务表...');
      const updateRecords = await this.fetchUpdateTasks();
      console.log(`[ExternalReleaseSync] 找到 ${updateRecords.length} 条更新任务记录`);

      // 3. 合并所有记录
      const allRecords = [...productionRecords, ...updateRecords];
      console.log(`[ExternalReleaseSync] 总计 ${allRecords.length} 条待同步记录`);

      // 4. 逐条处理
      for (const record of allRecords) {
        try {
          // 检查去重
          const exists = await this.checkIfExists(record.bundleId, record.version);
          
          if (exists) {
            console.log(`[ExternalReleaseSync] ⏭️  已存在: ${record.appName} v${record.version}`);
            result.existCount++;
            continue;
          }

          // 插入记录
          await this.insertRelease(record);
          console.log(`[ExternalReleaseSync] ✅ 新增: ${record.appName} v${record.version}`);
          result.newCount++;

        } catch (error: any) {
          console.error(`[ExternalReleaseSync] ❌ 失败: ${record.appName} v${record.version}`, error.message);
          result.failCount++;
          result.failedApps.push({
            appName: record.appName,
            version: record.version,
            error: error.message,
          });
        }
      }

      console.log('[ExternalReleaseSync] ✅ 同步完成');
      console.log(`[ExternalReleaseSync] 新增: ${result.newCount}, 已存在: ${result.existCount}, 失败: ${result.failCount}`);

      this.isSyncing = false;

      return {
        success: true,
        data: result,
      };

    } catch (error: any) {
      this.isSyncing = false;
      console.error('[ExternalReleaseSync] ❌ 同步失败:', error.message);
      
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 从"App生产发布表"获取"正式包审核中"记录
   */
  private async fetchProductionReleases(): Promise<ReleaseRecord[]> {
    const appKey = process.env.HAP_APP_KEY_PRODUCTION_RELEASES;
    const sign = process.env.HAP_SIGN_PRODUCTION_RELEASES;

    if (!appKey || !sign) {
      console.log('[ExternalReleaseSync] ⚠️  App生产发布表认证未配置，跳过');
      return [];
    }

    const records = await this.fetchFromHap(
      WORKSHEETS.PRODUCTION,
      {
        filter: {
          type: 'group',
          logic: 'AND',
          children: [
            {
              type: 'condition',
              field: FIELD_IDS.PRODUCTION.STATUS,
              operator: 'eq',
              value: [STATUS_KEYS.PRODUCTION_REVIEWING],
            },
          ],
        },
      },
      appKey,
      sign
    );

    const results: ReleaseRecord[] = [];

    for (const record of records) {
      try {
        const bundleId = this.getFieldValue(record, FIELD_IDS.PRODUCTION.BUNDLE_ID);
        
        if (!bundleId) {
          console.warn(`[ExternalReleaseSync] 跳过无Bundle ID的生产发布记录`);
          continue;
        }

        // 获取开发者账号（可能是邮箱字符串或关联对象）
        const developerAccount = this.getFieldValue(record, FIELD_IDS.PRODUCTION.DEVELOPER_ACCOUNT);
        
        if (!developerAccount) {
          console.warn(`[ExternalReleaseSync] 跳过无开发者账号的生产发布记录: ${bundleId}`);
          continue;
        }

        let accountInfo;
        let accountIdentifier = '';
        
        // 判断是字符串（邮箱）还是关联对象
        if (typeof developerAccount === 'string') {
          // 通过邮箱查询账号
          accountIdentifier = developerAccount;
          accountInfo = await this.getAppleAccountByEmail(developerAccount);
        } else if (Array.isArray(developerAccount) && developerAccount.length > 0) {
          // 通过关联row ID查询账号
          const accountRowId = developerAccount[0].sid || developerAccount[0];
          accountIdentifier = accountRowId;
          accountInfo = await this.getAppleAccountByRowId(accountRowId);
        } else {
          console.warn(`[ExternalReleaseSync] 开发者账号字段格式不正确: ${bundleId}`);
          continue;
        }
        
        if (!accountInfo) {
          throw new Error(`无法获取账号 ${accountIdentifier} 的配置信息`);
        }

        const appName = this.getFieldValue(record, FIELD_IDS.PRODUCTION.APP_NAME) || bundleId;
        const version = this.getFieldValue(record, FIELD_IDS.PRODUCTION.VERSION) || '1.0';
        const releaseTime = this.getFieldValue(record, FIELD_IDS.PRODUCTION.RELEASE_TIME);
        const releasePerson = this.parseUserField(this.getFieldValue(record, FIELD_IDS.PRODUCTION.RELEASE_PERSON));

        results.push({
          bundleId,
          appName,
          version,
          accountEmail: accountInfo.appleId, // 账号邮箱
          appStoreId: null, // 生产发布表没有App Store ID
          submittedAt: releaseTime ? new Date(releaseTime).toISOString() : new Date().toISOString(),
          deployedBy: `外部提交-${releasePerson || '未知'}`, // 添加前缀标识外部提交
          apiKeyId: accountInfo.apiKeyId,
          apiKeyIssuerId: accountInfo.apiKeyIssuerId,
          apiKeyContent: accountInfo.apiKeyContent,
          teamId: accountInfo.teamId,
          itcTeamId: accountInfo.itcTeamId,
        });

      } catch (error: any) {
        console.error(`[ExternalReleaseSync] 处理生产发布记录失败:`, error.message);
        // 继续处理下一条
      }
    }

    return results;
  }

  /**
   * 从"App更新任务表"获取"正式包审核中"记录
   */
  private async fetchUpdateTasks(): Promise<ReleaseRecord[]> {
    const appKey = process.env.HAP_APP_KEY;
    const sign = process.env.HAP_SIGN;

    if (!appKey || !sign) {
      console.log('[ExternalReleaseSync] ⚠️  App更新任务表认证未配置，跳过');
      return [];
    }

    const records = await this.fetchFromHap(
      WORKSHEETS.UPDATE,
      {
        filter: {
          type: 'group',
          logic: 'AND',
          children: [
            {
              type: 'condition',
              field: FIELD_IDS.UPDATE.RELEASE_STATUS,
              operator: 'eq',
              value: [STATUS_KEYS.UPDATE_REVIEWING],
            },
          ],
        },
      },
      appKey,
      sign
    );

    const results: ReleaseRecord[] = [];

    for (const record of records) {
      try {
        // 获取关联的产品记录（用于获取Bundle ID）
        const productRelation = this.getFieldValue(record, FIELD_IDS.UPDATE.PRODUCT_RELATION);
        
        if (!productRelation || !Array.isArray(productRelation) || productRelation.length === 0) {
          console.warn(`[ExternalReleaseSync] 跳过无产品关联的更新任务记录`);
          continue;
        }

        const productRowId = productRelation[0].sid || productRelation[0];
        
        // 查询"账号上的产品"表获取Bundle ID
        const bundleId = await this.getBundleIdFromProduct(productRowId);
        
        if (!bundleId) {
          console.warn(`[ExternalReleaseSync] 无法获取产品 ${productRowId} 的Bundle ID`);
          continue;
        }

        // 获取 Apple API Key
        const accountInfo = await this.hapClient.getAppleAccountByBundleId(bundleId);
        
        if (!accountInfo) {
          throw new Error(`无法获取 Bundle ID ${bundleId} 的账号配置`);
        }

        const appName = this.getFieldValue(record, FIELD_IDS.UPDATE.TASK_NAME) || bundleId;
        const version = this.getFieldValue(record, FIELD_IDS.UPDATE.VERSION) || '1.0';
        const submitTime = this.getFieldValue(record, FIELD_IDS.UPDATE.SUBMIT_TIME);
        const releasePerson = this.parseUserField(this.getFieldValue(record, FIELD_IDS.UPDATE.RELEASE_PERSON));
        const appStoreId = this.getFieldValue(record, FIELD_IDS.UPDATE.APP_ID);

        results.push({
          bundleId,
          appName,
          version,
          accountEmail: accountInfo.appleId, // 账号邮箱
          appStoreId: appStoreId || null, // App Store ID
          submittedAt: submitTime ? new Date(submitTime).toISOString() : new Date().toISOString(),
          deployedBy: `外部提交-${releasePerson || '未知'}`, // 添加前缀标识外部提交
          apiKeyId: accountInfo.apiKeyId,
          apiKeyIssuerId: accountInfo.apiKeyIssuerId,
          apiKeyContent: accountInfo.apiKeyContent,
          teamId: accountInfo.teamId,
          itcTeamId: accountInfo.itcTeamId,
        });

      } catch (error: any) {
        console.error(`[ExternalReleaseSync] 处理更新任务记录失败:`, error.message);
        // 继续处理下一条
      }
    }

    return results;
  }

  /**
   * 通过邮箱查询苹果开发者账号
   */
  private async getAppleAccountByEmail(email: string): Promise<any | null> {
    try {
      // 账号表使用默认认证
      const appKey = process.env.HAP_APP_KEY;
      const sign = process.env.HAP_SIGN;

      if (!appKey || !sign) {
        console.error('[ExternalReleaseSync] 缺少认证信息');
        return null;
      }

      const accountsWorksheet = process.env.HAP_WORKSHEET_ACCOUNTS;
      if (!accountsWorksheet) {
        console.error('[ExternalReleaseSync] 缺少账号表ID');
        return null;
      }

      // 通过邮箱查询账号表
      const url = `https://api.mingdao.com/v3/app/worksheets/${accountsWorksheet}/rows/list`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'HAP-Appkey': appKey,
          'HAP-Sign': sign,
        },
        body: JSON.stringify({
          pageSize: 1,
          pageIndex: 1,
          useFieldIdAsKey: true,
          filter: {
            type: 'group',
            logic: 'AND',
            children: [{
              type: 'condition',
              field: '640adea9c04c8d453ff1ce53', // kfzzh (Apple ID邮箱)
              operator: 'eq',
              value: [email]
            }]
          }
        }),
      });

      const data: any = await response.json();
      
      if (!data.success || !data.data?.rows || data.data.rows.length === 0) {
        console.error(`[ExternalReleaseSync] 未找到邮箱 ${email} 对应的账号`);
        return null;
      }

      const accountData = data.data.rows[0];

      // 提取API Key字段（使用正确的字段ID，与 hap-client.ts 保持一致）
      const appleId = accountData['kfzzh'] || accountData['640adea9c04c8d453ff1ce53'] || '';
      const teamId = accountData['team_id'] || accountData['657f119fbf6617bba9bc1665'] || '';
      const apiKeyId = accountData['my_id'] || accountData['657f119fbf6617bba9bc1664'] || '';
      const apiKeyIssuerId = accountData['issuer_id'] || accountData['657f119fbf6617bba9bc1663'] || '';
      let apiKeyContent = accountData['apimywjwb_apikey_jsonky_'] || accountData['6586b9ad7810bed3f4a1c5eb'] || '';

      // 处理 API 密钥内容中的转义字符（\\n 替换为 \n）
      if (apiKeyContent) {
        apiKeyContent = String(apiKeyContent).replace(/\\\\n/g, '\n');
      }

      return {
        appleId,
        teamId,
        itcTeamId: teamId,
        apiKeyId,
        apiKeyIssuerId,
        apiKeyContent,
      };

    } catch (error: any) {
      console.error(`[ExternalReleaseSync] 通过邮箱查询账号失败:`, error.message);
      return null;
    }
  }

  /**
   * 直接通过账号表row ID获取Apple API Key信息
   * 使用 V3 API: GET /v3/app/worksheets/{worksheet_id}/rows/{row_id}
   */
  private async getAppleAccountByRowId(accountRowId: string): Promise<any | null> {
    try {
      // 账号表使用默认认证
      const appKey = process.env.HAP_APP_KEY;
      const sign = process.env.HAP_SIGN;

      if (!appKey || !sign) {
        console.error('[ExternalReleaseSync] 缺少认证信息');
        return null;
      }

      const accountsWorksheet = process.env.HAP_WORKSHEET_ACCOUNTS;
      if (!accountsWorksheet) {
        console.error('[ExternalReleaseSync] 缺少账号表ID');
        return null;
      }

      // 使用 V3 API 查询账号表获取API Key信息
      const url = `https://api.mingdao.com/v3/app/worksheets/${accountsWorksheet}/rows/${accountRowId}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'HAP-Appkey': appKey,
          'HAP-Sign': sign,
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          console.error(`[ExternalReleaseSync] 账号不存在: ${accountRowId}`);
          return null;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: any = await response.json();
      
      if (!data.success) {
        console.error(`[ExternalReleaseSync] 查询账号失败: ${data.error_msg}`);
        return null;
      }

      const accountData = data.data;
      if (!accountData) {
        return null;
      }

      // 提取API Key字段（使用正确的字段ID，与 hap-client.ts 保持一致）
      const appleId = accountData['kfzzh'] || accountData['640adea9c04c8d453ff1ce53'] || '';
      const teamId = accountData['team_id'] || accountData['657f119fbf6617bba9bc1665'] || '';
      const apiKeyId = accountData['my_id'] || accountData['657f119fbf6617bba9bc1664'] || '';
      const apiKeyIssuerId = accountData['issuer_id'] || accountData['657f119fbf6617bba9bc1663'] || '';
      let apiKeyContent = accountData['apimywjwb_apikey_jsonky_'] || accountData['6586b9ad7810bed3f4a1c5eb'] || '';

      // 处理 API 密钥内容中的转义字符（\\n 替换为 \n）
      if (apiKeyContent) {
        apiKeyContent = String(apiKeyContent).replace(/\\\\n/g, '\n');
      }

      return {
        appleId,
        teamId,
        itcTeamId: teamId, // ITC Team ID 通常与 Team ID 相同
        apiKeyId,
        apiKeyIssuerId,
        apiKeyContent,
      };

    } catch (error: any) {
      console.error(`[ExternalReleaseSync] 获取账号信息失败:`, error.message);
      return null;
    }
  }

  /**
   * 通过产品rowId查询Bundle ID
   */
  private async getBundleIdFromProduct(productRowId: string): Promise<string | null> {
    try {
      const url = `https://api.mingdao.com/v3/app/worksheets/${WORKSHEETS.PRODUCTS}/rows/${productRowId}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'HAP-Appkey': process.env.HAP_APP_KEY || '',
          'HAP-Sign': process.env.HAP_SIGN || '',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: any = await response.json();
      
      if (!data.success) {
        throw new Error(data.error_msg || `API Error: ${data.error_code}`);
      }

      const bundleId = data.data?.[FIELD_IDS.PRODUCTS.BUNDLE_ID];
      return bundleId || null;

    } catch (error: any) {
      console.error(`[ExternalReleaseSync] 查询产品Bundle ID失败:`, error.message);
      return null;
    }
  }

  /**
   * 检查记录是否已存在（去重）
   */
  private async checkIfExists(bundleId: string, version: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('releases')
      .select('id')
      .eq('bundle_id', bundleId)
      .eq('version', version)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
      console.error(`[ExternalReleaseSync] 查询去重失败:`, error.message);
    }

    return !!data;
  }

  /**
   * 插入发布记录到 Supabase
   */
  private async insertRelease(record: ReleaseRecord): Promise<void> {
    // 注意：deployed_by 字段现在是 UUID 类型（RBAC更新后）
    // 对于外部同步的记录，我们将用户信息存储在 metadata 中
    const insertData: any = {
      project_id: null, // 外部同步的记录没有项目ID
      bundle_id: record.bundleId,
      app_name: record.appName,
      version: record.version,
      build_number: '1', // 明道云表未维护，统一设为 "1"
      account_email: record.accountEmail, // 账号邮箱（Apple ID）
      app_store_id: record.appStoreId, // App Store ID（可空）
      team_id: record.teamId,
      itc_team_id: record.itcTeamId,
      api_key_id: record.apiKeyId,
      api_key_issuer_id: record.apiKeyIssuerId,
      api_key_content: record.apiKeyContent,
      submitted_at: record.submittedAt,
      // deployed_by: 不设置，让数据库使用默认值或NULL
      source: 'manual', // 标记为手动同步
      review_status: 'WAITING_FOR_REVIEW', // 初始状态
      monitor_enabled: true, // 默认启用监控
      is_first_release: false, // 外部提交默认为升级发布
      metadata: {
        external_submitter: record.deployedBy, // 将明道云用户名存储在metadata中
        synced_from: 'mingdao',
        synced_at: new Date().toISOString(),
      },
    };

    const { error } = await (this.supabase as any)
      .from('releases')
      .insert(insertData);

    if (error) {
      throw new Error(`插入记录失败: ${error.message}`);
    }
  }

  /**
   * 从明道云获取记录（通用方法）
   */
  private async fetchFromHap(
    worksheetId: string,
    options: { filter?: any } = {},
    appKey?: string,
    sign?: string
  ): Promise<any[]> {
    const url = `https://api.mingdao.com/v3/app/worksheets/${worksheetId}/rows/list`;

    const body: any = {
      pageSize: 100,
      pageIndex: 1,
      useFieldIdAsKey: true,
    };

    if (options.filter) {
      body.filter = options.filter;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'HAP-Appkey': appKey || process.env.HAP_APP_KEY || '',
        'HAP-Sign': sign || process.env.HAP_SIGN || '',
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

    return data.data?.rows || [];
  }

  /**
   * 获取字段值
   */
  private getFieldValue(record: any, fieldId: string): any {
    return record[fieldId] !== undefined && record[fieldId] !== null ? record[fieldId] : null;
  }

  /**
   * 解析用户字段
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
   * 获取同步状态
   */
  isSyncRunning(): boolean {
    return this.isSyncing;
  }
}
