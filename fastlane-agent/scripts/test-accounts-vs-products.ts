/**
 * 对比测试：账号上的产品表 vs 苹果开发者账号表
 * 使用完全相同的访问方式，找出差异
 */

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const APP_KEY = process.env.HAP_APP_KEY || '';
const SIGN = process.env.HAP_SIGN || ''; // ✅ 直接使用 HAP_SIGN，不需要计算MD5

async function testWorksheet(worksheetId: string, worksheetName: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📋 测试工作表: ${worksheetName}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`  表ID: ${worksheetId}`);
  console.log(`  应用: 二维奇智`);
  console.log(`  APP_KEY: ${APP_KEY.substring(0, 10)}...`);
  
  // 使用与 fetchAllFromHap 完全相同的 API 调用方式
  const url = `https://api.mingdao.com/v3/app/worksheets/${worksheetId}/rows/list`;
  
  const body = {
    pageSize: 5,
    pageIndex: 1,
  };
  
  console.log(`\n📡 请求URL: ${url}`);
  console.log(`📦 请求Body:`, JSON.stringify(body, null, 2));
  console.log(`🔑 请求Headers:`);
  console.log(`  Content-Type: application/json`);
  console.log(`  HAP-Appkey: ${APP_KEY.substring(0, 10)}...`);
  console.log(`  HAP-Sign: ${SIGN.substring(0, 10)}...`);
  
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
    
    console.log(`\n📨 响应状态: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      const text = await response.text();
      console.error(`❌ 请求失败！`);
      console.error(`  响应内容: ${text.substring(0, 200)}`);
      return { success: false, error: `${response.status} ${response.statusText}` };
    }
    
    const data: any = await response.json();
    
    console.log(`✅ 请求成功！`);
    console.log(`  success: ${data.success}`);
    console.log(`  error_code: ${data.error_code}`);
    console.log(`  总记录数: ${data.data?.total || 0}`);
    console.log(`  返回行数: ${data.data?.rows?.length || 0}`);
    
    if (data.data?.rows && data.data.rows.length > 0) {
      const firstRow = data.data.rows[0];
      const fieldCount = Object.keys(firstRow).length;
      const firstFields = Object.keys(firstRow).slice(0, 5);
      console.log(`  第1行字段数: ${fieldCount}`);
      console.log(`  前5个字段: ${firstFields.join(', ')}`);
    }
    
    return { success: true, data };
    
  } catch (error: any) {
    console.error(`❌ 请求异常:`, error.message);
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('\n🧪 开始对比测试...');
  console.log(`📅 时间: ${new Date().toLocaleString()}`);
  
  // 测试1: 账号上的产品表（应该成功）
  const result1 = await testWorksheet(
    '643418197f0301fb51750f00',
    '账号上的产品表'
  );
  
  // 测试2: 苹果开发者账号表（目前失败）
  const result2 = await testWorksheet(
    '640adea9c04c8d453ff1ce52',
    '苹果开发者账号表'
  );
  
  // 对比结果
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 测试结果对比`);
  console.log(`${'='.repeat(60)}`);
  console.log(`  账号上的产品表: ${result1.success ? '✅ 成功' : '❌ 失败'}`);
  console.log(`  苹果开发者账号表: ${result2.success ? '✅ 成功' : '❌ 失败'}`);
  
  if (!result2.success && result1.success) {
    console.log(`\n❓ 为什么会不一样？`);
    console.log(`  两个表都在"二维奇智"应用下`);
    console.log(`  使用完全相同的API调用方式`);
    console.log(`  使用相同的认证信息（APP_KEY + SIGN）`);
    console.log(`\n可能的原因：`);
    console.log(`  1. API密钥的表级别权限配置不同`);
    console.log(`  2. 账号表有特殊的访问限制`);
    console.log(`  3. 需要检查明道云后台的API权限设置`);
  } else if (result2.success) {
    console.log(`\n✅ 两个表都可以访问！问题已解决！`);
  }
}

main().catch(console.error);

