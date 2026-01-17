/**
 * 友盟 API 客户端
 * 
 * 功能：
 * 1. 实现友盟 OpenAPI 签名认证
 * 2. 获取今日/昨日新增用户数据
 * 
 * 版本：5.0
 * 创建日期：2025-12-25
 */

import crypto from 'crypto';

// ==================== 接口定义 ====================

/**
 * 友盟新增数据响应
 */
export interface UmengNewUsersData {
  todayNew: number | null;    // 今日新增用户数
  yesterdayNew: number | null; // 昨日新增用户数
  appName: string | null;      // 应用名称（5.0 版本新增）
}

/**
 * 友盟 API 响应
 */
interface UmengApiResponse {
  code?: string;
  msg?: string;
  [key: string]: any;
}

// ==================== 客户端类 ====================

export class UmengClient {
  private readonly apiKey: string;
  private readonly apiSecurity: string;
  private readonly baseUrl = 'https://gateway.open.umeng.com/openapi/';
  
  // 应用名称缓存（umengId -> appName）
  private appNameCache: Map<string, string> | null = null;
  private cacheTimestamp: number = 0;
  private readonly CACHE_TTL = 15 * 60 * 1000; // 15分钟缓存

  constructor() {
    this.apiKey = process.env.UMENG_API_KEY || '';
    this.apiSecurity = process.env.UMENG_API_SECURITY || '';

    if (!this.apiKey || !this.apiSecurity) {
      console.warn('[UmengClient] ⚠️  友盟 API 配置缺失，将无法获取数据');
    }
  }

  /**
   * 获取今日和昨日新增用户数据
   * @param umengId 友盟应用ID (appkey)
   */
  async getNewUsersData(umengId: string): Promise<UmengNewUsersData> {
    // 如果没有配置或没有 umengId，返回 null
    if (!this.apiKey || !this.apiSecurity || !umengId) {
      return { todayNew: null, yesterdayNew: null, appName: null };
    }

    try {
      // 并发获取今日和昨日数据
      const [todayData, yesterdayData] = await Promise.all([
        this.getTodayData(umengId),
        this.getYesterdayData(umengId)
      ]);

      return {
        todayNew: todayData,
        yesterdayNew: yesterdayData,
        appName: null  // 友盟 API 不提供此接口，从明道云获取
      };

    } catch (error: any) {
      // 静默处理（已在底层打印必要的错误）
      return { todayNew: null, yesterdayNew: null, appName: null };
    }
  }

  /**
   * 获取今日新增用户数
   */
  private async getTodayData(umengId: string): Promise<number | null> {
    try {
      const apiUri = 'param2/1/com.umeng.uapp/umeng.uapp.getTodayData';
      const params = {
        appkey: umengId
      };

      const response = await this.callUmengApi(apiUri, params);

      // 解析响应
      if (response && response.todayData && typeof response.todayData.newUsers === 'number') {
        return response.todayData.newUsers;
      }

      return null;

    } catch (error: any) {
      // 静默处理（已在 callUmengApi 中打印必要的错误）
      return null;
    }
  }

  /**
   * 获取昨日新增用户数
   */
  private async getYesterdayData(umengId: string): Promise<number | null> {
    try {
      const apiUri = 'param2/1/com.umeng.uapp/umeng.uapp.getYesterdayData';
      const params = {
        appkey: umengId
      };

      const response = await this.callUmengApi(apiUri, params);

      // 解析响应
      if (response && response.yesterdayData && typeof response.yesterdayData.newUsers === 'number') {
        return response.yesterdayData.newUsers;
      }

      return null;

    } catch (error: any) {
      // 静默处理（已在 callUmengApi 中打印必要的错误）
      return null;
    }
  }

  /**
   * 调用友盟 API
   * 参考 Python SDK: aop/api/base.py get_response() 方法
   */
  private async callUmengApi(
    apiUri: string,
    params: Record<string, string>
  ): Promise<UmengApiResponse | null> {
    try {
      // 构建签名 URL 路径: param2/version/namespace/name/appkey
      const signUrlPath = `${apiUri}/${this.apiKey}`;

      // 生成签名
      const signature = this.generateSignature(signUrlPath, params);

      // 构建完整 URL
      const url = `${this.baseUrl}${signUrlPath}`;

      // 构建 POST body（application/x-www-form-urlencoded）
      // 包含业务参数和签名
      const bodyParams = new URLSearchParams({
        ...params,
        _aop_signature: signature
      });

      // 发起 POST 请求（不打印详细日志）
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cache-Control': 'no-cache',
          'Connection': 'Keep-Alive',
          'User-Agent': 'Ocean-SDK-Client'
        },
        body: bodyParams.toString()
      });

      // 先获取文本响应，以便调试
      const responseText = await response.text();
      
      if (!response.ok) {
        // 尝试解析错误响应
        try {
          const errorData = JSON.parse(responseText);
          // 40001: appkey 不存在或无权限访问（常见错误，静默处理）
          if (errorData.error_code === '40001') {
            return null;
          }
          // 其他错误才打印日志
          console.error(`[UmengClient] ❌ HTTP ${response.status}:`, responseText);
        } catch {
          console.error(`[UmengClient] ❌ HTTP ${response.status}:`, responseText);
        }
        return null;
      }

      // 尝试解析 JSON
      let data: UmengApiResponse;
      try {
        data = JSON.parse(responseText) as UmengApiResponse;
      } catch (parseError) {
        console.error(`[UmengClient] ❌ 无法解析响应:`, responseText.substring(0, 200));
        return null;
      }

      // 检查 API 响应
      if (data.code && data.code !== '200') {
        console.error(`[UmengClient] ❌ 友盟API错误: ${data.code} - ${data.msg || '未知错误'}`);
        return null;
      }

      return data;

    } catch (error: any) {
      // 只打印真正的异常错误（如网络错误），HTTP 错误已在上面处理
      if (error.name === 'FetchError' || error.name === 'TypeError') {
        console.error(`[UmengClient] ❌ 网络错误:`, error.message);
      }
      return null;
    }
  }

  /**
   * 生成友盟签名
   * 算法：HMAC-SHA1(urlPath + sorted_params, apiSecurity).toUpperCase()
   * 参考友盟 Python SDK: aop/api/base.py sign() 方法
   */
  private generateSignature(
    urlPath: string,
    params: Record<string, string>
  ): string {
    // 1. 对参数按 key 排序
    const sortedKeys = Object.keys(params).sort();

    // 2. 拼接参数字符串：key1value1key2value2...
    const paramStr = sortedKeys
      .map(key => `${key}${params[key]}`)
      .join('');

    // 3. 构建消息：urlPath + params（不包含 apiSecurity）
    const message = urlPath + paramStr;

    // 4. 使用 HMAC-SHA1 生成签名
    const signature = crypto
      .createHmac('sha1', this.apiSecurity)
      .update(message)
      .digest('hex')
      .toUpperCase();

    return signature;
  }

  /**
   * 获取应用列表并建立名称映射缓存（支持分页）
   */
  private async fetchAppNameCache(): Promise<Map<string, string>> {
    try {
      const cache = new Map<string, string>();
      const apiUri = 'param2/1/com.umeng.uapp/umeng.uapp.getAppList';
      
      let pageIndex = 1;
      let hasMore = true;
      let totalApps = 0;
      
      // 循环获取所有页
      while (hasMore) {
        const params = {
          page: String(pageIndex),
          perPage: '100'  // 每页100个
        };
        
        console.log(`[UmengClient] 📄 获取应用列表第 ${pageIndex} 页...`);
        const response = await this.callUmengApi(apiUri, params);
        
        if (response && Array.isArray(response.appInfos)) {
          for (const app of response.appInfos) {
            if (app.appkey && app.name) {
              cache.set(app.appkey, app.name);
              totalApps++;
            }
          }
          
          // 检查是否还有更多页
          if (response.appInfos.length < 100) {
            hasMore = false;
          } else {
            pageIndex++;
            // 分页间延迟，避免请求过快
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } else {
          hasMore = false;
        }
      }
      
      console.log(`[UmengClient] ✅ 获取到 ${cache.size} 个应用名称（共 ${pageIndex} 页）`);
      return cache;
      
    } catch (error: any) {
      console.error('[UmengClient] ⚠️  获取应用列表失败:', error.message);
      return new Map();
    }
  }

  /**
   * 获取应用名称（带缓存）
   */
  private async getAppNameFromCache(umengId: string): Promise<string | null> {
    // 检查缓存是否有效
    const now = Date.now();
    if (!this.appNameCache || (now - this.cacheTimestamp) > this.CACHE_TTL) {
      console.log('[UmengClient] 🔄 刷新应用名称缓存...');
      this.appNameCache = await this.fetchAppNameCache();
      this.cacheTimestamp = now;
    }
    
    return this.appNameCache.get(umengId) || null;
  }

  /**
   * 批量获取新增数据（带延迟，避免请求过快）
   */
  async batchGetNewUsersData(
    umengIds: string[],
    batchSize = 10,
    delayMs = 100
  ): Promise<Map<string, UmengNewUsersData>> {
    const result = new Map<string, UmengNewUsersData>();

    if (umengIds.length === 0) {
      return result;
    }

    console.log(`[UmengClient] 📦 批量获取友盟数据: ${umengIds.length} 个应用`);

    // 预加载应用名称缓存
    await this.getAppNameFromCache(umengIds[0]);

    // 分批处理（静默处理，不打印每批日志）
    for (let i = 0; i < umengIds.length; i += batchSize) {
      const batch = umengIds.slice(i, i + batchSize);

      // 并发请求当前批次
      const batchResults = await Promise.all(
        batch.map(async (umengId) => {
          const data = await this.getNewUsersData(umengId);
          // 从缓存中获取应用名称
          const appName = await this.getAppNameFromCache(umengId);
          return { umengId, data: { ...data, appName } };
        })
      );

      // 存储结果
      batchResults.forEach(({ umengId, data }) => {
        result.set(umengId, data);
      });

      // 批次间延迟
      if (i + batchSize < umengIds.length) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    // 统计成功获取的数据
    const successCount = Array.from(result.values()).filter(
      data => data.todayNew !== null || data.yesterdayNew !== null
    ).length;
    
    if (successCount < umengIds.length) {
      console.log(`[UmengClient] ⚠️  友盟数据获取完成: ${successCount}/${umengIds.length} 个应用（${umengIds.length - successCount} 个无数据或无权限）`);
    } else {
      console.log(`[UmengClient] ✅ 友盟数据获取完成: ${successCount}/${umengIds.length} 个应用`);
    }
    
    return result;
  }
}

