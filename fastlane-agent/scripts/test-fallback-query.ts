/**
 * 测试降级查询路径
 * 验证通过 Bundle ID 查询"App生产发布"表是否能获取开发者账号信息
 */

import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { HapClient } from '../src/hap-client';

dotenv.config({ path: resolve(__dirname, '../.env') });

const TEST_BUNDLE_ID = process.env.TEST_BUNDLE_ID || 'com.b7q1e4h1n.IIlIlI';

async function testFallbackQuery() {
  console.log('🧪 测试降级查询路径\n');
  console.log(`Bundle ID: ${TEST_BUNDLE_ID}\n`);

  // 检查必要的环境变量
  const requiredVars = [
    'HAP_APP_KEY',
    'HAP_SIGN',
    'HAP_WORKSHEET_PRODUCTS',
    'HAP_WORKSHEET_ACCOUNTS',
    'HAP_WORKSHEET_PRODUCTION_RELEASES',
  ];

  const missing = requiredVars.filter(v => !process.env[v]);
  if (missing.length > 0) {
    console.error(`❌ 缺少必要的环境变量: ${missing.join(', ')}`);
    return;
  }

  try {
    const hapClient = new HapClient({
      appKey: process.env.HAP_APP_KEY!,
      sign: process.env.HAP_SIGN!,
      worksheetProducts: process.env.HAP_WORKSHEET_PRODUCTS!,
      worksheetAccounts: process.env.HAP_WORKSHEET_ACCOUNTS!,
      worksheetProductionReleases: process.env.HAP_WORKSHEET_PRODUCTION_RELEASES,
      appKeyProductionReleases: process.env.HAP_APP_KEY_PRODUCTION_RELEASES,
      signProductionReleases: process.env.HAP_SIGN_PRODUCTION_RELEASES,
    });

    console.log('📋 开始查询...\n');
    const accountInfo = await hapClient.getAppleAccountByBundleId(TEST_BUNDLE_ID);

    if (accountInfo) {
      console.log('\n✅ 成功获取开发者账号信息：\n');
      console.log(`  Apple ID: ${accountInfo.appleId}`);
      console.log(`  Team ID: ${accountInfo.teamId}`);
      console.log(`  API Key ID: ${accountInfo.apiKeyId}`);
      console.log(`  Issuer ID: ${accountInfo.apiKeyIssuerId}`);
      console.log(`  API Key Content: ${accountInfo.apiKeyContent ? '已设置 (' + accountInfo.apiKeyContent.length + ' 字符)' : '未设置'}`);
      
      if (accountInfo.hapAccountId) {
        console.log(`  HAP Account ID: ${accountInfo.hapAccountId}`);
      }
      if (accountInfo.accountName) {
        console.log(`  Account Name: ${accountInfo.accountName}`);
      }
    } else {
      console.log('\n❌ 未找到开发者账号信息');
      console.log('\n可能的原因：');
      console.log('1. "账号上的产品"表中没有此 Bundle ID 的记录');
      console.log('2. "App生产发布"表中没有此 Bundle ID 的记录（降级查询）');
      console.log('3. 相关记录未关联开发者账号');
      console.log('4. 开发者账号信息不完整');
    }

  } catch (error: any) {
    console.error('\n❌ 查询失败:', error.message);
    console.error('详细信息:', error.stack);
  }
}

testFallbackQuery();
