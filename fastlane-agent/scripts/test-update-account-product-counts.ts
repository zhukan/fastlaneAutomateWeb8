/**
 * 测试账号产品数量统计功能
 * 
 * 验证新的 updateAccountProductCounts 方法是否正确统计所有状态的产品
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '../.env') });

// 导入服务类（需要编译后才能使用）
import { AppRemovalInvestigationService } from '../dist/app-removal-investigation-service';
import { HapClient } from '../dist/hap-client';
import { SupabaseClient } from '../dist/supabase-client';

/**
 * 主测试函数
 */
async function testUpdateAccountProductCounts() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 测试：账号产品数量统计功能');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // 初始化依赖
    console.log('[测试] 初始化 HapClient...');
    const hapClient = new HapClient({
      appKey: process.env.HAP_APP_KEY!,
      sign: process.env.HAP_SIGN!,
      worksheetProducts: process.env.HAP_WORKSHEET_PRODUCTS!,
      worksheetAccounts: process.env.HAP_WORKSHEET_ACCOUNTS!,
    });
    
    console.log('[测试] 初始化 SupabaseClient...');
    const supabaseClient = new SupabaseClient();
    
    console.log('[测试] 初始化服务...');
    const service = new AppRemovalInvestigationService(hapClient, supabaseClient);
    
    // 调用私有方法（通过类型断言）
    console.log('[测试] 调用 updateAccountProductCounts 方法...\n');
    await (service as any).updateAccountProductCounts();
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ 测试完成！');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log('下一步：');
    console.log('1. 查看上面的日志，确认统计数量是否正确');
    console.log('2. 在数据库中验证 tmqjwjwjsjsj@163.com 账号的 account_product_count 字段');
    console.log('3. 应该从 0 更新为 3');
    
  } catch (error: any) {
    console.error('\n❌ 测试失败:', error.message);
    console.error('错误堆栈:', error.stack);
    process.exit(1);
  }
}

// 运行测试
testUpdateAccountProductCounts()
  .then(() => {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ 未捕获的错误:', error);
    process.exit(1);
  });

