/**
 * 测试开发者账号表同步
 * 用于诊断 ri_developer_accounts 表为空的问题
 */

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const APP_KEY = process.env.HAP_APP_KEY || '';
const SIGN = process.env.HAP_SIGN || ''; // ✅ 直接使用 HAP_SIGN
const WORKSHEET_ACCOUNTS = '640adea9c04c8d453ff1ce52'; // 苹果开发者账号表

const FIELD_IDS = {
  ACCOUNT_EMAIL: '640adea9c04c8d453ff1ce53',       // 邮箱
  ACCOUNT_SOURCE: '6414a3bc6c388d0f1bb7ce23',      // 账号来源
  REGISTRATION_DATE: '641b0ff44e1d7ba57724eec6',  // 注册时间
};

async function testAccountsSync() {
  console.log('🧪 测试开发者账号表同步...\n');
  
  // 使用 V3 API（正确的端点格式）
  const url = `https://api.mingdao.com/v3/app/worksheets/${WORKSHEET_ACCOUNTS}/rows/list`;
  
  const body = {
    pageSize: 10,
    pageIndex: 1,
  };
  
  console.log('📡 请求明道云账号表（使用"二维奇智"应用认证）...');
  console.log(`  API: V3 (/v3/app/worksheets/:id/rows/list)`);
  console.log(`  表ID: ${WORKSHEET_ACCOUNTS}`);
  console.log(`  别名: pgkfzzh`);
  console.log(`  应用: 二维奇智`);
  console.log(`  APP_KEY: ${APP_KEY.substring(0, 10)}...`);
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'HAP-Appkey': APP_KEY,
        'HAP-Sign': SIGN,
      },
      body: JSON.stringify(body),
    });
    
    if (!response.ok) {
      console.error(`❌ HTTP错误: ${response.status} ${response.statusText}`);
      return;
    }
    
    const data: any = await response.json();
    
    console.log(`\n✅ API响应成功`);
    console.log(`  success: ${data.success}`);
    console.log(`  error_code: ${data.error_code}`);
    
    // V3 API 响应格式：data.data.rows 和 data.data.total
    const rows = data.data?.rows || [];
    const total = data.data?.total || 0;
    
    console.log(`  总记录数: ${total}`);
    console.log(`  返回行数: ${rows.length}\n`);
    
    if (rows.length === 0) {
      console.log('⚠️  账号表为空，或者没有权限访问');
      console.log('\n可能的原因：');
      console.log('  1. 表确实没有数据');
      console.log('  2. "二维奇智"应用没有访问此表的权限');
      console.log('  3. 表ID或应用配置错误');
      return;
    }
    
    // 打印第1条记录的完整结构（用于调试）
    console.log('🔍 第1条记录的完整结构（部分）：\n');
    const firstRecordKeys = Object.keys(rows[0]).slice(0, 10);
    console.log(`  字段总数: ${Object.keys(rows[0]).length}`);
    console.log(`  前10个字段: ${firstRecordKeys.join(', ')}\n`);
    
    // 打印前3条记录的字段值
    console.log('📋 前3条记录的字段值：\n');
    
    for (let i = 0; i < Math.min(3, rows.length); i++) {
      const record = rows[i];
      console.log(`━━━ 记录 ${i + 1} ━━━`);
      console.log(`  rowid: ${record.rowid}`);
      console.log(`  ctime: ${record.ctime}`);
      console.log(`  邮箱字段 (${FIELD_IDS.ACCOUNT_EMAIL}):`);
      console.log(`    值: ${JSON.stringify(record[FIELD_IDS.ACCOUNT_EMAIL])}`);
      console.log(`  账号来源 (${FIELD_IDS.ACCOUNT_SOURCE}):`);
      console.log(`    值: ${JSON.stringify(record[FIELD_IDS.ACCOUNT_SOURCE])}`);
      console.log(`  注册时间 (${FIELD_IDS.REGISTRATION_DATE}):`);
      console.log(`    值: ${JSON.stringify(record[FIELD_IDS.REGISTRATION_DATE])}`);
      console.log('');
    }
    
    // 检查字段值是否为空
    const firstRecord = rows[0];
    const hasEmail = !!firstRecord[FIELD_IDS.ACCOUNT_EMAIL];
    const hasSource = !!firstRecord[FIELD_IDS.ACCOUNT_SOURCE];
    const hasRegDate = !!firstRecord[FIELD_IDS.REGISTRATION_DATE];
    
    console.log('🔍 字段数据检查：');
    console.log(`  邮箱字段有数据: ${hasEmail ? '✅ 是' : '❌ 否'}`);
    console.log(`  账号来源有数据: ${hasSource ? '✅ 是' : '❌ 否'}`);
    console.log(`  注册时间有数据: ${hasRegDate ? '✅ 是' : '❌ 否'}`);
    
    // 检查账号来源字段是否是选项字段（需要解析）
    if (hasSource) {
      const sourceValue = firstRecord[FIELD_IDS.ACCOUNT_SOURCE];
      if (typeof sourceValue === 'object') {
        console.log('\n💡 账号来源字段是对象，可能需要解析：');
        if (Array.isArray(sourceValue)) {
          console.log('  类型: 数组（多选选项字段）');
          console.log(`  解析后值: ${sourceValue.map((o: any) => o.value || o.Value).join(', ')}`);
        } else {
          console.log('  类型: 对象（单选选项字段）');
          console.log(`  解析后值: ${sourceValue.value || sourceValue.Value}`);
        }
      }
    }
    
    if (!hasEmail && !hasSource && !hasRegDate) {
      console.log('\n⚠️  所有字段都是空的！可能原因：');
      console.log('  1. 字段ID不正确');
      console.log('  2. 明道云表中这些字段确实没有数据');
      console.log('  3. 没有访问这些字段的权限');
    } else {
      console.log('\n✅ 字段数据可用，同步应该能正常工作！');
    }
    
  } catch (error: any) {
    console.error('❌ 请求失败:', error.message);
  }
}

testAccountsSync();

