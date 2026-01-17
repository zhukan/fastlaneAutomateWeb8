/**
 * 检查 target_apps 表的约束和索引
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '../.env') });

async function checkConstraints() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ 缺少 Supabase 环境变量');
    process.exit(1);
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 检查 target_apps 表约束');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  
  // 检查表约束
  const { data: constraints, error: constraintsError } = await supabase.rpc('exec_sql', {
    query: `
      SELECT 
        conname as constraint_name,
        contype as constraint_type,
        a.attname as column_name
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      JOIN pg_class cl ON cl.oid = c.conrelid
      LEFT JOIN pg_attribute a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
      WHERE cl.relname = 'target_apps'
      AND n.nspname = 'public'
      ORDER BY conname;
    `
  });
  
  if (constraintsError) {
    // 如果 RPC 不存在，使用直接查询
    console.log('尝试直接查询约束信息...');
    
    const { data: apps, error } = await supabase
      .from('target_apps')
      .select('app_id')
      .limit(5);
    
    if (error) {
      console.error('❌ 查询失败:', error.message);
      
      // 检查是否是唯一约束错误
      if (error.message.includes('target_apps_app_id_key')) {
        console.log('');
        console.log('⚠️  发现问题：存在 app_id 唯一约束');
        console.log('');
        console.log('💡 解决方案：');
        console.log('   需要移除 app_id 的唯一约束，因为明道云中可能有重复的 app_id');
        console.log('');
        console.log('   执行以下 SQL:');
        console.log('   ALTER TABLE target_apps DROP CONSTRAINT IF EXISTS target_apps_app_id_key;');
      }
      process.exit(1);
    }
    
    console.log('✅ 表查询成功，示例数据:');
    console.log(apps);
  } else {
    console.log('约束列表:');
    console.log(constraints);
  }
  
  // 检查索引
  console.log('');
  console.log('检查索引...');
  
  const { data: appIds, error: appIdsError } = await supabase
    .from('target_apps')
    .select('app_id, hap_row_id')
    .not('app_id', 'is', null);
  
  if (appIdsError) {
    console.error('❌ 查询失败:', appIdsError.message);
    process.exit(1);
  }
  
  // 统计重复的 app_id
  const appIdCount = new Map<string, number>();
  appIds?.forEach((row: any) => {
    const count = appIdCount.get(row.app_id) || 0;
    appIdCount.set(row.app_id, count + 1);
  });
  
  const duplicates = Array.from(appIdCount.entries()).filter(([_, count]) => count > 1);
  
  console.log('');
  console.log(`📊 统计结果:`);
  console.log(`   总记录数: ${appIds?.length || 0}`);
  console.log(`   唯一 app_id: ${appIdCount.size}`);
  console.log(`   重复 app_id: ${duplicates.length}`);
  
  if (duplicates.length > 0) {
    console.log('');
    console.log('⚠️  发现重复的 app_id:');
    duplicates.slice(0, 5).forEach(([appId, count]) => {
      console.log(`   ${appId}: ${count} 条记录`);
    });
    
    if (duplicates.length > 5) {
      console.log(`   ... 还有 ${duplicates.length - 5} 个重复项`);
    }
  }
  
  console.log('');
}

checkConstraints().catch(console.error);
