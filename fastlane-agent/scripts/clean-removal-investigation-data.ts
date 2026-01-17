/**
 * 清理下架排查模块的所有数据
 * 
 * 用途：清除错误的同步数据，准备重新同步
 * 
 * 使用方法：
 *   npx ts-node scripts/clean-removal-investigation-data.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// 尝试多个可能的 .env 文件路径
const possibleEnvPaths = [
  path.resolve(__dirname, '../.env'),              // 从 fastlane-agent/scripts 到 fastlane-agent
  path.resolve(process.cwd(), '.env'),             // 当前工作目录
  '/Users/zhukan/Documents/code/fastlaneAutomateWeb6/fastlane-agent/.env', // 绝对路径
  path.resolve(__dirname, '../../.env'),           // 项目根目录（备用）
];

let envLoaded = false;
for (const envPath of possibleEnvPaths) {
  if (fs.existsSync(envPath)) {
    console.log(`✅ 找到 .env 文件: ${envPath}`);
    dotenv.config({ path: envPath });
    envLoaded = true;
    break;
  }
}

if (!envLoaded) {
  console.error('❌ 未找到 .env 文件，尝试的路径：');
  possibleEnvPaths.forEach(p => console.error(`  - ${p}`));
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

console.log(`\n🔍 环境变量检查：`);
console.log(`  SUPABASE_URL: ${supabaseUrl ? '✅ 已设置' : '❌ 未设置'}`);
console.log(`  SUPABASE_KEY: ${supabaseKey ? '✅ 已设置' : '❌ 未设置'}\n`);

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ 错误：未找到 SUPABASE_URL 或 SUPABASE_KEY 环境变量');
  console.error('请确保 .env 文件存在并包含正确的配置');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanData() {
  console.log('\n🧹 开始清理下架排查模块数据...\n');
  
  try {
    // 1. 清理操作记录表（operation_records）
    console.log('📝 清理操作记录表 (operation_records)...');
    const { error: opError, count: opCount } = await supabase
      .from('operation_records')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // 删除所有记录
    
    if (opError) {
      console.error('❌ 清理操作记录失败:', opError.message);
    } else {
      console.log(`✅ 已清理操作记录: ${opCount || '所有'} 条`);
    }

    // 2. 清理已下架app表（removed_apps）
    console.log('\n📱 清理已下架app表 (removed_apps)...');
    const { error: appError, count: appCount } = await supabase
      .from('removed_apps')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    
    if (appError) {
      console.error('❌ 清理已下架app失败:', appError.message);
    } else {
      console.log(`✅ 已清理已下架app: ${appCount || '所有'} 条`);
    }

    // 3. 清理开发者账号表（ri_developer_accounts）
    console.log('\n👤 清理开发者账号表 (ri_developer_accounts)...');
    const { error: accError, count: accCount } = await supabase
      .from('ri_developer_accounts')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    
    if (accError) {
      console.error('❌ 清理开发者账号失败:', accError.message);
    } else {
      console.log(`✅ 已清理开发者账号: ${accCount || '所有'} 条`);
    }

    // 4. 清理同步日志表（removal_investigation_sync_logs）
    console.log('\n📊 清理同步日志表 (removal_investigation_sync_logs)...');
    const { error: logError, count: logCount } = await supabase
      .from('removal_investigation_sync_logs')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    
    if (logError) {
      console.error('❌ 清理同步日志失败:', logError.message);
    } else {
      console.log(`✅ 已清理同步日志: ${logCount || '所有'} 条`);
    }

    console.log('\n✨ 数据清理完成！\n');
    console.log('💡 提示：现在可以重新运行全量同步或增量同步');
    
  } catch (error: any) {
    console.error('\n❌ 清理过程中发生错误:', error.message);
    process.exit(1);
  }
}

// 执行清理
cleanData()
  .then(() => {
    console.log('🎉 脚本执行成功');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 脚本执行失败:', error);
    process.exit(1);
  });

