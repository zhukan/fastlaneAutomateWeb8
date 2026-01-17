/**
 * 测试账号产品数量字段同步
 * 
 * 用于验证 tmqjwjwjsjsj@163.com 账号的"账号上的产品"字段能否正确获取
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '../.env') });

// ==================== 明道云字段 ID ====================
const FIELD_IDS = {
  ACCOUNT_EMAIL: '640adea9c04c8d453ff1ce53',          // 邮箱
  ACCOUNT_PRODUCT_COUNT: '657eb6aa8d3800f9a1b01c13',  // 账号上的产品数量
  ACCOUNT_STATUS: '6432921f1a26322d585e393b',         // 账号状态
};

// ==================== 测试函数 ====================

/**
 * 获取字段值（修复后的版本）
 */
function getFieldValueFixed(record: any, fieldId: string): any {
  // ⚠️ 注意：不能用 || null，因为 0 也是有效值
  return record[fieldId] !== undefined && record[fieldId] !== null ? record[fieldId] : null;
}

/**
 * 获取字段值（错误的版本 - 用于对比）
 */
function getFieldValueBuggy(record: any, fieldId: string): any {
  return record[fieldId] || null;
}

/**
 * 从明道云获取账号数据
 */
async function fetchAccountFromHap(email: string): Promise<any> {
  const appKey = process.env.HAP_APP_KEY;
  const sign = process.env.HAP_SIGN;
  const worksheetId = '640adea9c04c8d453ff1ce52'; // 苹果开发者账号表

  if (!appKey || !sign) {
    throw new Error('❌ 缺少 HAP_APP_KEY 或 HAP_SIGN 环境变量');
  }

  console.log(`\n[测试] 正在从明道云查询账号: ${email}`);
  console.log(`[测试] 工作表ID: ${worksheetId}`);

  const url = `https://api.mingdao.com/v3/app/worksheets/${worksheetId}/rows/list`;
  
  const body = {
    pageSize: 100,
    pageIndex: 1,
    useFieldIdAsKey: true,  // 🔧 使用字段ID作为key（必须设置！）
    filter: {
      type: 'group',
      logic: 'AND',
      children: [
        {
          type: 'condition',
          field: FIELD_IDS.ACCOUNT_EMAIL,
          operator: 'eq',
          value: email,
        },
      ],
    },
  };

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
  
  if (rows.length === 0) {
    throw new Error(`❌ 未找到账号: ${email}`);
  }

  console.log(`✅ 找到账号记录，rowid: ${rows[0].rowid}`);
  return rows[0];
}

/**
 * 主测试函数
 */
async function testAccountProductCount() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 测试：账号产品数量字段同步');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const testEmail = 'tmqjwjwjsjsj@163.com';

  try {
    // 1. 从明道云获取账号数据
    const record = await fetchAccountFromHap(testEmail);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 原始数据分析');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // 2. 检查产品数量字段的原始值
    const rawProductCount = record[FIELD_IDS.ACCOUNT_PRODUCT_COUNT];
    console.log(`字段ID: ${FIELD_IDS.ACCOUNT_PRODUCT_COUNT}`);
    console.log(`原始值: ${JSON.stringify(rawProductCount)}`);
    console.log(`值类型: ${typeof rawProductCount}`);
    console.log(`是否为 undefined: ${rawProductCount === undefined}`);
    console.log(`是否为 null: ${rawProductCount === null}`);
    console.log(`是否为 0: ${rawProductCount === 0}`);
    console.log(`是否为空字符串: ${rawProductCount === ''}`);

    // 3. 测试两种获取方法的差异
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 字段获取方法对比');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const buggyValue = getFieldValueBuggy(record, FIELD_IDS.ACCOUNT_PRODUCT_COUNT);
    const fixedValue = getFieldValueFixed(record, FIELD_IDS.ACCOUNT_PRODUCT_COUNT);

    console.log(`❌ 错误方法 (record[fieldId] || null):`);
    console.log(`   返回值: ${JSON.stringify(buggyValue)}`);
    console.log(`   值类型: ${typeof buggyValue}`);

    console.log(`\n✅ 修复方法 (检查 undefined 和 null):`);
    console.log(`   返回值: ${JSON.stringify(fixedValue)}`);
    console.log(`   值类型: ${typeof fixedValue}`);

    // 4. 显示差异
    if (buggyValue !== fixedValue) {
      console.log(`\n⚠️  两种方法返回的值不同！`);
      console.log(`   这就是为什么同步失败的原因。`);
    } else {
      console.log(`\n✅ 两种方法返回相同值。`);
    }

    // 5. 检查其他相关字段
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 账号其他信息');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const email = getFieldValueFixed(record, FIELD_IDS.ACCOUNT_EMAIL);
    const status = getFieldValueFixed(record, FIELD_IDS.ACCOUNT_STATUS);

    console.log(`邮箱: ${email}`);
    console.log(`账号状态: ${JSON.stringify(status)}`);
    console.log(`产品数量: ${fixedValue}`);

    // 6. 显示完整的记录（仅关键字段）
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔧 原始记录（关键字段）');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const relevantFields = {
      rowid: record.rowid,
      [FIELD_IDS.ACCOUNT_EMAIL]: record[FIELD_IDS.ACCOUNT_EMAIL],
      [FIELD_IDS.ACCOUNT_PRODUCT_COUNT]: record[FIELD_IDS.ACCOUNT_PRODUCT_COUNT],
      [FIELD_IDS.ACCOUNT_STATUS]: record[FIELD_IDS.ACCOUNT_STATUS],
    };

    console.log(JSON.stringify(relevantFields, null, 2));

    // 7. 测试结果
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ 测试结果');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (fixedValue !== null && fixedValue !== undefined) {
      console.log(`✅ 成功获取产品数量: ${fixedValue}`);
      console.log(`✅ 修复后的代码可以正确处理该值`);
    } else {
      console.log(`⚠️  产品数量字段为空或未定义`);
      console.log(`   这可能意味着明道云中该字段确实是空值`);
    }

    // 8. 建议
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💡 建议');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (buggyValue !== fixedValue) {
      console.log('1. 代码已修复，需要重新编译');
      console.log('2. 重启 fastlane-agent 服务');
      console.log('3. 在前端执行"全量同步"');
      console.log('4. 验证数据库中的值是否正确更新');
    } else {
      console.log('1. 字段值获取正常');
      console.log('2. 如果同步后仍为 0，检查数据库更新逻辑');
    }

  } catch (error: any) {
    console.error('\n❌ 测试失败:', error.message);
    process.exit(1);
  }
}

// 运行测试
testAccountProductCount()
  .then(() => {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ 未捕获的错误:', error);
    process.exit(1);
  });

