/**
 * 测试外部审核同步功能
 * 
 * 功能：
 * 1. 测试从明道云读取"正式包审核中"记录
 * 2. 测试去重逻辑
 * 3. 测试数据插入
 * 
 * 运行：
 * npx ts-node scripts/test-external-release-sync.ts
 */

import { HapClient } from '../src/hap-client';
import { SupabaseClient } from '../src/supabase-client';
import { ExternalReleaseSync } from '../src/external-release-sync';
import * as dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

async function main() {
  console.log('========================================');
  console.log('测试外部审核同步功能');
  console.log('========================================\n');

  // 1. 检查环境变量
  console.log('1️⃣ 检查环境变量...');
  const requiredEnvVars = [
    'HAP_APP_KEY',
    'HAP_SIGN',
    'HAP_APP_KEY_PRODUCTION_RELEASES',
    'HAP_SIGN_PRODUCTION_RELEASES',
    'HAP_WORKSHEET_PRODUCTS',
    'HAP_WORKSHEET_ACCOUNTS',
    'HAP_WORKSHEET_PRODUCTION_RELEASES',
    'HAP_WORKSHEET_UPDATE_TASKS',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
  ];

  const missing: string[] = [];
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  }

  if (missing.length > 0) {
    console.error('❌ 缺少环境变量:');
    missing.forEach(v => console.error(`   - ${v}`));
    process.exit(1);
  }

  console.log('✅ 环境变量检查通过\n');

  // 2. 初始化客户端
  console.log('2️⃣ 初始化客户端...');
  const hapClient = new HapClient({
    appKey: process.env.HAP_APP_KEY!,
    sign: process.env.HAP_SIGN!,
    worksheetProducts: process.env.HAP_WORKSHEET_PRODUCTS!,
    worksheetAccounts: process.env.HAP_WORKSHEET_ACCOUNTS!,
    worksheetProductionReleases: process.env.HAP_WORKSHEET_PRODUCTION_RELEASES,
    appKeyProductionReleases: process.env.HAP_APP_KEY_PRODUCTION_RELEASES,
    signProductionReleases: process.env.HAP_SIGN_PRODUCTION_RELEASES,
  });

  const supabaseClient = new SupabaseClient();

  const syncService = new ExternalReleaseSync(hapClient, supabaseClient);
  console.log('✅ 客户端初始化成功\n');

  // 3. 执行同步
  console.log('3️⃣ 执行同步...');
  console.log('⏳ 正在从明道云读取数据...\n');

  const result = await syncService.syncExternalReleases();

  console.log('\n========================================');
  console.log('同步结果:');
  console.log('========================================');
  
  if (result.success) {
    console.log('✅ 同步成功');
    console.log(`   - 新增: ${result.data!.newCount} 条`);
    console.log(`   - 已存在: ${result.data!.existCount} 条`);
    console.log(`   - 失败: ${result.data!.failCount} 条`);
    
    if (result.data!.failCount > 0) {
      console.log('\n失败详情:');
      result.data!.failedApps.forEach((app, index) => {
        console.log(`   ${index + 1}. ${app.appName} v${app.version}`);
        console.log(`      错误: ${app.error}`);
      });
    }
  } else {
    console.log('❌ 同步失败');
    console.log(`   错误: ${result.error}`);
  }

  console.log('\n========================================');
  console.log('测试完成');
  console.log('========================================');
}

main().catch(error => {
  console.error('\n❌ 测试失败:', error);
  process.exit(1);
});
