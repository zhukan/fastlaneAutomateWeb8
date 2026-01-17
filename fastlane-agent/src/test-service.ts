/**
 * 测试服务 - 用于快速验证数据获取逻辑
 * 
 * 功能：
 * - 输入bundle_id，直接查询明道云API
 * - 展示原始数据和处理后的数据
 * - 验证关键取数代码是否正确
 */

import { HapClient } from './hap-client';

export interface BundleTestResult {
  bundleId: string;
  
  // App基本信息
  appInfo: {
    found: boolean;
    data: any;
    processed: {
      appName: string;
      appId: string;
      accountName: string;
      appStatus: string;
      removalTime: string | null;
      productRowId: string;
    } | null;
  };
  
  // 发布记录
  productionRecords: {
    count: number;
    rawData: any[];
    processed: Array<{
      recordId: string;
      appName: string;
      version: string;
      adVersion: string;
      operator: string;
      location: string;
      releaseTime: string;
    }>;
  };
  
  // 更新记录
  updateRecords: {
    count: number;
    rawData: any[];
    processed: Array<{
      recordId: string;
      taskName: string;
      version: string;
      adVersion: string;
      operator: string;
      location: string;
      submitTime: string;
    }>;
  };
  
  // 统计
  summary: {
    totalOperations: number;
    productionCount: number;
    updateCount: number;
  };
}

export class TestService {
  // 明道云字段 ID（与 AppRemovalInvestigationService 保持一致）
  private readonly FIELD_IDS = {
    PRODUCTS: {
      APP_NAME: '64341ac46d6df8983a7f7af3',
      BUNDLE_ID: '64b3a82fa75368cd24c99d8d',
      APP_ID: '643418197f0301fb51750f02',
      ACCOUNT_NAME: '64369d9b05108c17907e6a00',
      APP_STATUS: '64366ef856462b8747391a08',
      REMOVAL_TIME: '645c67ec7861415e0edf3565',
    },
    PRODUCTION: {
      BUNDLE_ID: '64b168be624fef0d46c1105b',
      APP_NAME: '64b168be624fef0d46c11058',
      VERSION: '64b168be624fef0d46c11068',
      AD_VERSION: '6655a94ca87340a9754f7c41',
      OPERATOR: '6810850325726172e2468246',
      LOCATION: '64cdf3e1784014033c3348d8',
      RELEASE_TIME: '64b168be624fef0d46c1106b',
    },
    UPDATE: {
      TASK_NAME: '64097218d867a5c9c89b043b',
      PRODUCT_RELATION: '6437343d6e173a52dea04494',
      VERSION: '641f033f5815faac860d15de',
      AD_VERSION: '6943850dee1f6a984701555f',
      RELEASE_PERSON: '64366cddcb42afb8b5e79583',
      RELEASE_LOCATION: '681c60e03847f34d19aeb44c',
      SUBMIT_TIME: '641ee11b56350b78574cf7c1',
    },
  };

  private readonly WORKSHEETS = {
    PRODUCTS: '643418197f0301fb51750f00',      // 账号上的产品
    PRODUCTION: '65612ddfc96f80bfabe5df2e',    // App生产发布
    UPDATE: '640ab32a56058b3df8803af2',        // App更新任务
  };

  constructor(private hapClient: HapClient) {}

  /**
   * 测试bundle_id的数据获取
   */
  async testBundleRecords(bundleId: string): Promise<BundleTestResult> {
    console.log(`[TestService] 🔍 测试 Bundle ID: ${bundleId}`);

    // 1. 查询App基本信息
    const appInfo = await this.testAppInfo(bundleId);
    
    // 2. 查询发布记录
    const productionRecords = await this.testProductionRecords(bundleId);
    
    // 3. 查询更新记录
    const updateRecords = await this.testUpdateRecords(bundleId, appInfo.data?.rowid);

    return {
      bundleId,
      appInfo,
      productionRecords,
      updateRecords,
      summary: {
        totalOperations: productionRecords.count + updateRecords.count,
        productionCount: productionRecords.count,
        updateCount: updateRecords.count,
      },
    };
  }

  /**
   * 测试App基本信息查询
   */
  private async testAppInfo(bundleId: string) {
    console.log('[TestService] 📦 查询App基本信息...');
    
    const data = await this.fetchFromHap(
      this.WORKSHEETS.PRODUCTS,
      {
        filter: {
          type: 'group',
          logic: 'AND',
          children: [{
            type: 'condition',
            field: this.FIELD_IDS.PRODUCTS.BUNDLE_ID,
            operator: 'eq',
            value: bundleId,
          }]
        },
        pageSize: 1,
        pageIndex: 1,
      }
    );

    console.log(`[TestService] 📦 查询结果: total=${data.total}, rows.length=${data.rows?.length || 0}`);
    const found = data.rows && data.rows.length > 0;
    const record = found ? data.rows[0] : null;
    
    if (record) {
      console.log(`[TestService] ✅ 找到记录, rowid=${record.rowid}`);
    } else {
      console.log(`[TestService] ❌ 未找到记录`);
    }

    return {
      found,
      data: record,
      processed: record ? {
        appName: this.getFieldValue(record, this.FIELD_IDS.PRODUCTS.APP_NAME),
        appId: this.getFieldValue(record, this.FIELD_IDS.PRODUCTS.APP_ID),
        accountName: this.getFieldValue(record, this.FIELD_IDS.PRODUCTS.ACCOUNT_NAME),
        appStatus: this.getFieldValue(record, this.FIELD_IDS.PRODUCTS.APP_STATUS),
        removalTime: this.getFieldValue(record, this.FIELD_IDS.PRODUCTS.REMOVAL_TIME),
        productRowId: record.rowid,
      } : null,
    };
  }

  /**
   * 测试发布记录查询
   */
  private async testProductionRecords(bundleId: string) {
    console.log('[TestService] 📝 查询发布记录（App生产发布表）...');
    
    const data = await this.fetchFromHap(
      this.WORKSHEETS.PRODUCTION,
      {
        filter: {
          type: 'group',
          logic: 'AND',
          children: [{
            type: 'condition',
            field: this.FIELD_IDS.PRODUCTION.BUNDLE_ID,
            operator: 'eq',
            value: bundleId,
          }]
        },
        pageSize: 100,
        pageIndex: 1,
      },
      true // 使用App工厂应用的认证
    );

    const processed = (data.rows || []).map((record: any) => ({
      recordId: record.rowid,
      appName: this.getFieldValue(record, this.FIELD_IDS.PRODUCTION.APP_NAME),
      version: this.getFieldValue(record, this.FIELD_IDS.PRODUCTION.VERSION),
      adVersion: this.parseOptionField(this.getFieldValue(record, this.FIELD_IDS.PRODUCTION.AD_VERSION)),
      operator: this.parseUserField(this.getFieldValue(record, this.FIELD_IDS.PRODUCTION.OPERATOR)),
      location: this.getFieldValue(record, this.FIELD_IDS.PRODUCTION.LOCATION),
      releaseTime: this.getFieldValue(record, this.FIELD_IDS.PRODUCTION.RELEASE_TIME),
    }));

    return {
      count: data.total || 0,
      rawData: data.rows || [],
      processed,
    };
  }

  /**
   * 测试更新记录查询
   */
  private async testUpdateRecords(bundleId: string, productRowId?: string) {
    console.log('[TestService] 🔄 查询更新记录（App更新任务表）...');
    
    if (!productRowId) {
      console.log('[TestService] ⚠️  未找到产品记录ID，跳过更新记录查询');
      return { count: 0, rawData: [], processed: [] };
    }

    // 尝试多种操作符
    console.log(`[TestService] 🧪 测试关联字段查询: productRowId=${productRowId}`);
    
    // 尝试1: eq + 字符串
    console.log(`[TestService] 🧪 方案1: operator=eq, value=字符串`);
    let data = await this.fetchFromHap(
      this.WORKSHEETS.UPDATE,
      {
        filter: {
          type: 'group',
          logic: 'AND',
          children: [{
            type: 'condition',
            field: this.FIELD_IDS.UPDATE.PRODUCT_RELATION,
            operator: 'eq',
            value: productRowId,  // 直接传字符串
          }]
        },
        pageSize: 100,
        pageIndex: 1,
      }
    );
    
    console.log(`[TestService] 方案1结果: total=${data.total}, rows=${data.rows?.length || 0}`);
    
    // 如果方案1没找到，尝试方案2: contains + 字符串
    if ((data.rows?.length || 0) === 0) {
      console.log(`[TestService] 🧪 方案2: operator=contains, value=字符串`);
      data = await this.fetchFromHap(
        this.WORKSHEETS.UPDATE,
        {
          filter: {
            type: 'group',
            logic: 'AND',
            children: [{
              type: 'condition',
              field: this.FIELD_IDS.UPDATE.PRODUCT_RELATION,
              operator: 'contains',
              value: productRowId,  // 直接传字符串，不用数组
            }]
          },
          pageSize: 100,
          pageIndex: 1,
        }
      );
      console.log(`[TestService] 方案2结果: total=${data.total}, rows=${data.rows?.length || 0}`);
    }
    
    // 如果方案2还没找到，不使用filter，直接查询所有记录
    if ((data.rows?.length || 0) === 0) {
      console.log(`[TestService] ⚠️  方案1和2都失败，查询所有更新记录（不带filter）`);
      data = await this.fetchFromHap(
        this.WORKSHEETS.UPDATE,
        {
          pageSize: 1000,
          pageIndex: 1,
        }
      );
      console.log(`[TestService] 无filter查询结果: total=${data.total}, rows=${data.rows?.length || 0}`);
      
      // 手动过滤
      if (data.rows && data.rows.length > 0) {
        console.log(`[TestService] 🔍 检查前5条记录的"产品"字段值：`);
        data.rows.slice(0, 5).forEach((row: any, idx: number) => {
          const productField = this.getFieldValue(row, this.FIELD_IDS.UPDATE.PRODUCT_RELATION);
          console.log(`[TestService]   记录${idx + 1}: ${JSON.stringify(productField)}`);
        });
        
        // 手动过滤匹配的记录
        const matchedRows = data.rows.filter((row: any) => {
          const productField = this.getFieldValue(row, this.FIELD_IDS.UPDATE.PRODUCT_RELATION);
          // 尝试多种匹配方式
          if (Array.isArray(productField)) {
            return productField.some((item: any) => 
              item === productRowId || 
              item?.rowid === productRowId ||
              item?.sid === productRowId
            );
          }
          return productField === productRowId || 
                 productField?.rowid === productRowId ||
                 productField?.sid === productRowId;
        });
        
        console.log(`[TestService] 手动过滤匹配到 ${matchedRows.length} 条记录`);
        data.rows = matchedRows;
        data.total = matchedRows.length;
      }
    }

    const processed = (data.rows || []).map((record: any) => ({
      recordId: record.rowid,
      taskName: this.getFieldValue(record, this.FIELD_IDS.UPDATE.TASK_NAME),
      version: this.getFieldValue(record, this.FIELD_IDS.UPDATE.VERSION),
      adVersion: this.parseOptionField(this.getFieldValue(record, this.FIELD_IDS.UPDATE.AD_VERSION)),
      operator: this.parseUserField(this.getFieldValue(record, this.FIELD_IDS.UPDATE.RELEASE_PERSON)),
      location: this.getFieldValue(record, this.FIELD_IDS.UPDATE.RELEASE_LOCATION),
      submitTime: this.getFieldValue(record, this.FIELD_IDS.UPDATE.SUBMIT_TIME),
    }));

    return {
      count: data.total || 0,
      rawData: data.rows || [],
      processed,
    };
  }

  /**
   * 从明道云获取数据
   */
  private async fetchFromHap(
    worksheetId: string,
    options: { filter?: any; pageSize?: number; pageIndex?: number } = {},
    useProductionAuth: boolean = false
  ): Promise<{ total: number; rows: any[] }> {
    // 选择认证信息
    const appKey = useProductionAuth 
      ? (process.env.HAP_APP_KEY_PRODUCTION_RELEASES || process.env.HAP_APP_KEY)
      : process.env.HAP_APP_KEY;
    const sign = useProductionAuth
      ? (process.env.HAP_SIGN_PRODUCTION_RELEASES || process.env.HAP_SIGN)
      : process.env.HAP_SIGN;
    
    const url = `https://api.mingdao.com/v3/app/worksheets/${worksheetId}/rows/list`;
    
    const body: any = {
      pageSize: options.pageSize || 100,
      pageIndex: options.pageIndex || 1,
    };
    
    if (options.filter) {
      body.filter = options.filter;
    }
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'HAP-Appkey': appKey || '',
        'HAP-Sign': sign || '',
      },
      body: JSON.stringify(body),
    });
    
    if (!response.ok) {
      throw new Error(`明道云API请求失败: ${response.status} ${response.statusText}`);
    }
    
    const result: any = await response.json();
    
    console.log(`[TestService] API原始响应:`, JSON.stringify(result).substring(0, 200));
    
    if (!result.success) {
      console.error(`[TestService] ❌ API错误: ${result.error_msg || result.error_code || 'Unknown error'}`);
      throw new Error(`明道云API返回错误: ${result.error_msg || 'Unknown error'}`);
    }
    
    // 明道云V3 API的数据可能在result.data中，也可能直接在result中
    const data = result.data || result;
    const total = data.total || 0;
    const rows = data.rows || [];
    
    console.log(`[TestService] 解析后: total=${total}, rows=${rows.length}`);
    
    return {
      total,
      rows,
    };
  }

  // 辅助方法
  private getFieldValue(record: any, fieldId: string): any {
    return record[fieldId] || null;
  }

  private parseUserField(value: any): string {
    if (!value) return '';
    
    // 如果是字符串，尝试解析
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
      if (value.length === 0) return '';
      return value.map((u: any) => u.fullname || u.name || u.accountId || String(u)).join(', ');
    }
    
    // 如果是对象
    if (typeof value === 'object') {
      return value.fullname || value.name || value.accountId || '';
    }
    
    return String(value);
  }

  private parseOptionField(value: any): string {
    if (!value) return '';
    
    // 如果是字符串，尝试解析
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
      if (value.length === 0) return '';
      return value.map((o: any) => o.value || o.Value || o.name || String(o)).join(', ');
    }
    
    // 如果是对象
    if (typeof value === 'object') {
      return value.value || value.Value || value.name || '';
    }
    
    return String(value);
  }
}

