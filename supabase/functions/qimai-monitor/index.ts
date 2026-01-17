/**
 * 七麦自动监控 Edge Function
 * 
 * 功能：
 * 1. 定时抓取七麦清榜/清词数据
 * 2. 匹配 target_apps 表中的应用
 * 3. 更新 is_clear_rank 和 is_clear_keyword 字段（只更新 false → true）
 * 4. 记录执行日志
 * 
 * 版本：7.0
 * 创建时间：2026-01-07
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

// ============================================================================
// 类型定义
// ============================================================================

// 清榜 API 响应结构
interface QimaiClearRankAppInfo {
  appId: string;
  appName: string;
  // 其他字段...
}

interface QimaiClearRankItem {
  appInfo: QimaiClearRankAppInfo;
  releaseTime?: string;
  rank_b?: Record<string, unknown>;
}

interface QimaiClearRankDayData {
  date: string;
  list: QimaiClearRankItem[];
}

interface QimaiClearRankResponse {
  code: number;
  msg?: string;
  appNum?: number;
  maxPage?: number;
  outList?: QimaiClearRankDayData[];
}

// 清词 API 响应结构
interface QimaiClearKeywordItem {
  appInfo: QimaiClearRankAppInfo;
  beforeClearNum?: number;
}

interface QimaiClearKeywordResponse {
  code: number;
  msg?: string;
  appNum?: number;
  maxPage?: number;
  list?: QimaiClearKeywordItem[];
}

interface MonitoringResult {
  status: 'success' | 'failed' | 'cookie_expired';
  clearRankDetected: number;
  clearKeywordDetected: number;
  // target_apps 表（竞品）
  clearRankMatched: number;
  clearKeywordMatched: number;
  clearRankUpdated: number;
  clearKeywordUpdated: number;
  totalTargetApps: number;
  // app_removal_monitor 表（我的应用）v7.2
  myAppClearRankMatched: number;
  myAppClearKeywordMatched: number;
  myAppClearRankUpdated: number;
  myAppClearKeywordUpdated: number;
  totalMyApps: number;
  // 执行信息
  executionDurationMs: number;
  errorMessage?: string;
  requestDetails?: Record<string, unknown>;
}

// ============================================================================
// 常量配置
// ============================================================================

// 七麦 API 接口（直接返回 JSON 数据，无需解析 HTML）
const QIMAI_CLEAR_RANK_API = 'https://api.qimai.cn/rank/clear';
const QIMAI_CLEAR_KEYWORD_API = 'https://api.qimai.cn/rank/clearWords';

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'Referer': 'https://www.qimai.cn/',
  'Origin': 'https://www.qimai.cn',
};

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 从清榜 API 响应中提取 App ID 列表
 */
function extractAppIdsFromClearRankResponse(data: QimaiClearRankResponse): string[] {
  const appIds = new Set<string>();
  
  // 清榜 API 结构：outList[].list[].appInfo.appId
  const outList = data.outList || [];
  for (const dayData of outList) {
    const list = dayData.list || [];
    for (const item of list) {
      const appId = item.appInfo?.appId;
      if (appId && /^\d{6,12}$/.test(appId)) {
        appIds.add(appId);
      }
    }
  }
  
  console.log(`[QimaiMonitor] 清榜 API 解析到 ${appIds.size} 个 App ID`);
  return Array.from(appIds);
}

/**
 * 从清词 API 响应中提取 App ID 列表
 */
function extractAppIdsFromClearKeywordResponse(data: QimaiClearKeywordResponse): string[] {
  const appIds = new Set<string>();
  
  // 清词 API 结构：list[].appInfo.appId
  const list = data.list || [];
  for (const item of list) {
    const appId = item.appInfo?.appId;
    if (appId && /^\d{6,12}$/.test(appId)) {
      appIds.add(appId);
    }
  }
  
  console.log(`[QimaiMonitor] 清词 API 解析到 ${appIds.size} 个 App ID`);
  return Array.from(appIds);
}

/**
 * 抓取七麦清榜 API 数据
 */
async function fetchQimaiClearRankApi(
  cookie: string
): Promise<{ appIds: string[]; isExpired: boolean; error?: string }> {
  try {
    console.log(`[QimaiMonitor] 开始请求清榜 API: ${QIMAI_CLEAR_RANK_API}`);
    
    const response = await fetch(QIMAI_CLEAR_RANK_API, {
      headers: {
        ...DEFAULT_HEADERS,
        'Cookie': cookie,
      },
    });
    
    if (!response.ok) {
      return { 
        appIds: [], 
        isExpired: response.status === 401 || response.status === 403,
        error: `HTTP ${response.status}: ${response.statusText}` 
      };
    }
    
    const data = await response.json() as QimaiClearRankResponse;
    console.log(`[QimaiMonitor] 清榜 API 响应: code=${data.code}, appNum=${data.appNum || 0}`);
    
    // 七麦 API 成功码是 10000
    if (data.code !== 10000) {
      const isExpired = data.msg?.includes('登录') || data.msg?.includes('login') || false;
      return { 
        appIds: [], 
        isExpired,
        error: data.msg || `API 返回错误码: ${data.code}` 
      };
    }
    
    const appIds = extractAppIdsFromClearRankResponse(data);
    return { appIds, isExpired: false };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[QimaiMonitor] 清榜 API 请求失败: ${errorMessage}`);
    return { 
      appIds: [], 
      isExpired: false, 
      error: `请求失败: ${errorMessage}` 
    };
  }
}

/**
 * 抓取七麦清词 API 数据
 */
async function fetchQimaiClearKeywordApi(
  cookie: string
): Promise<{ appIds: string[]; isExpired: boolean; error?: string }> {
  try {
    console.log(`[QimaiMonitor] 开始请求清词 API: ${QIMAI_CLEAR_KEYWORD_API}`);
    
    const response = await fetch(QIMAI_CLEAR_KEYWORD_API, {
      headers: {
        ...DEFAULT_HEADERS,
        'Cookie': cookie,
      },
    });
    
    if (!response.ok) {
      return { 
        appIds: [], 
        isExpired: response.status === 401 || response.status === 403,
        error: `HTTP ${response.status}: ${response.statusText}` 
      };
    }
    
    const data = await response.json() as QimaiClearKeywordResponse;
    console.log(`[QimaiMonitor] 清词 API 响应: code=${data.code}, appNum=${data.appNum || 0}`);
    
    // 七麦 API 成功码是 10000
    if (data.code !== 10000) {
      const isExpired = data.msg?.includes('登录') || data.msg?.includes('login') || false;
      return { 
        appIds: [], 
        isExpired,
        error: data.msg || `API 返回错误码: ${data.code}` 
      };
    }
    
    const appIds = extractAppIdsFromClearKeywordResponse(data);
    return { appIds, isExpired: false };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[QimaiMonitor] 清词 API 请求失败: ${errorMessage}`);
    return { 
      appIds: [], 
      isExpired: false, 
      error: `请求失败: ${errorMessage}` 
    };
  }
}

/**
 * 执行监控任务
 */
async function runMonitoring(supabase: ReturnType<typeof createClient>, cookie: string): Promise<MonitoringResult> {
  const startTime = Date.now();
  const requestDetails: Record<string, unknown> = {};
  
  try {
    // 1. 获取 target_apps 中所有的 app_id（竞品）
    const { data: targetApps, error: queryError } = await supabase
      .from('target_apps')
      .select('id, app_id, is_clear_rank, is_clear_keyword')
      .not('app_id', 'is', null);
    
    if (queryError) {
      throw new Error(`查询 target_apps 失败: ${queryError.message}`);
    }
    
    const totalTargetApps = targetApps?.length || 0;
    const targetAppIdSet = new Set((targetApps || []).map(app => app.app_id));
    
    console.log(`[QimaiMonitor] 📊 target_apps（竞品）中有 ${totalTargetApps} 个有效 App ID`);
    
    // 1.1 获取 app_removal_monitor 中所有的 app_store_id（我的应用）v7.2
    const { data: myApps, error: myAppsError } = await supabase
      .from('app_removal_monitor')
      .select('id, app_store_id, is_clear_rank, is_clear_keyword')
      .not('app_store_id', 'is', null);
    
    if (myAppsError) {
      console.error(`[QimaiMonitor] ⚠️ 查询 app_removal_monitor 失败: ${myAppsError.message}`);
    }
    
    const totalMyApps = myApps?.length || 0;
    const myAppIdSet = new Set((myApps || []).map(app => app.app_store_id));
    
    console.log(`[QimaiMonitor] 📊 app_removal_monitor（我的应用）中有 ${totalMyApps} 个有效 App ID`);
    
    // 2. 抓取清榜 API 数据
    const clearRankResult = await fetchQimaiClearRankApi(cookie);
    requestDetails.clearRank = {
      url: QIMAI_CLEAR_RANK_API,
      detected: clearRankResult.appIds.length,
      error: clearRankResult.error,
    };
    
    if (clearRankResult.isExpired) {
      return {
        status: 'cookie_expired',
        clearRankDetected: 0,
        clearKeywordDetected: 0,
        clearRankMatched: 0,
        clearKeywordMatched: 0,
        clearRankUpdated: 0,
        clearKeywordUpdated: 0,
        totalTargetApps,
        myAppClearRankMatched: 0,
        myAppClearKeywordMatched: 0,
        myAppClearRankUpdated: 0,
        myAppClearKeywordUpdated: 0,
        totalMyApps,
        executionDurationMs: Date.now() - startTime,
        errorMessage: clearRankResult.error || 'Cookie 已过期',
        requestDetails,
      };
    }
    
    console.log(`[QimaiMonitor] ✅ 清榜 API 检测到 ${clearRankResult.appIds.length} 个 App`);
    
    // 3. 抓取清词 API 数据
    const clearKeywordResult = await fetchQimaiClearKeywordApi(cookie);
    requestDetails.clearKeyword = {
      url: QIMAI_CLEAR_KEYWORD_API,
      detected: clearKeywordResult.appIds.length,
      error: clearKeywordResult.error,
    };
    
    if (clearKeywordResult.isExpired) {
      return {
        status: 'cookie_expired',
        clearRankDetected: clearRankResult.appIds.length,
        clearKeywordDetected: 0,
        clearRankMatched: 0,
        clearKeywordMatched: 0,
        clearRankUpdated: 0,
        clearKeywordUpdated: 0,
        totalTargetApps,
        myAppClearRankMatched: 0,
        myAppClearKeywordMatched: 0,
        myAppClearRankUpdated: 0,
        myAppClearKeywordUpdated: 0,
        totalMyApps,
        executionDurationMs: Date.now() - startTime,
        errorMessage: clearKeywordResult.error || 'Cookie 已过期',
        requestDetails,
      };
    }
    
    console.log(`[QimaiMonitor] ✅ 清词 API 检测到 ${clearKeywordResult.appIds.length} 个 App`);
    
    // 4. 匹配 target_apps（竞品）
    const clearRankMatchedIds = clearRankResult.appIds.filter(id => targetAppIdSet.has(id));
    const clearKeywordMatchedIds = clearKeywordResult.appIds.filter(id => targetAppIdSet.has(id));
    
    console.log(`[QimaiMonitor] 🎯 target_apps 匹配结果: 清榜 ${clearRankMatchedIds.length} 个, 清词 ${clearKeywordMatchedIds.length} 个`);
    
    // 4.1 匹配 app_removal_monitor（我的应用）v7.2
    const myAppClearRankMatchedIds = clearRankResult.appIds.filter(id => myAppIdSet.has(id));
    const myAppClearKeywordMatchedIds = clearKeywordResult.appIds.filter(id => myAppIdSet.has(id));
    
    console.log(`[QimaiMonitor] 🎯 app_removal_monitor 匹配结果: 清榜 ${myAppClearRankMatchedIds.length} 个, 清词 ${myAppClearKeywordMatchedIds.length} 个`);
    
    // 5. 更新清榜状态（只更新 is_clear_rank = false 的记录）
    let clearRankUpdated = 0;
    if (clearRankMatchedIds.length > 0) {
      const { data: updateRankData, error: updateRankError } = await supabase
        .from('target_apps')
        .update({ 
          is_clear_rank: true, 
          updated_at: new Date().toISOString() 
        })
        .in('app_id', clearRankMatchedIds)
        .eq('is_clear_rank', false)
        .select('id');
      
      if (updateRankError) {
        console.error(`[QimaiMonitor] ❌ 更新清榜状态失败: ${updateRankError.message}`);
      } else {
        clearRankUpdated = updateRankData?.length || 0;
        console.log(`[QimaiMonitor] ✅ 更新清榜状态: ${clearRankUpdated} 条记录`);
      }
    }
    
    // 6. 更新清词状态（只更新 is_clear_keyword = false 的记录）
    let clearKeywordUpdated = 0;
    if (clearKeywordMatchedIds.length > 0) {
      const { data: updateKeywordData, error: updateKeywordError } = await supabase
        .from('target_apps')
        .update({ 
          is_clear_keyword: true, 
          updated_at: new Date().toISOString() 
        })
        .in('app_id', clearKeywordMatchedIds)
        .eq('is_clear_keyword', false)
        .select('id');
      
      if (updateKeywordError) {
        console.error(`[QimaiMonitor] ❌ 更新 target_apps 清词状态失败: ${updateKeywordError.message}`);
      } else {
        clearKeywordUpdated = updateKeywordData?.length || 0;
        console.log(`[QimaiMonitor] ✅ 更新 target_apps 清词状态: ${clearKeywordUpdated} 条记录`);
      }
    }
    
    // 7. 更新 app_removal_monitor 清榜状态（我的应用）v7.2
    let myAppClearRankUpdated = 0;
    if (myAppClearRankMatchedIds.length > 0) {
      const { data: updateData, error: updateError } = await supabase
        .from('app_removal_monitor')
        .update({ 
          is_clear_rank: true, 
          updated_at: new Date().toISOString() 
        })
        .in('app_store_id', myAppClearRankMatchedIds)
        .eq('is_clear_rank', false)
        .select('id');
      
      if (updateError) {
        console.error(`[QimaiMonitor] ❌ 更新 app_removal_monitor 清榜状态失败: ${updateError.message}`);
      } else {
        myAppClearRankUpdated = updateData?.length || 0;
        console.log(`[QimaiMonitor] ✅ 更新 app_removal_monitor 清榜状态: ${myAppClearRankUpdated} 条记录`);
      }
    }
    
    // 8. 更新 app_removal_monitor 清词状态（我的应用）v7.2
    let myAppClearKeywordUpdated = 0;
    if (myAppClearKeywordMatchedIds.length > 0) {
      const { data: updateData, error: updateError } = await supabase
        .from('app_removal_monitor')
        .update({ 
          is_clear_keyword: true, 
          updated_at: new Date().toISOString() 
        })
        .in('app_store_id', myAppClearKeywordMatchedIds)
        .eq('is_clear_keyword', false)
        .select('id');
      
      if (updateError) {
        console.error(`[QimaiMonitor] ❌ 更新 app_removal_monitor 清词状态失败: ${updateError.message}`);
      } else {
        myAppClearKeywordUpdated = updateData?.length || 0;
        console.log(`[QimaiMonitor] ✅ 更新 app_removal_monitor 清词状态: ${myAppClearKeywordUpdated} 条记录`);
      }
    }
    
    // 9. 返回结果
    return {
      status: 'success',
      clearRankDetected: clearRankResult.appIds.length,
      clearKeywordDetected: clearKeywordResult.appIds.length,
      // target_apps（竞品）
      clearRankMatched: clearRankMatchedIds.length,
      clearKeywordMatched: clearKeywordMatchedIds.length,
      clearRankUpdated,
      clearKeywordUpdated,
      totalTargetApps,
      // app_removal_monitor（我的应用）
      myAppClearRankMatched: myAppClearRankMatchedIds.length,
      myAppClearKeywordMatched: myAppClearKeywordMatchedIds.length,
      myAppClearRankUpdated,
      myAppClearKeywordUpdated,
      totalMyApps,
      executionDurationMs: Date.now() - startTime,
      requestDetails,
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[QimaiMonitor] ❌ 监控任务失败: ${errorMessage}`);
    
    return {
      status: 'failed',
      clearRankDetected: 0,
      clearKeywordDetected: 0,
      clearRankMatched: 0,
      clearKeywordMatched: 0,
      clearRankUpdated: 0,
      clearKeywordUpdated: 0,
      totalTargetApps: 0,
      myAppClearRankMatched: 0,
      myAppClearKeywordMatched: 0,
      myAppClearRankUpdated: 0,
      myAppClearKeywordUpdated: 0,
      totalMyApps: 0,
      executionDurationMs: Date.now() - startTime,
      errorMessage,
      requestDetails,
    };
  }
}

/**
 * 记录执行日志
 */
async function logMonitoringResult(
  supabase: ReturnType<typeof createClient>,
  result: MonitoringResult
): Promise<void> {
  try {
    const { error } = await supabase
      .from('qimai_monitoring_logs')
      .insert({
        status: result.status,
        clear_rank_detected: result.clearRankDetected,
        clear_keyword_detected: result.clearKeywordDetected,
        clear_rank_matched: result.clearRankMatched,
        clear_keyword_matched: result.clearKeywordMatched,
        clear_rank_updated: result.clearRankUpdated,
        clear_keyword_updated: result.clearKeywordUpdated,
        total_target_apps: result.totalTargetApps,
        execution_duration_ms: result.executionDurationMs,
        error_message: result.errorMessage,
        request_details: result.requestDetails,
      });
    
    if (error) {
      console.error(`[QimaiMonitor] ❌ 记录日志失败: ${error.message}`);
    } else {
      console.log(`[QimaiMonitor] 📝 日志已记录`);
    }
  } catch (error) {
    console.error(`[QimaiMonitor] ❌ 记录日志异常:`, error);
  }
}

// ============================================================================
// 主处理函数
// ============================================================================

serve(async (req: Request) => {
  // CORS 预检请求
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }
  
  console.log(`[QimaiMonitor] 🚀 开始执行七麦自动监控任务`);
  console.log(`[QimaiMonitor] 📅 时间: ${new Date().toISOString()}`);
  
  // 获取环境变量
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  
  // 验证环境变量
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('[QimaiMonitor] ❌ 缺少 Supabase 环境变量');
    return new Response(
      JSON.stringify({ error: '缺少 Supabase 配置' }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
  
  // 创建 Supabase 客户端
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  // 从数据库读取七麦 Cookie（v7.1：改为从 system_configs 表读取）
  const { data: configData, error: configError } = await supabase
    .from('system_configs')
    .select('value, status')
    .eq('key', 'qimai_cookie')
    .single();
  
  if (configError || !configData) {
    console.error('[QimaiMonitor] ❌ 读取七麦 Cookie 配置失败:', configError?.message);
    return new Response(
      JSON.stringify({ error: '读取七麦 Cookie 配置失败，请在设置中配置' }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
  
  if (!configData.value) {
    console.error('[QimaiMonitor] ❌ 七麦 Cookie 未配置');
    return new Response(
      JSON.stringify({ error: '七麦 Cookie 未配置，请在设置中配置' }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
  
  if (configData.status === 'expired') {
    console.error('[QimaiMonitor] ⚠️ 七麦 Cookie 已过期');
    return new Response(
      JSON.stringify({ error: '七麦 Cookie 已过期，请在设置中更新' }),
      { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
  
  const qimaiCookie = configData.value;
  console.log('[QimaiMonitor] ✅ 已从数据库读取七麦 Cookie');
  
  // 执行监控
  const result = await runMonitoring(supabase, qimaiCookie);
  
  // 记录日志
  await logMonitoringResult(supabase, result);
  
  // 更新 Cookie 状态到 system_configs 表
  if (result.status === 'cookie_expired') {
    await supabase
      .from('system_configs')
      .update({ 
        status: 'expired',
        last_verified_at: new Date().toISOString(),
        last_verified_message: result.errorMessage || 'Cookie 已过期'
      })
      .eq('key', 'qimai_cookie');
    console.log('[QimaiMonitor] ⚠️ 已更新 Cookie 状态为 expired');
  } else if (result.status === 'success') {
    await supabase
      .from('system_configs')
      .update({ 
        status: 'active',
        last_verified_at: new Date().toISOString(),
        last_verified_message: `成功：检测清榜 ${result.clearRankDetected} 个，清词 ${result.clearKeywordDetected} 个`
      })
      .eq('key', 'qimai_cookie');
  }
  
  // 输出结果摘要
  console.log(`[QimaiMonitor] ========== 执行结果 ==========`);
  console.log(`[QimaiMonitor] 状态: ${result.status}`);
  console.log(`[QimaiMonitor] 七麦检测: 清榜 ${result.clearRankDetected} / 清词 ${result.clearKeywordDetected}`);
  console.log(`[QimaiMonitor] --- target_apps（竞品）---`);
  console.log(`[QimaiMonitor]   匹配: 清榜 ${result.clearRankMatched} / 清词 ${result.clearKeywordMatched}`);
  console.log(`[QimaiMonitor]   更新: 清榜 ${result.clearRankUpdated} / 清词 ${result.clearKeywordUpdated}`);
  console.log(`[QimaiMonitor] --- app_removal_monitor（我的应用）---`);
  console.log(`[QimaiMonitor]   匹配: 清榜 ${result.myAppClearRankMatched} / 清词 ${result.myAppClearKeywordMatched}`);
  console.log(`[QimaiMonitor]   更新: 清榜 ${result.myAppClearRankUpdated} / 清词 ${result.myAppClearKeywordUpdated}`);
  console.log(`[QimaiMonitor] 耗时: ${result.executionDurationMs}ms`);
  if (result.errorMessage) {
    console.log(`[QimaiMonitor] 错误: ${result.errorMessage}`);
  }
  console.log(`[QimaiMonitor] ================================`);
  
  // 返回响应
  return new Response(
    JSON.stringify({
      success: result.status === 'success',
      result,
    }),
    {
      status: result.status === 'success' ? 200 : 
              result.status === 'cookie_expired' ? 401 : 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    }
  );
});

