/**
 * 检查 target_apps 表的详细架构，包括所有约束
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '../.env') });

async function checkSchema() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ 缺少 Supabase 环境变量');
    process.exit(1);
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 target_apps 表架构检查');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  
  // 使用 SQL 查询约束信息
  const { data: constraints, error: constraintsError } = await supabase
    .from('pg_constraint')
    .select('*')
    .limit(1);
  
  if (constraintsError) {
    console.log('⚠️  无法直接查询系统表，尝试其他方法...');
    console.log('');
    
    // 尝试插入重复的 app_id 来测试是否有唯一约束
    console.log('📋 测试：尝试插入重复的 app_id');
    console.log('');
    
    // 先查询一个存在的 app_id
    const { data: existingApps, error: selectError } = await supabase
      .from('target_apps')
      .select('app_id, hap_row_id, app_name')
      .not('app_id', 'is', null)
      .limit(1);
    
    if (selectError || !existingApps || existingApps.length === 0) {
      console.error('❌ 无法查询现有数据');
      process.exit(1);
    }
    
    const testAppId = existingApps[0].app_id;
    console.log(`   使用测试 app_id: ${testAppId}`);
    console.log(`   来自应用: ${existingApps[0].app_name}`);
    console.log('');
    
    // 尝试插入一条新记录，使用相同的 app_id 但不同的 hap_row_id
    const testRecord = {
      hap_row_id: `test-${Date.now()}`,
      app_name: '测试应用',
      app_id: testAppId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    
    const { data: insertData, error: insertError } = await supabase
      .from('target_apps')
      .insert([testRecord])
      .select();
    
    if (insertError) {
      console.log('❌ 插入失败:');
      console.log(`   错误代码: ${insertError.code}`);
      console.log(`   错误信息: ${insertError.message}`);
      console.log('');
      
      if (insertError.message.includes('target_apps_app_id_key') || 
          insertError.message.includes('duplicate key') ||
          insertError.code === '23505') {
        console.log('🔍 结论：');
        console.log('   ✅ 确认存在 app_id 唯一约束');
        console.log('   约束名称: target_apps_app_id_key');
        console.log('');
        console.log('💡 这就是问题所在！');
        console.log('   - 数据库中 app_id 字段有唯一约束');
        console.log('   - 明道云数据中存在多条记录使用相同的 app_id');
        console.log('   - 导致同步时插入失败');
        console.log('');
      }
    } else {
      console.log('✅ 插入成功（意外）');
      console.log('   这意味着 app_id 没有唯一约束');
      console.log('');
      
      // 清理测试数据
      await supabase
        .from('target_apps')
        .delete()
        .eq('hap_row_id', testRecord.hap_row_id);
      
      console.log('   测试数据已清理');
    }
  }
  
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 数据统计');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  
  // 统计 app_id 重复情况
  const { data: allApps } = await supabase
    .from('target_apps')
    .select('app_id')
    .not('app_id', 'is', null);
  
  const appIdCount = new Map<string, number>();
  allApps?.forEach((row: any) => {
    const count = appIdCount.get(row.app_id) || 0;
    appIdCount.set(row.app_id, count + 1);
  });
  
  const duplicates = Array.from(appIdCount.entries()).filter(([_, count]) => count > 1);
  
  console.log(`   数据库中的记录数: ${allApps?.length || 0}`);
  console.log(`   唯一的 app_id 数: ${appIdCount.size}`);
  console.log(`   重复的 app_id 数: ${duplicates.length}`);
  console.log('');
  
  if (duplicates.length > 0) {
    console.log('⚠️  发现重复的 app_id:');
    duplicates.slice(0, 5).forEach(([appId, count]) => {
      console.log(`   ${appId}: ${count} 条记录`);
    });
    if (duplicates.length > 5) {
      console.log(`   ... 还有 ${duplicates.length - 5} 个`);
    }
    console.log('');
    console.log('💡 注意: 如果 app_id 有唯一约束，这是不正常的！');
  }
  
  console.log('');
}

checkSchema().catch(console.error);
