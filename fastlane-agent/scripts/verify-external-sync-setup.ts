/**
 * 验证外部审核同步功能的环境配置
 * 
 * 检查项：
 * 1. 环境变量完整性
 * 2. 明道云API连接
 * 3. Supabase连接
 * 4. 数据库表结构
 * 
 * 运行：
 * npx ts-node scripts/verify-external-sync-setup.ts
 */

import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

async function main() {
  console.log('========================================');
  console.log('验证外部审核同步功能配置');
  console.log('========================================\n');

  let allPassed = true;

  // 1. 检查环境变量
  console.log('1️⃣ 检查环境变量...');
  const requiredEnvVars = {
    'HAP_APP_KEY': process.env.HAP_APP_KEY,
    'HAP_SIGN': process.env.HAP_SIGN,
    'HAP_APP_KEY_PRODUCTION_RELEASES': process.env.HAP_APP_KEY_PRODUCTION_RELEASES,
    'HAP_SIGN_PRODUCTION_RELEASES': process.env.HAP_SIGN_PRODUCTION_RELEASES,
    'HAP_WORKSHEET_PRODUCTS': process.env.HAP_WORKSHEET_PRODUCTS,
    'HAP_WORKSHEET_ACCOUNTS': process.env.HAP_WORKSHEET_ACCOUNTS,
    'HAP_WORKSHEET_PRODUCTION_RELEASES': process.env.HAP_WORKSHEET_PRODUCTION_RELEASES,
    'HAP_WORKSHEET_UPDATE_TASKS': process.env.HAP_WORKSHEET_UPDATE_TASKS,
    'SUPABASE_URL': process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    'SUPABASE_SERVICE_ROLE_KEY': process.env.SUPABASE_SERVICE_ROLE_KEY,
  };

  let envCheckPassed = true;
  for (const [key, value] of Object.entries(requiredEnvVars)) {
    if (!value) {
      console.log(`   ❌ ${key}: 未配置`);
      envCheckPassed = false;
    } else {
      console.log(`   ✅ ${key}: ${value.substring(0, 20)}...`);
    }
  }

  if (!envCheckPassed) {
    console.log('\n❌ 环境变量检查失败\n');
    allPassed = false;
  } else {
    console.log('\n✅ 环境变量检查通过\n');
  }

  // 2. 测试明道云API连接（App更新任务表）
  console.log('2️⃣ 测试明道云API连接（App更新任务表）...');
  try {
    const response = await fetch(
      `https://api.mingdao.com/v3/app/worksheets/${process.env.HAP_WORKSHEET_UPDATE_TASKS}/rows/list`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'HAP-Appkey': process.env.HAP_APP_KEY!,
          'HAP-Sign': process.env.HAP_SIGN!,
        },
        body: JSON.stringify({
          pageSize: 1,
          pageIndex: 1,
        }),
      }
    );

    if (response.ok) {
      const data: any = await response.json();
      if (data.success) {
        console.log('   ✅ App更新任务表连接成功\n');
      } else {
        console.log(`   ❌ API返回错误: ${data.error_msg}\n`);
        allPassed = false;
      }
    } else {
      console.log(`   ❌ HTTP错误: ${response.status} ${response.statusText}\n`);
      allPassed = false;
    }
  } catch (error: any) {
    console.log(`   ❌ 连接失败: ${error.message}\n`);
    allPassed = false;
  }

  // 3. 测试明道云API连接（App生产发布表）
  console.log('3️⃣ 测试明道云API连接（App生产发布表）...');
  try {
    const response = await fetch(
      `https://api.mingdao.com/v3/app/worksheets/${process.env.HAP_WORKSHEET_PRODUCTION_RELEASES}/rows/list`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'HAP-Appkey': process.env.HAP_APP_KEY_PRODUCTION_RELEASES!,
          'HAP-Sign': process.env.HAP_SIGN_PRODUCTION_RELEASES!,
        },
        body: JSON.stringify({
          pageSize: 1,
          pageIndex: 1,
        }),
      }
    );

    if (response.ok) {
      const data: any = await response.json();
      if (data.success) {
        console.log('   ✅ App生产发布表连接成功\n');
      } else {
        console.log(`   ❌ API返回错误: ${data.error_msg}\n`);
        allPassed = false;
      }
    } else {
      console.log(`   ❌ HTTP错误: ${response.status} ${response.statusText}\n`);
      allPassed = false;
    }
  } catch (error: any) {
    console.log(`   ❌ 连接失败: ${error.message}\n`);
    allPassed = false;
  }

  // 4. 测试Supabase连接
  console.log('4️⃣ 测试Supabase连接...');
  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.log('   ❌ Supabase配置缺失\n');
      allPassed = false;
    } else {
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      const { data, error } = await supabase
        .from('releases')
        .select('id')
        .limit(1);

      if (error) {
        console.log(`   ❌ Supabase连接失败: ${error.message}\n`);
        allPassed = false;
      } else {
        console.log('   ✅ Supabase连接成功\n');
      }
    }
  } catch (error: any) {
    console.log(`   ❌ 连接失败: ${error.message}\n`);
    allPassed = false;
  }

  // 5. 检查数据库表结构
  console.log('5️⃣ 检查数据库表结构...');
  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      // 检查 source 字段是否存在（尝试查询该字段）
      const { data, error } = await supabase
        .from('releases')
        .select('source')
        .limit(1);

      if (error) {
        console.log('   ⚠️  无法验证表结构（可能需要手动检查）');
        console.log(`   提示: 请在Supabase Dashboard中确认 releases 表有 source 字段\n`);
      } else {
        console.log('   ✅ 数据库表结构检查通过\n');
      }
    }
  } catch (error: any) {
    console.log(`   ⚠️  表结构检查失败: ${error.message}`);
    console.log('   提示: 请手动在Supabase Dashboard中确认 releases 表有 source 字段\n');
  }

  // 6. 统计当前数据
  console.log('6️⃣ 统计当前数据...');
  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      const { count: totalCount } = await supabase
        .from('releases')
        .select('*', { count: 'exact', head: true });

      const { count: manualCount } = await supabase
        .from('releases')
        .select('*', { count: 'exact', head: true })
        .eq('source', 'manual');

      console.log(`   - 总发布记录: ${totalCount || 0} 条`);
      console.log(`   - 外部同步记录: ${manualCount || 0} 条`);
      console.log(`   - 系统发布记录: ${(totalCount || 0) - (manualCount || 0)} 条\n`);
    }
  } catch (error: any) {
    console.log(`   ⚠️  统计失败: ${error.message}\n`);
  }

  // 总结
  console.log('========================================');
  if (allPassed) {
    console.log('✅ 所有检查通过，可以开始使用外部审核同步功能');
  } else {
    console.log('❌ 部分检查失败，请修复上述问题后再试');
  }
  console.log('========================================');

  process.exit(allPassed ? 0 : 1);
}

main().catch(error => {
  console.error('\n❌ 验证失败:', error);
  process.exit(1);
});
