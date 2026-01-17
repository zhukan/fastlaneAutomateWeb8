/**
 * 明道云 HAP 客户端
 * 用于查询 Bundle ID 对应的苹果开发者账号信息
 * 
 * API 版本: V3 (2024-12 升级)
 * - V3 API 对选项字段的 eq 操作符使用 Key 值（UUID），而非文字值
 * - V3 API 的筛选准确，无需客户端侧过滤
 */

import { HapAppProduct } from './types';

// ==================== 选项字段 Key 值映射 ====================
// "账号上的产品"表 - App状态字段 (64366ef856462b8747391a08)
export const APP_STATUS_KEYS = {
  PUBLISHING: '575f136c-069f-4285-af20-fae37f84b431',           // 发布中
  FORMAL_REVIEWING: '4cc84339-274c-4993-8f37-ba818413605c',     // 正式包审核中
  FORMAL_ONLINE: '04dcdcd6-99cc-48be-8a83-8698d0e06cf5',        // 正式包上架
  MANUAL_OFFLINE: 'dfb457c6-ed7d-438d-8098-7d31afc445b9',       // 手动下架
  FORMAL_REJECTED: 'e2e82581-cbf2-4bc5-90c5-005b3b3c31af',      // 正式包审核不通过
  WHITE_ONLINE: '2d8b33e5-2d7c-476d-a22c-3a4a63942986',         // 白包上架
  WHITE_REVIEWING: '045d25da-1a24-4f20-8f1c-cde8967c98fd',      // 白包审核中
  WHITE_DEVELOPING: '2eaf6768-8e00-471e-823f-c33175a75b9a',     // 白包开发中
  APP_REMOVED: 'e766bfba-d23d-42a3-a9b8-b01139344bde',          // APP被下架
  WHITE_REJECTED: 'cc2a82ff-95c8-4308-852b-b9fb48ed44dc',       // 白包审核不通过
  RECYCLED: 'a6854d8b-45a7-4eb7-a9d3-c9eb5b9c222d',             // 回收
  AD_BANNED: '230e0f0f-993e-4e69-9324-2ce74ce234cb',            // 广告被封禁
  MAINLAND_REMOVED: '5dfff3cf-9d01-4754-a592-075a2df34b9e',     // 大陆下架
} as const;

export interface HapConfig {
  appKey: string;  // 明道云 AppKey（用于"账号上的产品"表和"苹果开发者账号"表）
  sign: string;    // 明道云 Sign
  worksheetProducts: string;  // "账号上的产品"表 ID
  worksheetAccounts: string;   // "苹果开发者账号"表 ID
  // 降级查询配置（可选）- 用于首次发布场景
  worksheetProductionReleases?: string; // "App生产发布"表 ID
  // 如果"App生产发布"表在不同的应用中，需要单独的认证信息
  appKeyProductionReleases?: string;    // "App生产发布"表所在应用的 AppKey
  signProductionReleases?: string;       // "App生产发布"表所在应用的 Sign
}

export interface AppleAccountInfo {
  appleId: string;
  teamId: string;
  apiKeyId: string;
  apiKeyIssuerId: string;
  apiKeyContent: string;
  itcTeamId?: string;
  
  // 批量同步时使用（3.5 版本新增）
  hapAccountId?: string;   // 明道云账号 rowid
  accountName?: string;    // 账号名称/显示名
}

// 明道云 API 响应类型
interface HapApiResponse {
  success: boolean;
  data?: any; // 可以是 { rows: any[], total?: number } 或单个对象
  error_code?: number;
  error_msg?: string;
}

export class HapClient {
  private appKey: string;
  private sign: string;
  private worksheetProducts: string;
  private worksheetAccounts: string;
  private worksheetProductionReleases?: string;
  private appKeyProductionReleases?: string;
  private signProductionReleases?: string;
  
  // V3 API 使用 RESTful 风格的路径
  private baseUrl: string = 'https://api.mingdao.com';

  constructor(config: HapConfig) {
    this.appKey = config.appKey;
    this.sign = config.sign;
    this.worksheetProducts = config.worksheetProducts;
    this.worksheetAccounts = config.worksheetAccounts;
    this.worksheetProductionReleases = config.worksheetProductionReleases;
    this.appKeyProductionReleases = config.appKeyProductionReleases;
    this.signProductionReleases = config.signProductionReleases;
  }

  // ==================== V3 API 辅助方法 ====================

  /**
   * 构建 V3 API 请求头（认证通过 Header 传递）
   */
  private buildV3Headers(appKey?: string, sign?: string): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'HAP-Appkey': appKey || this.appKey,
      'HAP-Sign': sign || this.sign,
    };
  }

  /**
   * V3 API: 获取行记录列表
   * POST /v3/app/worksheets/{worksheet_id}/rows/list
   */
  private async v3GetRows(
    worksheetId: string, 
    options: {
      filter?: any;
      pageSize?: number;
      pageIndex?: number;
      appKey?: string;
      sign?: string;
    } = {}
  ): Promise<{ rows: any[]; total?: number }> {
    const url = `${this.baseUrl}/v3/app/worksheets/${worksheetId}/rows/list`;

    const body: any = {
      pageSize: options.pageSize || 100,
      pageIndex: options.pageIndex || 1,
    };

    if (options.filter) {
      body.filter = options.filter;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: this.buildV3Headers(options.appKey, options.sign),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as HapApiResponse;
    
    if (!data.success) {
      throw new Error(data.error_msg || `API Error: ${data.error_code}`);
    }

    return {
      rows: data.data?.rows || [],
      total: data.data?.total,
    };
  }

  /**
   * V3 API: 分页获取所有行记录
   * 自动处理分页，返回全部记录
   */
  private async v3GetAllRows(
    worksheetId: string,
    options: {
      filter?: any;
      pageSize?: number;
      appKey?: string;
      sign?: string;
    } = {}
  ): Promise<{ rows: any[]; total: number }> {
    const pageSize = options.pageSize || 1000;
    let allRows: any[] = [];
    let pageIndex = 1;
    let total = 0;

    while (true) {
      const result = await this.v3GetRows(worksheetId, {
        ...options,
        pageSize,
        pageIndex,
      });

      allRows = allRows.concat(result.rows);
      total = result.total || allRows.length;

      // 如果返回的记录数小于 pageSize，说明已经是最后一页
      if (result.rows.length < pageSize) {
        break;
      }

      // 如果已经获取了所有记录
      if (allRows.length >= total) {
        break;
      }

      pageIndex++;
      
      // 安全限制：最多获取 100 页（10万条记录）
      if (pageIndex > 100) {
        console.warn(`[HAP] ⚠️ 分页超过100页限制，已获取 ${allRows.length} 条记录`);
        break;
      }
    }

    return { rows: allRows, total };
  }

  /**
   * V3 API: 获取单个行记录
   * GET /v3/app/worksheets/{worksheet_id}/rows/{row_id}
   */
  private async v3GetRowById(
    worksheetId: string, 
    rowId: string,
    appKey?: string,
    sign?: string
  ): Promise<any | null> {
    const url = `${this.baseUrl}/v3/app/worksheets/${worksheetId}/rows/${rowId}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: this.buildV3Headers(appKey, sign),
    });

    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as HapApiResponse;
    
    if (!data.success) {
      return null;
    }

    return data.data;
  }

  /**
   * 根据 Bundle ID 查询苹果开发者账号信息
   * 
   * 主查询路径（两步查询）：
   * 1. 查询"账号上的产品"表获取关联的开发者账号
   * 2. 查询"苹果开发者账号"表获取完整配置
   * 
   * 降级查询路径（用于首次发布场景）：
   * 1. 查询"App生产发布"表通过 Bundle ID
   * 2. 从"App生产发布"获取关联的开发者账号
   * 3. 查询"苹果开发者账号"表获取完整配置
   * 
   * 用途：
   * - 发布任务时获取账号配置
   * - 审核状态监控时获取账号配置
   */
  async getAppleAccountByBundleId(bundleId: string): Promise<AppleAccountInfo | null> {
    try {
      console.log(`[HAP] 开始查询 Bundle ID: ${bundleId}`);

      // 主路径：步骤 1 - 查询"账号上的产品"表
      const productRecord = await this.queryProductByBundleId(bundleId);
      if (productRecord) {
        // 获取关联的开发者账号
        let accountRelation = productRecord['64341940fa601169896433f6']; // 苹果开发者账号关联字段
        
        // 如果是字符串，需要先 JSON.parse
        if (typeof accountRelation === 'string') {
          try {
            accountRelation = JSON.parse(accountRelation);
          } catch (error) {
            console.log(`[HAP] ❌ 解析账号关联字段失败:`, error);
          }
        }
        
        if (accountRelation && Array.isArray(accountRelation) && accountRelation.length > 0) {
          const accountId = accountRelation[0].sid;
          console.log(`[HAP] 找到关联的开发者账号 ID: ${accountId}`);

          // 主路径：步骤 2 - 查询"苹果开发者账号"表
          const accountInfo = await this.queryAccountById(accountId);
          if (accountInfo) {
            console.log(`[HAP] ✅ 主路径成功获取开发者账号信息`);
            return accountInfo;
          }
        }
      }

      console.log(`[HAP] 主路径查询失败，尝试降级查询...`);

      // 降级路径：直接查询"App生产发布"表
      if (!this.worksheetProductionReleases) {
        console.log(`[HAP] 未配置"App生产发布"表 ID，跳过降级查询`);
        return null;
      }

      const accountFromFallback = await this.queryAccountByBundleIdFallback(bundleId);
      if (accountFromFallback) {
        console.log(`[HAP] ✅ 降级路径成功获取开发者账号信息`);
        return accountFromFallback;
      }

      console.log(`[HAP] ❌ 所有查询路径均失败`);
      return null;
    } catch (error: any) {
      console.error(`[HAP] ❌ 查询失败:`, error.message);
      return null;
    }
  }

  /**
   * 查询"账号上的产品"表
   * V3 API 使用选项 Key 值筛选，筛选准确无需客户端侧过滤
   */
  private async queryProductByBundleId(bundleId: string): Promise<any | null> {
    try {
      console.log(`[HAP] 查询账号上的产品表，Bundle ID: "${bundleId}"`);
      
      const filter = {
        type: 'group',
        logic: 'AND',
        children: [
          {
            type: 'condition',
            field: '64b3a82fa75368cd24c99d8d', // Bundle id 字段
            operator: 'eq',
            value: bundleId,
          },
          {
            type: 'condition',
            field: '64366ef856462b8747391a08', // App 状态字段
            operator: 'ne',
            value: [APP_STATUS_KEYS.APP_REMOVED], // V3 API 使用 Key 值数组
          },
        ],
      };
      
      const { rows } = await this.v3GetRows(this.worksheetProducts, {
        filter,
        pageSize: 100,
      });
      
      if (rows.length > 0) {
        console.log(`[HAP] ✅ 找到 ${rows.length} 条匹配记录`);
        return rows[0];
      }

      console.log(`[HAP] 未找到匹配的产品记录`);
      return null;
    } catch (error: any) {
      console.error(`[HAP] 查询产品表失败:`, error.message);
      throw error;
    }
  }

  /**
   * 查询"苹果开发者账号"表
   * V3 API: GET /v3/app/worksheets/{worksheet_id}/rows/{row_id}
   */
  private async queryAccountById(accountId: string): Promise<AppleAccountInfo | null> {
    try {
      console.log(`[HAP] 查询账号表，accountId: ${accountId}`);
      
      const account = await this.v3GetRowById(this.worksheetAccounts, accountId);
      
      if (!account) {
        console.log(`[HAP] ⚠️ 未找到账号记录: ${accountId}`);
        return null;
      }
      console.log(`[HAP] ✅ 找到账号记录 rowid: ${account['rowid']}`);

      // 提取所需字段（使用字段别名，更可靠）
      const appleId = account['kfzzh'] || account['640adea9c04c8d453ff1ce53'];      // 开发者账号
      const teamId = account['team_id'] || account['657f119fbf6617bba9bc1665'];     // Team ID
      const apiKeyId = account['my_id'] || account['657f119fbf6617bba9bc1664'];     // 密钥 ID
      const apiKeyIssuerId = account['issuer_id'] || account['657f119fbf6617bba9bc1663']; // Issuer ID
      let apiKeyContent = account['apimywjwb_apikey_jsonky_'] || account['6586b9ad7810bed3f4a1c5eb']; // API密钥文件文本

      console.log(`[HAP] 提取的字段值:`);
      console.log(`  - Apple ID (kfzzh): ${appleId}`);
      console.log(`  - Team ID (team_id): ${teamId}`);
      console.log(`  - API Key ID (my_id): ${apiKeyId}`);
      console.log(`  - Issuer ID (issuer_id): ${apiKeyIssuerId}`);

      // 验证必需字段
      if (!appleId || !teamId || !apiKeyId || !apiKeyIssuerId || !apiKeyContent) {
        console.log(`[HAP] 账号信息不完整`);
        console.log(`  - Apple ID: ${appleId ? '✓' : '✗'}`);
        console.log(`  - Team ID: ${teamId ? '✓' : '✗'}`);
        console.log(`  - API Key ID: ${apiKeyId ? '✓' : '✗'}`);
        console.log(`  - Issuer ID: ${apiKeyIssuerId ? '✓' : '✗'}`);
        console.log(`  - API Key Content: ${apiKeyContent ? '✓' : '✗'}`);
        return null;
      }

      // 处理 API 密钥内容中的转义字符（\\n 替换为 \n）
      apiKeyContent = String(apiKeyContent).replace(/\\\\n/g, '\n');

      return {
        appleId: String(appleId),
        teamId: String(teamId),
        apiKeyId: String(apiKeyId),
        apiKeyIssuerId: String(apiKeyIssuerId),
        apiKeyContent: apiKeyContent,
      };
    } catch (error: any) {
      console.error(`[HAP] 查询账号表失败:`, error.message);
      throw error;
    }
  }

  /**
   * 降级查询：直接通过"App生产发布"表查询开发者账号
   * 用于首次发布场景，当"账号上的产品"表中尚无记录时
   * 
   * 查询流程：
   * 1. 通过 Bundle ID 查询"App生产发布"表
   * 2. 从"App生产发布"记录获取关联的开发者账号
   * 3. 查询"苹果开发者账号"表获取完整配置
   */
  private async queryAccountByBundleIdFallback(bundleId: string): Promise<AppleAccountInfo | null> {
    try {
      console.log(`[HAP] 降级查询 - 开始查询"App生产发布"表`);

      // 步骤 1: 通过 Bundle ID 查询"App生产发布"表
      const productionRelease = await this.queryProductionReleaseByBundleId(bundleId);
      if (!productionRelease) {
        console.log(`[HAP] 降级查询 - 未找到App生产发布记录`);
        return null;
      }

      console.log(`[HAP] 降级查询 - 找到App生产发布记录`);

      // 步骤 2: 从"App生产发布"获取关联的开发者账号
      const accountId = await this.extractAccountIdFromProductionRelease(productionRelease);
      if (!accountId) {
        console.log(`[HAP] 降级查询 - App生产发布记录未关联开发者账号`);
        return null;
      }

      console.log(`[HAP] 降级查询 - 找到关联的开发者账号 ID: ${accountId}`);

      // 步骤 3: 查询"苹果开发者账号"表
      const accountInfo = await this.queryAccountById(accountId);
      if (!accountInfo) {
        console.log(`[HAP] 降级查询 - 未找到开发者账号: ${accountId}`);
        return null;
      }

      console.log(`[HAP] 降级查询 - ✅ 成功获取开发者账号信息`);
      return accountInfo;
    } catch (error: any) {
      console.error(`[HAP] 降级查询失败:`, error.message);
      return null;
    }
  }

  /**
   * 查询"App生产发布"表（降级查询路径）
   * V3 API 筛选准确，通过 Bundle ID 直接查询
   */
  private async queryProductionReleaseByBundleId(bundleId: string): Promise<any | null> {
    try {
      console.log(`[HAP] 降级查询 - App生产发布表，Bundle ID: ${bundleId}`);
      
      const appKey = this.appKeyProductionReleases || this.appKey;
      const sign = this.signProductionReleases || this.sign;
      
      // 允许的状态列表
      const allowedStatuses = [
        '待处理', '调试中', '调试完成', '已打包上传',
        '正式包审核中', '正式包上架',
        '白包审核中', '白包上架', '白包审核不通过'
      ];
      
      const filter = {
        type: 'group',
        logic: 'AND',
        children: [
          {
            type: 'condition',
            field: '64b168be624fef0d46c1105b', // Bundle ID 字段
            operator: 'eq',
            value: bundleId,
          },
          {
            type: 'condition',
            field: '64e35d9518064e34061e5e2e', // 状态字段
            operator: 'in',
            value: allowedStatuses,
          }
        ]
      };
      
      const { rows } = await this.v3GetRows(this.worksheetProductionReleases!, {
        filter,
        pageSize: 100,
        appKey,
        sign,
      });
      
      if (rows.length > 0) {
        console.log(`[HAP] ✅ 降级查询找到 ${rows.length} 条记录`);
        return rows[0];
      }

      console.log(`[HAP] ⚠️  降级查询未找到符合条件的记录`);
      return null;
    } catch (error: any) {
      console.error(`[HAP] 查询App生产发布表失败:`, error.message);
      throw error;
    }
  }

  /**
   * 从"App生产发布"记录中提取关联的开发者账号 ID
   */
  private async extractAccountIdFromProductionRelease(release: any): Promise<string | null> {
    try {
      // 先尝试已知的字段 ID
      const knownFieldId = '65826dea543abda6dd15fe05'; // 苹果开发者账号管理记录
      let accountRelation = release[knownFieldId];
      
      if (accountRelation) {
        console.log(`[HAP] 使用已知的开发者账号关联字段: ${knownFieldId}`);
        
        if (typeof accountRelation === 'string') {
          try {
            accountRelation = JSON.parse(accountRelation);
          } catch (error) {
            console.log(`[HAP] 解析关联字段失败:`, error);
            accountRelation = null;
          }
        }
        
        if (accountRelation && Array.isArray(accountRelation) && accountRelation.length > 0) {
          const accountId = accountRelation[0].sid || accountRelation[0];
          if (typeof accountId === 'string') {
            console.log(`[HAP] ✅ 找到开发者账号 ID: ${accountId}`);
            return accountId;
          }
        }
      }
      
      // 如果已知字段没找到，使用智能查找
      console.log(`[HAP] 已知字段未找到，开始智能查找...`);
      console.log(`[HAP] App生产发布记录的所有字段:`, Object.keys(release).filter(k => !['_id', 'rowid', 'ctime', 'utime', 'caid', 'uaid', 'ownerid'].includes(k)));
      
      // 查找所有可能的关联字段（JSON 数组格式）
      console.log(`[HAP] 🔍 查找所有关联类型字段...`);
      const relationFields: Array<{fieldId: string, value: any}> = [];
      for (const [fieldId, value] of Object.entries(release)) {
        if (typeof value === 'string' && value.startsWith('[') && value.includes('sid')) {
          try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].sid) {
              relationFields.push({ fieldId, value: parsed });
              console.log(`[HAP]   - 字段 ${fieldId}:`, parsed[0]);
            }
          } catch (e) {
            // 忽略
          }
        }
      }
      
      if (relationFields.length === 0) {
        console.log(`[HAP] ⚠️  未找到任何关联类型字段`);
        return null;
      }
      
      // 尝试每个关联字段，找到第一个能成功查询的
      for (const {fieldId, value} of relationFields) {
        console.log(`[HAP] 🔍 尝试使用关联字段 ${fieldId}...`);
        const accountId = value[0].sid;
        
        // 验证这个 ID 是否指向"苹果开发者账号"表
        try {
          const testAccount = await this.queryAccountById(accountId);
          if (testAccount) {
            console.log(`[HAP] ✅ 找到有效的开发者账号关联字段: ${fieldId}`);
            return accountId;
          }
        } catch (error) {
          console.log(`[HAP] 字段 ${fieldId} 不是开发者账号关联字段，继续尝试...`);
        }
      }
      
      console.log(`[HAP] ⚠️  没有找到指向开发者账号表的关联字段`);
      return null;
    } catch (error: any) {
      console.error(`[HAP] 提取开发者账号 ID 失败:`, error.message);
      return null;
    }
  }

  /**
   * 获取所有"正式包上架"的 App 列表
   * 用于下架监控功能（3.5 版本新增）
   * 
   * V3 API 使用选项 Key 值筛选，筛选准确无需客户端侧过滤
   * 返回：Bundle ID + App名称&备注 + 开发者账号 + rowId
   */
  async getOnlineApps(): Promise<HapAppProduct[]> {
    try {
      console.log('[HAP] 🔍 开始查询所有"正式包上架"的 App...');

      // 字段 ID 映射
      const FIELD_APP_STATUS = '64366ef856462b8747391a08';      // App 状态
      const FIELD_BUNDLE_ID = '64b3a82fa75368cd24c99d8d';       // Bundle ID
      const FIELD_APP_NAME = '68589e638230c51cdfa80c90';        // App名称&备注
      const FIELD_APP_ID = '643418197f0301fb51750f02';          // App ID（7.0 版本新增）
      const FIELD_ACCOUNT_RELATION = '64341940fa601169896433f6'; // 苹果开发者账号关联
      const FIELD_ACCOUNT_NAME = '64369d9b05108c17907e6a00';    // 开发者账号（显示值）
      const FIELD_QIMAI_URL = '65388cadea09c5df35ec81c6';       // 七麦链接
      const FIELD_UMENG_ID = '6438f8a907592fef2a98a1a6';        // 友盟 ID（5.0 版本新增）
      const FIELD_UMENG_DATA_URL = '6565befa8815ce3493f25907';  // 友盟数据链接（5.0 版本新增）

      // V3 API 使用选项 Key 值筛选
      const filter = {
        type: 'group',
        logic: 'AND',
        children: [
          {
            type: 'condition',
            field: FIELD_APP_STATUS,
            operator: 'eq',
            value: [APP_STATUS_KEYS.FORMAL_ONLINE], // V3 API 使用 Key 值数组
          },
        ],
      };

      const { rows, total } = await this.v3GetAllRows(this.worksheetProducts, {
        filter,
        pageSize: 500,
      });

      if (rows.length === 0) {
        console.log('[HAP] ⚠️  未找到符合条件的 App');
        return [];
      }

      console.log(`[HAP] ✅ V3 API 返回 ${rows.length} 个"正式包上架"的 App（总计 ${total} 条）`);

      // V3 API 筛选准确，直接解析结果
      const apps: HapAppProduct[] = [];
      let skippedByNoBundleId = 0;
      
      for (const row of rows) {
        const bundleId = row[FIELD_BUNDLE_ID];
        const appName = row[FIELD_APP_NAME];
        const rowId = row['rowid'];

        if (!bundleId) {
          console.log(`[HAP] ⚠️  跳过无 Bundle ID 的记录: ${appName || rowId}`);
          skippedByNoBundleId++;
          continue;
        }

        // 提取开发者账号关联
        let accountRelation = row[FIELD_ACCOUNT_RELATION];
        let accountId = '';

        if (accountRelation) {
          // 如果是字符串，尝试解析
          if (typeof accountRelation === 'string') {
            try {
              accountRelation = JSON.parse(accountRelation);
            } catch (error) {
              console.log(`[HAP] ⚠️  解析账号关联失败: ${bundleId}`);
            }
          }

          // 提取 accountId
          if (accountRelation && Array.isArray(accountRelation) && accountRelation.length > 0) {
            accountId = accountRelation[0].sid || accountRelation[0];
          }
        }

        // 提取开发者账号名称（显示值）
        const accountName = row[FIELD_ACCOUNT_NAME] || '';
        
        // 提取 App ID（7.0 版本新增）
        const appId = row[FIELD_APP_ID] || '';
        
        // 提取七麦链接
        const qimaiUrl = row[FIELD_QIMAI_URL] || '';
        
        // 提取友盟 ID（5.0 版本新增）
        const umengId = row[FIELD_UMENG_ID] || '';
        
        // 提取友盟数据链接（5.0 版本新增）
        const umengDataUrl = row[FIELD_UMENG_DATA_URL] || '';

        apps.push({
          bundleId: String(bundleId),
          appName: String(appName || bundleId),
          appId: appId ? String(appId) : undefined,
          accountId: String(accountId || ''),
          accountName: String(accountName || ''),
          rowId: String(rowId),
          qimaiUrl: qimaiUrl ? String(qimaiUrl) : undefined,
          umengId: umengId ? String(umengId) : undefined,
          umengDataUrl: umengDataUrl ? String(umengDataUrl) : undefined,
        });
      }

      if (skippedByNoBundleId > 0) {
        console.log(`[HAP] ⚠️  跳过无 Bundle ID 的记录: ${skippedByNoBundleId} 条`);
      }
      console.log(`[HAP] ✅ 成功解析 ${apps.length} 个"正式包上架"的 App 信息`);
      return apps;
    } catch (error: any) {
      console.error('[HAP] ❌ 查询"正式包上架" App 失败:', error.message);
      throw error;
    }
  }

  /**
   * 批量获取所有可用的苹果开发者账号（3.5 版本新增）
   * 用于下架监控功能的账号同步
   * 
   * 排除账号状态为：标记为等待关停、关停待续费、账号被关停
   * 返回：完整的开发者账号配置列表（包括 API Key）+ 信息不完整的活跃账号列表
   */
  async getAllAppleAccounts(): Promise<{
    accounts: Array<AppleAccountInfo & { hapAccountId: string; accountName: string }>;
    incompleteActiveAccounts: Array<{ hapAccountId: string; accountName: string; status: string; missingFields: string[] }>;
  }> {
    try {
      console.log('[HAP] 🔍 开始批量查询可用的开发者账号...');
      
      const FIELD_ACCOUNT_STATUS = 'zhzt'; // 账号状态（使用字段别名）
      
      // 不可用的账号状态列表
      const excludedStatuses = ['标记为等待关停', '关停待续费', '账号被关停'];
      // 活跃账号状态列表（信息不完整需要提醒修复）
      const activeStatuses = ['正式包上架中', '账号使用中', '账号未使用', '不再发布', '账号保留', '留给重要产品', '公司账号', '账号回收'];
      
      // 获取所有账号记录（自动分页）
      const { rows, total } = await this.v3GetAllRows(this.worksheetAccounts, {
        pageSize: 1000,
      });
      
      if (rows.length === 0) {
        console.log('[HAP] ⚠️ 未查询到开发者账号');
        return { accounts: [], incompleteActiveAccounts: [] };
      }

      console.log(`[HAP] 📋 获取到 ${rows.length} 个开发者账号记录（总计 ${total} 条）`);

      const accounts: Array<AppleAccountInfo & { hapAccountId: string; accountName: string }> = [];
      const incompleteActiveAccounts: Array<{ hapAccountId: string; accountName: string; status: string; missingFields: string[] }> = [];
      
      for (const row of rows) {
        const rowId = row['rowid'];
        const accountName = row['title'] || row['kfzzh'] || '';
        const accountStatus = row[FIELD_ACCOUNT_STATUS];

        // 提取状态值
        let statusValue = '';
        if (typeof accountStatus === 'string') {
          statusValue = accountStatus;
        } else if (Array.isArray(accountStatus) && accountStatus.length > 0) {
          const item = accountStatus[0];
          statusValue = typeof item === 'string' ? item : (item?.value || '');
        }

        // 跳过不可用账号
        if (excludedStatuses.includes(statusValue)) {
          continue;
        }
        
        // 提取账号字段
        const appleId = row['kfzzh'] || row['640adea9c04c8d453ff1ce53'];
        const teamId = row['team_id'] || row['657f119fbf6617bba9bc1665'];
        const apiKeyId = row['my_id'] || row['657f119fbf6617bba9bc1664'];
        const apiKeyIssuerId = row['issuer_id'] || row['657f119fbf6617bba9bc1663'];
        let apiKeyContent = row['apimywjwb_apikey_jsonky_'] || row['6586b9ad7810bed3f4a1c5eb'];
        const itcTeamId = row['itc_team_id'] || undefined;

        // 检查信息完整性
        if (!appleId || !teamId || !apiKeyId || !apiKeyIssuerId || !apiKeyContent) {
          const missingFields: string[] = [];
          if (!appleId) missingFields.push('Apple ID');
          if (!teamId) missingFields.push('Team ID');
          if (!apiKeyId) missingFields.push('API Key ID');
          if (!apiKeyIssuerId) missingFields.push('Issuer ID');
          if (!apiKeyContent) missingFields.push('API Key Content');

          // 活跃账号信息不完整需要记录
          if (activeStatuses.includes(statusValue)) {
            incompleteActiveAccounts.push({
              hapAccountId: String(rowId),
              accountName: String(accountName || rowId),
              status: statusValue,
              missingFields,
            });
          }
          continue;
        }

        // 处理 API 密钥内容中的转义字符
        apiKeyContent = String(apiKeyContent).replace(/\\\\n/g, '\n');

        accounts.push({
          hapAccountId: String(rowId),
          accountName: String(accountName),
          appleId: String(appleId),
          teamId: String(teamId),
          apiKeyId: String(apiKeyId),
          apiKeyIssuerId: String(apiKeyIssuerId),
          apiKeyContent,
          itcTeamId: itcTeamId ? String(itcTeamId) : undefined,
        });
      }

      console.log(`[HAP] ✅ 成功解析 ${accounts.length} 个可用账号`);
      
      if (incompleteActiveAccounts.length > 0) {
        console.log(`[HAP] 🔴 警告：${incompleteActiveAccounts.length} 个活跃账号信息不完整`);
      }
      
      return { accounts, incompleteActiveAccounts };
    } catch (error: any) {
      console.error(`[HAP] ❌ 批量查询账号失败:`, error.message);
      throw error;
    }
  }
}
