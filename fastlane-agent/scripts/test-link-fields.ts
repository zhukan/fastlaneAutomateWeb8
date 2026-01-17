/**
 * 测试脚本：验证明道云中链接字段的数据
 * 
 * 用途：检查明道云"账号上的产品"表中，下架App是否真的有这三个链接字段的数据
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '../../.env') });

const WORKSHEET_PRODUCTS = '643418197f0301fb51750f00';
const APP_STATUS_FIELD = '64366ef856462b8747391a08';
const APP_REMOVED_KEY = 'e766bfba-d23d-42a3-a9b8-b01139344bde';

const FIELD_IDS = {
  APP_NAME: '64341ac46d6df8983a7f7af3',
  BUNDLE_ID: '64b3a82fa75368cd24c99d8d',
  KEYWORD_SEARCH_URL: '650b048db57c0312e55e7a4c',
  TARGET_PACKAGE_URL: '664c223a0b1a039a5fb30000',
  QIMAI_URL: '65388cadea09c5df35ec81c6',
};

async function testLinkFields() {
  try {
    console.log('🔍 测试明道云链接字段...\n');
    
    // 使用明道云 V3 API 查询下架App
    const url = `https://api.mingdao.com/v3/app/worksheets/${WORKSHEET_PRODUCTS}/rows/list`;
    
    const body = {
      pageSize: 10,  // 只取前10条测试
      pageIndex: 1,
      useFieldIdAsKey: true,  // 关键：使用字段ID作为key
      filter: {
        type: 'group',
        logic: 'AND',
        children: [
          {
            type: 'condition',
            field: APP_STATUS_FIELD,
            operator: 'eq',
            value: [APP_REMOVED_KEY],
          },
        ],
      },
    };
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'HAP-Appkey': process.env.HAP_APP_KEY!,
        'HAP-Sign': process.env.HAP_SIGN!,
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
    console.log(`✅ 获取到 ${rows.length} 条下架App记录\n`);
    
    if (rows.length === 0) {
      console.log('⚠️  没有找到下架App记录');
      return;
    }
    
    // 分析每条记录的链接字段
    let hasKeywordUrl = 0;
    let hasTargetUrl = 0;
    let hasQimaiUrl = 0;
    
    console.log('📊 字段分析：\n');
    console.log('序号 | App名称 | Bundle ID | 关键词链接 | 目标包链接 | 七麦链接');
    console.log('-'.repeat(100));
    
    rows.forEach((record: any, index: number) => {
      const appName = record[FIELD_IDS.APP_NAME] || '(无)';
      const bundleId = record[FIELD_IDS.BUNDLE_ID] || '(无)';
      const keywordUrl = record[FIELD_IDS.KEYWORD_SEARCH_URL];
      const targetUrl = record[FIELD_IDS.TARGET_PACKAGE_URL];
      const qimaiUrl = record[FIELD_IDS.QIMAI_URL];
      
      if (keywordUrl) hasKeywordUrl++;
      if (targetUrl) hasTargetUrl++;
      if (qimaiUrl) hasQimaiUrl++;
      
      console.log(
        `${index + 1} | ${appName.substring(0, 15).padEnd(15)} | ${bundleId.substring(0, 20).padEnd(20)} | ${keywordUrl ? '✅' : '❌'} | ${targetUrl ? '✅' : '❌'} | ${qimaiUrl ? '✅' : '❌'}`
      );
      
      // 显示第一条记录的详细信息
      if (index === 0) {
        console.log('\n📝 第一条记录详情：');
        console.log('  App名称:', appName);
        console.log('  Bundle ID:', bundleId);
        console.log('  关键词查询链接:', keywordUrl || '(空)');
        console.log('  目标包链接:', targetUrl || '(空)');
        console.log('  七麦链接:', qimaiUrl || '(空)');
        console.log('');
      }
    });
    
    console.log('\n📈 统计结果：');
    console.log(`  总记录数: ${rows.length}`);
    console.log(`  有关键词链接: ${hasKeywordUrl} (${((hasKeywordUrl / rows.length) * 100).toFixed(1)}%)`);
    console.log(`  有目标包链接: ${hasTargetUrl} (${((hasTargetUrl / rows.length) * 100).toFixed(1)}%)`);
    console.log(`  有七麦链接: ${hasQimaiUrl} (${((hasQimaiUrl / rows.length) * 100).toFixed(1)}%)`);
    
    console.log('\n💡 结论：');
    if (hasKeywordUrl === 0 && hasTargetUrl === 0 && hasQimaiUrl === 0) {
      console.log('  ⚠️  明道云中这些字段都是空的！');
      console.log('  原因可能是：');
      console.log('    1. 这些字段在明道云中确实没有数据');
      console.log('    2. 字段ID可能不正确');
      console.log('    3. 这些字段可能只对特定状态的App有数据');
    } else {
      console.log('  ✅ 明道云中有部分数据，同步逻辑应该是正常的');
      console.log('  如果数据库中仍然是null，可能需要：');
      console.log('    1. 检查后端服务是否重启');
      console.log('    2. 重新执行同步');
    }
    
  } catch (error: any) {
    console.error('❌ 测试失败:', error.message);
    console.error('错误详情:', error);
  }
}

// 执行测试
testLinkFields();

