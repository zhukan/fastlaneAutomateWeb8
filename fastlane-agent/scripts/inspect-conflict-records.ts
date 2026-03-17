/**
 * 拉取冲突的两条明道云记录，完整对比所有字段
 * 运行方式：npx ts-node scripts/inspect-conflict-records.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const HAP_WORKSHEET_ID = '6436b372ca1784f12b3a4a91';

// 冲突的两条记录
const HAP_ROW_ID_NEW = '6fd6265c-a0bc-4564-85b5-7206a2307915'; // 明道云新记录（不在 Supabase）
const HAP_ROW_ID_OLD = '3c4b8149-1a70-41fa-bc2b-7f237825075a'; // Supabase 已有记录

async function fetchRecord(rowId: string) {
  // 用 list 接口 + rowid 过滤来获取单条记录
  const res = await fetch(`https://api.mingdao.com/v3/app/worksheets/${HAP_WORKSHEET_ID}/rows/list`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'HAP-Appkey': process.env.HAP_APP_KEY || '',
      'HAP-Sign': process.env.HAP_SIGN || '',
    },
    body: JSON.stringify({
      pageSize: 1,
      pageIndex: 1,
      filter: {
        type: 'group',
        logic: 'AND',
        children: [
          {
            type: 'condition',
            field: 'rowid',
            operator: 'eq',
            value: rowId,
          },
        ],
      },
    }),
  });

  if (!res.ok) {
    console.error(`❌ 获取 ${rowId} 失败: HTTP ${res.status}`);
    return null;
  }
  const data: any = await res.json();
  const rows = data?.data?.rows ?? data?.rows ?? [];
  if (rows.length === 0) {
    console.warn(`⚠️  rowid=${rowId} 在明道云中查不到（可能已被删除）`);
    return null;
  }
  return rows[0];
}

function printRecord(label: string, data: any) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`📄 ${label}`);
  console.log('═'.repeat(60));
  if (!data) {
    console.log('  （未找到记录，可能已被删除）');
    return;
  }
  // 打印所有字段
  for (const [key, val] of Object.entries(data)) {
    if (val === null || val === undefined || val === '') continue;
    const valStr = typeof val === 'object' ? JSON.stringify(val) : String(val);
    console.log(`  ${key.padEnd(40)} = ${valStr}`);
  }
}

async function main() {
  console.log('🔍 拉取两条冲突记录的完整字段...');
  console.log(`  新记录 hap_row_id: ${HAP_ROW_ID_NEW}`);
  console.log(`  旧记录 hap_row_id: ${HAP_ROW_ID_OLD}`);

  const [newRecord, oldRecord] = await Promise.all([
    fetchRecord(HAP_ROW_ID_NEW),
    fetchRecord(HAP_ROW_ID_OLD),
  ]);

  printRecord(`明道云新记录（Supabase 里没有，触发冲突）\n  hap_row_id: ${HAP_ROW_ID_NEW}`, newRecord);
  printRecord(`明道云旧记录（Supabase 里已有）\n  hap_row_id: ${HAP_ROW_ID_OLD}`, oldRecord);

  // 关键字段对比
  console.log(`\n${'═'.repeat(60)}`);
  console.log('📊 关键字段对比');
  console.log('═'.repeat(60));
  const fields = ['appid', 'mbbmc', 'rowid', 'ctime', 'utime'];
  for (const f of fields) {
    const nv = (newRecord as any)?.[f] ?? '(空)';
    const ov = (oldRecord as any)?.[f] ?? '(空)';
    const diff = nv !== ov ? ' ← 不同' : '';
    console.log(`  ${f.padEnd(10)}: 新=${String(nv).padEnd(30)} 旧=${ov}${diff}`);
  }
}

main().catch(console.error);
