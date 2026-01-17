import * as dotenv from 'dotenv';
dotenv.config();

async function checkAccounts() {
  const appKey = process.env.HAP_APP_KEY;
  const sign = process.env.HAP_SIGN;
  const accountsWorksheet = process.env.HAP_WORKSHEET_ACCOUNTS;

  console.log('========================================');
  console.log('检查苹果开发者账号表');
  console.log('========================================\n');

  try {
    const url = `https://api.mingdao.com/v3/app/worksheets/${accountsWorksheet}/rows/list`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'HAP-Appkey': appKey!,
        'HAP-Sign': sign!,
      },
      body: JSON.stringify({
        pageSize: 20,
        pageIndex: 1,
        useFieldIdAsKey: true,
      }),
    });

    const data: any = await response.json();
    
    if (!data.success) {
      console.error('❌ 查询失败:', data.error_msg);
      return;
    }

    const rows = data.data?.rows || [];
    console.log(`✅ 找到 ${rows.length} 个开发者账号\n`);

    rows.forEach((row: any, i: number) => {
      const email = row['640adea9c04c8d453ff1ce53']; // kfzzh
      const teamId = row['640adea9c04c8d453ff1ce54']; // team_id
      console.log(`${i + 1}. ${email} (Team: ${teamId})`);
    });

    console.log('\n========================================');
    console.log('需要查找的邮箱:');
    console.log('========================================');
    console.log('1. tr65sa@sina.com');
    console.log('2. wylohybdkg@163.com');
    console.log('3. ccynxjdiwwo@163.com');

  } catch (error: any) {
    console.error('❌ 执行失败:', error.message);
  }
}

checkAccounts();
