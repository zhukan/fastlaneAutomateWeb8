#!/usr/bin/env node
/**
 * 测试增量同步功能
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载环境变量
dotenv.config({ path: join(__dirname, 'fastlane-agent/.env') });
dotenv.config({ path: join(__dirname, 'fastlane-ui/.env.local') });

const HAP_APP_KEY = process.env.HAP_APP_KEY;
const HAP_SIGN = process.env.HAP_SIGN;
const WORKSHEET_ID = '6436b372ca1784f12b3a4a91';

async function testIncrementalSync() {
  console.log('🧪 测试增量同步功能\n');
  console.log('='.repeat(80) + '\n');
  
  // 测试 1: 测试明道云 filter（最近 5 天）
  console.log('📝 测试 1: 明道云 filter（最近 5 天）\n');
  
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 5);
  const startDateStr = startDate.toISOString().replace('T', ' ').substring(0, 19);
  
  console.log(`时间范围: ${startDateStr} 至今\n`);
  
  const url = `https://api.mingdao.com/v3/app/worksheets/${WORKSHEET_ID}/rows/list`;
  const requestBody = {
    pageSize: 50,
    pageIndex: 1,
    filter: {
      type: 'group',
      logic: 'OR',
      children: [
        {
          type: 'condition',
          field: '_createdAt',
          operator: 'gte',
          value: startDateStr,
        },
        {
          type: 'condition',
          field: '_updatedAt',
          operator: 'gte',
          value: startDateStr,
        },
      ],
    },
  };
  
  console.log('请求体:');
  console.log(JSON.stringify(requestBody, null, 2));
  console.log('');
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'HAP-Appkey': HAP_APP_KEY,
        'HAP-Sign': HAP_SIGN,
      },
      body: JSON.stringify(requestBody),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API 请求失败:', errorText);
      return;
    }
    
    const hapData = await response.json();
    const records = hapData.data?.rows || hapData.rows || [];
    
    console.log(`✅ 获取到 ${records.length} 条记录\n`);
    
    if (records.length > 0) {
      console.log('前 5 条记录:');
      records.slice(0, 5).forEach((record, i) => {
        console.log(`${i + 1}. ${record.mbbmc || '未命名'} (${record.appid || '无'})`);
        console.log(`   创建时间: ${record._createdAt}`);
        console.log(`   更新时间: ${record._updatedAt}`);
      });
    }
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  }
  
  console.log('\n' + '='.repeat(80) + '\n');
  
  // 测试 2: 测试 upsert 逻辑
  console.log('📝 测试 2: Supabase upsert 逻辑\n');
  
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ 缺少 Supabase 环境变量');
    return;
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  // 查询一条已存在的记录
  const { data: existingRecord } = await supabase
    .from('target_apps')
    .select('*')
    .limit(1)
    .single();
  
  if (!existingRecord) {
    console.log('⚠️  数据库中没有记录,跳过 upsert 测试');
    return;
  }
  
  console.log(`测试记录: ${existingRecord.app_name} (${existingRecord.hap_row_id})`);
  console.log(`当前 remark: ${existingRecord.remark || '(空)'}\n`);
  
  // 测试 upsert 更新
  const testRemark = `测试更新 ${new Date().toISOString()}`;
  const { data: upsertData, error: upsertError } = await supabase
    .from('target_apps')
    .upsert([{
      hap_row_id: existingRecord.hap_row_id,
      app_name: existingRecord.app_name,
      remark: testRemark,
      synced_from_hap_at: new Date().toISOString(),
    }], {
      onConflict: 'hap_row_id',
      ignoreDuplicates: false,
    });
  
  if (upsertError) {
    console.error('❌ upsert 失败:', upsertError.message);
    return;
  }
  
  console.log('✅ upsert 成功\n');
  
  // 验证更新
  const { data: updatedRecord } = await supabase
    .from('target_apps')
    .select('remark')
    .eq('hap_row_id', existingRecord.hap_row_id)
    .single();
  
  if (updatedRecord && updatedRecord.remark === testRemark) {
    console.log('✅ 验证成功: 记录已更新');
    console.log(`   新的 remark: ${updatedRecord.remark}`);
  } else {
    console.log('❌ 验证失败: 记录未更新');
  }
  
  // 恢复原值
  await supabase
    .from('target_apps')
    .update({ remark: existingRecord.remark })
    .eq('hap_row_id', existingRecord.hap_row_id);
  
  console.log('✅ 已恢复原值\n');
  
  console.log('='.repeat(80) + '\n');
  
  // 测试 3: 测试新增记录
  console.log('📝 测试 3: 测试插入新记录\n');
  
  const testNewRecord = {
    hap_row_id: `test-${Date.now()}`,
    app_name: '测试应用',
    app_id: '9999999999',
    is_monitoring: true,
    synced_from_hap_at: new Date().toISOString(),
  };
  
  const { error: insertError } = await supabase
    .from('target_apps')
    .upsert([testNewRecord], {
      onConflict: 'hap_row_id',
      ignoreDuplicates: false,
    });
  
  if (insertError) {
    console.error('❌ 插入失败:', insertError.message);
  } else {
    console.log('✅ 插入成功');
    
    // 删除测试记录
    await supabase
      .from('target_apps')
      .delete()
      .eq('hap_row_id', testNewRecord.hap_row_id);
    
    console.log('✅ 测试记录已清理');
  }
}

testIncrementalSync()
  .then(() => {
    console.log('\n✅ 所有测试完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ 测试失败:', error);
    console.error(error.stack);
    process.exit(1);
  });
