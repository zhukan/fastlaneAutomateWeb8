/**
 * 测试：统计指定账号实际关联的产品数量
 * 
 * 从"账号上的产品"表中统计关联到 tmqjwjwjsjsj@163.com 账号的产品数量
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '../.env') });

// ==================== 明道云字段 ID ====================
const WORKSHEETS = {
  PRODUCTS: '643418197f0301fb51750f00',    // 账号上的产品表
  ACCOUNTS: '640adea9c04c8d453ff1ce52',    // 苹果开发者账号表
};

const FIELD_IDS = {
  // 账号上的产品表
  PRODUCTS: {
    BUNDLE_ID: '64b3a82fa75368cd24c99d8d',
    APP_NAME: '64341ac46d6df8983a7f7af3',
    ACCOUNT_RELATION: '64341940fa601169896433f6',  // 关联到苹果开发者账号
    APP_STATUS: '64366ef856462b8747391a08',
  },
  // 苹果开发者账号表
  ACCOUNTS: {
    EMAIL: '640adea9c04c8d453ff1ce53',
  },
};

// App 状态值（排除"APP被下架"）
const APP_STATUS_REMOVED_KEY = 'e766bfba-d23d-42a3-a9b8-b01139344bde';

/**
 * 从明道云获取数据
 */
async function fetchFromHap(
  worksheetId: string,
  filter: any
): Promise<any[]> {
  const appKey = process.env.HAP_APP_KEY;
  const sign = process.env.HAP_SIGN;

  if (!appKey || !sign) {
    throw new Error('❌ 缺少 HAP_APP_KEY 或 HAP_SIGN 环境变量');
  }

  const allRows: any[] = [];
  let pageIndex = 1;
  const pageSize = 100;
  let hasMore = true;

  while (hasMore) {
    const url = `https://api.mingdao.com/v3/app/worksheets/${worksheetId}/rows/list`;
    
    const body = {
      pageSize,
      pageIndex,
      useFieldIdAsKey: true,
      filter,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'HAP-Appkey': appKey,
        'HAP-Sign': sign,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data: any = await response.json();
    
    if (!data.success) {
      throw new Error(data.error_msg || `API Error: ${data.error_code}`);
    }

    const rows = data.data?.rows || [];
    allRows.push(...rows);

    if (rows.length < pageSize) {
      hasMore = false;
    } else {
      pageIndex++;
    }
  }

  return allRows;
}

/**
 * 主测试函数
 */
async function testCountProductsByAccount() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 测试：统计账号实际关联的产品数量');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const testEmail = 'tmqjwjwjsjsj@163.com';

  try {
    // 1. 先找到该账号的 rowid
    console.log(`[步骤1] 查询账号: ${testEmail}`);
    
    const accounts = await fetchFromHap(WORKSHEETS.ACCOUNTS, {
      type: 'group',
      logic: 'AND',
      children: [
        {
          type: 'condition',
          field: FIELD_IDS.ACCOUNTS.EMAIL,
          operator: 'eq',
          value: testEmail,
        },
      ],
    });

    if (accounts.length === 0) {
      throw new Error(`❌ 未找到账号: ${testEmail}`);
    }

    const accountRowId = accounts[0].rowid;
    console.log(`✅ 找到账号，rowid: ${accountRowId}\n`);

    // 2. 查询"账号上的产品"表中关联到该账号的所有产品（包含所有状态）
    console.log(`[步骤2] 查询该账号关联的所有产品（包含所有状态）`);
    
    const allProducts = await fetchFromHap(WORKSHEETS.PRODUCTS, {
      type: 'group',
      logic: 'AND',
      children: [
        {
          type: 'condition',
          field: FIELD_IDS.PRODUCTS.ACCOUNT_RELATION,
          operator: 'eq',
          value: [accountRowId],  // 关联字段使用数组
        },
      ],
    });

    console.log(`✅ 找到 ${allProducts.length} 个产品（包含所有状态）\n`);
    
    // 3. 再查询排除"APP被下架"的产品
    console.log(`[步骤3] 查询该账号关联的产品（排除"APP被下架"状态）`);
    
    const products = await fetchFromHap(WORKSHEETS.PRODUCTS, {
      type: 'group',
      logic: 'AND',
      children: [
        {
          type: 'condition',
          field: FIELD_IDS.PRODUCTS.ACCOUNT_RELATION,
          operator: 'eq',
          value: [accountRowId],
        },
        {
          type: 'condition',
          field: FIELD_IDS.PRODUCTS.APP_STATUS,
          operator: 'ne',
          value: [APP_STATUS_REMOVED_KEY],  // 排除"APP被下架"
        },
      ],
    });

    console.log(`✅ 找到 ${products.length} 个产品（排除已下架）\n`);

    // 4. 显示产品列表（所有状态）
    if (allProducts.length > 0) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📋 产品列表（所有状态）');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      allProducts.forEach((product, index) => {
        const bundleId = product[FIELD_IDS.PRODUCTS.BUNDLE_ID];
        const appName = product[FIELD_IDS.PRODUCTS.APP_NAME];
        const status = product[FIELD_IDS.PRODUCTS.APP_STATUS];
        
        console.log(`${index + 1}. ${appName || '(无名称)'}`);
        console.log(`   Bundle ID: ${bundleId}`);
        console.log(`   状态: ${JSON.stringify(status)}`);
        console.log('');
      });
    }

    // 5. 结论
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ 测试结果');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log(`账号: ${testEmail}`);
    console.log(`账号 rowid: ${accountRowId}`);
    console.log(`实际关联的产品数量（所有状态）: ${allProducts.length} 个`);
    console.log(`实际关联的产品数量（排除已下架）: ${products.length} 个`);
    
    // 6. 对比明道云字段值
    const accountProductCountField = accounts[0]['657eb6aa8d3800f9a1b01c13'];
    console.log(`明道云"账号上的产品"字段值: ${accountProductCountField}`);
    
    if (parseInt(accountProductCountField) !== allProducts.length) {
      console.log('\n⚠️  警告：字段值与实际统计（所有状态）不一致！');
      console.log(`   明道云字段: ${accountProductCountField}`);
      console.log(`   实际统计: ${allProducts.length}`);
      console.log('   明道云中的"账号上的产品"字段可能没有正确更新。');
    } else {
      console.log('\n✅ 字段值与实际统计（所有状态）一致');
    }

  } catch (error: any) {
    console.error('\n❌ 测试失败:', error.message);
    process.exit(1);
  }
}

// 运行测试
testCountProductsByAccount()
  .then(() => {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ 未捕获的错误:', error);
    process.exit(1);
  });

