/**
 * 验证账号产品数量是否正确更新
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '../.env') });

import { SupabaseClient } from '../dist/supabase-client';

async function verifyAccountProductCount() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 验证账号产品数量');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const testEmail = 'tmqjwjwjsjsj@163.com';

  try {
    const supabaseClient = new SupabaseClient();
    
    // 查询该账号
    const { data, error } = await (supabaseClient as any).client
      .from('ri_developer_accounts')
      .select('*')
      .eq('account_email', testEmail)
      .single();
    
    if (error) {
      throw new Error(`查询失败: ${error.message}`);
    }
    
    if (!data) {
      console.log(`❌ 未找到账号: ${testEmail}`);
      return;
    }
    
    console.log(`✅ 找到账号记录\n`);
    console.log(`账号邮箱: ${data.account_email}`);
    console.log(`HAP 账号ID: ${data.hap_account_id}`);
    console.log(`账号状态: ${data.account_status}`);
    console.log(`账号上的产品数量: ${data.account_product_count}`);
    console.log(`注册地: ${data.account_region}`);
    console.log(`账号来源: ${data.account_source}`);
    console.log(`同步时间: ${data.synced_from_hap_at}`);
    console.log(`更新时间: ${data.updated_at}`);
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ 验证结果');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    if (data.account_product_count === 3) {
      console.log('✅ 产品数量正确！该账号有 3 个产品（包含所有状态）');
    } else if (data.account_product_count === 0) {
      console.log('❌ 产品数量为 0，可能未正确更新');
      console.log('   请重新运行同步或 updateAccountProductCounts 方法');
    } else {
      console.log(`⚠️  产品数量为 ${data.account_product_count}，与预期的 3 不符`);
    }
    
  } catch (error: any) {
    console.error('\n❌ 验证失败:', error.message);
    process.exit(1);
  }
}

verifyAccountProductCount()
  .then(() => {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ 未捕获的错误:', error);
    process.exit(1);
  });

