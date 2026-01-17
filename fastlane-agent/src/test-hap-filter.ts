/**
 * 明道云 V3 API 测试脚本
 * 
 * 用途：验证 V3 API 的筛选功能是否正确工作
 * 
 * 运行方式：
 * cd fastlane-agent
 * npx ts-node src/test-hap-filter.ts
 */

import 'dotenv/config';
import { APP_STATUS_KEYS } from './hap-client';

// V3 API 使用 RESTful 风格路径
const baseUrl = 'https://api.mingdao.com';
const appKey = process.env.HAP_APP_KEY!;
const sign = process.env.HAP_SIGN!;
const worksheetId = process.env.HAP_WORKSHEET_PRODUCTS!; // 账号上的产品表

// 字段 ID 映射
const FIELD_BUNDLE_ID = '64b3a82fa75368cd24c99d8d';
const FIELD_APP_STATUS = '64366ef856462b8747391a08';
const FIELD_APP_NAME = '68589e638230c51cdfa80c90';

interface TestResult {
  testName: string;
  totalRows: number;
  success: boolean;
  error?: string;
}

/**
 * V3 API: 获取行记录列表
 * POST /v3/app/worksheets/{worksheet_id}/rows/list
 * 认证方式：通过 HTTP Header (HAP-Appkey, HAP-Sign)
 */
async function v3GetRows(
  worksheetId: string,
  options: { filter?: any; pageSize?: number; pageIndex?: number } = {}
): Promise<{ rows: any[]; total?: number }> {
  const url = `${baseUrl}/v3/app/worksheets/${worksheetId}/rows/list`;

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
      'HAP-Appkey': appKey,
      'HAP-Sign': sign,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${response.statusText} - ${text}`);
  }

  const data = await response.json() as any;

  if (!data.success) {
    throw new Error(data.error_msg || `API Error: ${data.error_code}`);
  }

  return {
    rows: data.data?.rows || [],
    total: data.data?.total,
  };
}

async function testV3ApiFilter(): Promise<void> {
  console.log('🔧 明道云 V3 API 筛选测试\n');
  console.log('========================================');
  console.log(`API 版本: V3 (RESTful)`);
  console.log(`端点: POST /v3/app/worksheets/{id}/rows/list`);
  console.log(`工作表 ID: ${worksheetId}`);
  console.log('========================================\n');

  if (!appKey || !sign || !worksheetId) {
    console.error('❌ 缺少必要的环境变量: HAP_APP_KEY, HAP_SIGN, HAP_WORKSHEET_PRODUCTS');
    process.exit(1);
  }

  const results: TestResult[] = [];

  // ==================== 测试 1: 使用选项 Key 值筛选"正式包上架" ====================
  console.log('📋 测试1: 使用选项 Key 值筛选"正式包上架"');
  console.log(`   Key 值: ${APP_STATUS_KEYS.FORMAL_ONLINE}`);

  try {
    const { rows, total } = await v3GetRows(worksheetId, {
      filter: {
        type: 'group',
        logic: 'AND',
        children: [
          {
            type: 'condition',
            field: FIELD_APP_STATUS,
            operator: 'eq',
            value: [APP_STATUS_KEYS.FORMAL_ONLINE],
          },
        ],
      },
      pageSize: 10,
    });

    console.log(`   ✅ 返回 ${rows.length} 条记录${total ? ` (共 ${total} 条)` : ''}`);

    // 显示前 3 条
    rows.slice(0, 3).forEach((row: any, idx: number) => {
      const bundleId = row[FIELD_BUNDLE_ID];
      const appName = row[FIELD_APP_NAME];
      const status = row[FIELD_APP_STATUS];
      console.log(`      ${idx + 1}. ${appName || bundleId} - 状态: ${JSON.stringify(status)}`);
    });

    results.push({ testName: '测试1: Key 值筛选', totalRows: rows.length, success: true });
  } catch (error: any) {
    console.log(`   ❌ 请求失败: ${error.message}`);
    results.push({
      testName: '测试1: Key 值筛选',
      totalRows: 0,
      success: false,
      error: error.message,
    });
  }

  console.log('');

  // ==================== 测试 2: 使用 ne 操作符排除"APP被下架" ====================
  console.log('📋 测试2: 使用 ne 操作符排除"APP被下架"');
  console.log(`   Key 值: ${APP_STATUS_KEYS.APP_REMOVED}`);

  try {
    const { rows, total } = await v3GetRows(worksheetId, {
      filter: {
        type: 'group',
        logic: 'AND',
        children: [
          {
            type: 'condition',
            field: FIELD_APP_STATUS,
            operator: 'ne',
            value: [APP_STATUS_KEYS.APP_REMOVED],
          },
        ],
      },
      pageSize: 10,
    });

    console.log(`   ✅ 返回 ${rows.length} 条记录${total ? ` (共 ${total} 条)` : ''}`);
    results.push({ testName: '测试2: ne 排除筛选', totalRows: rows.length, success: true });
  } catch (error: any) {
    console.log(`   ❌ 请求失败: ${error.message}`);
    results.push({
      testName: '测试2: ne 排除筛选',
      totalRows: 0,
      success: false,
      error: error.message,
    });
  }

  console.log('');

  // ==================== 测试 3: Bundle ID 精确匹配 ====================
  console.log('📋 测试3: Bundle ID 精确匹配');

  try {
    // 先获取一个真实的 Bundle ID
    const { rows: allRows } = await v3GetRows(worksheetId, { pageSize: 1 });

    if (allRows.length > 0) {
      const testBundleId = allRows[0][FIELD_BUNDLE_ID];
      console.log(`   使用 Bundle ID: ${testBundleId}`);

      // 测试精确匹配
      const { rows } = await v3GetRows(worksheetId, {
        filter: {
          type: 'condition',
          field: FIELD_BUNDLE_ID,
          operator: 'eq',
          value: testBundleId,
        },
        pageSize: 10,
      });

      if (rows.length === 1 && rows[0][FIELD_BUNDLE_ID] === testBundleId) {
        console.log(`   ✅ 精确匹配成功！`);
        results.push({ testName: '测试3: Bundle ID 精确匹配', totalRows: 1, success: true });
      } else {
        console.log(`   ⚠️ 返回 ${rows.length} 条记录`);
        results.push({ testName: '测试3: Bundle ID 精确匹配', totalRows: rows.length, success: false });
      }
    } else {
      console.log(`   ⚠️ 无法获取测试数据`);
      results.push({ testName: '测试3: Bundle ID 精确匹配', totalRows: 0, success: false });
    }
  } catch (error: any) {
    console.log(`   ❌ 请求失败: ${error.message}`);
    results.push({
      testName: '测试3: Bundle ID 精确匹配',
      totalRows: 0,
      success: false,
      error: error.message,
    });
  }

  // ==================== 汇总报告 ====================
  console.log('\n========================================');
  console.log('📊 测试汇总报告');
  console.log('========================================\n');

  console.log('| 测试项 | 记录数 | 结果 |');
  console.log('|--------|--------|------|');

  results.forEach((r) => {
    const status = r.success ? '✅ 通过' : '❌ 失败';
    console.log(`| ${r.testName} | ${r.totalRows} | ${status} |`);
  });

  const allPassed = results.every((r) => r.success);
  console.log(
    `\n${allPassed ? '✅ 所有测试通过！V3 API 升级成功' : '⚠️ 部分测试未通过，请检查'}`
  );

  if (!allPassed) {
    console.log('\n失败详情:');
    results
      .filter((r) => !r.success)
      .forEach((r) => {
        console.log(`  - ${r.testName}: ${r.error || '未知错误'}`);
      });
  }
}

testV3ApiFilter().catch(console.error);
