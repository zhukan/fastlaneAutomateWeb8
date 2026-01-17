import * as dotenv from 'dotenv';
dotenv.config();

async function checkProductionData() {
  const appKey = process.env.HAP_APP_KEY_PRODUCTION_RELEASES;
  const sign = process.env.HAP_SIGN_PRODUCTION_RELEASES;
  const worksheet = process.env.HAP_WORKSHEET_PRODUCTION_RELEASES;

  console.log('========================================');
  console.log('检查App生产发布表数据');
  console.log('========================================\n');

  try {
    const url = `https://api.mingdao.com/v3/app/worksheets/${worksheet}/rows/list`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'HAP-Appkey': appKey!,
        'HAP-Sign': sign!,
      },
      body: JSON.stringify({
        pageSize: 5,
        pageIndex: 1,
        useFieldIdAsKey: true,
        filter: {
          type: 'group',
          logic: 'AND',
          children: [{
            type: 'condition',
            field: '64b168be624fef0d46c11054', // 状态字段
            operator: 'eq',
            value: ['37f6baa7-3045-49f7-b28a-fd340ced3ba8'] // 正式包审核中
          }]
        }
      }),
    });

    const data: any = await response.json();
    
    if (!data.success) {
      console.error('❌ 查询失败:', data.error_msg);
      return;
    }

    const rows = data.data?.rows || [];
    console.log(`✅ 找到 ${rows.length} 条"正式包审核中"记录\n`);

    rows.forEach((row: any, i: number) => {
      console.log(`记录 ${i + 1}:`);
      console.log('  App名称:', row['64b168be624fef0d46c11058'] || '(空)');
      console.log('  Bundle ID:', row['64b168be624fef0d46c1105b'] || '(空)');
      console.log('  版本号:', row['64b168be624fef0d46c11068'] || '(空)');
      
      const developerAccount = row['64b168be624fef0d46c1105d'];
      console.log('  开发者账号字段:');
      console.log('    类型:', typeof developerAccount);
      console.log('    值:', JSON.stringify(developerAccount, null, 2));
      
      if (Array.isArray(developerAccount) && developerAccount.length > 0) {
        console.log('    ✅ 有关联账号');
        console.log('    账号ID:', developerAccount[0].sid || developerAccount[0]);
      } else {
        console.log('    ❌ 无关联账号');
      }
      console.log();
    });

  } catch (error: any) {
    console.error('❌ 执行失败:', error.message);
  }
}

checkProductionData();
