/**
 * 找出同步冲突：HAP 中的记录 app_id 与 Supabase 已有记录 app_id 相同，但 hap_row_id 不同
 * 运行方式：npx ts-node scripts/find-sync-conflict.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.join(__dirname, '../.env') });

const HAP_WORKSHEET_ID = '6436b372ca1784f12b3a4a91';
const FIELD_APP_ID = 'appid';
const FIELD_APP_NAME = 'mbbmc';

async function fetchAllHapRecords() {
  const appKey = process.env.HAP_APP_KEY || '';
  const sign = process.env.HAP_SIGN || '';

  if (!appKey || !sign) {
    console.error('❌ 缺少环境变量: HAP_APP_KEY / HAP_SIGN');
    process.exit(1);
  }

  const url = `https://api.mingdao.com/v3/app/worksheets/${HAP_WORKSHEET_ID}/rows/list`;
  let allRecords: any[] = [];
  let pageIndex = 1;

  while (true) {
    process.stdout.write(`\r📄 正在获取明道云数据... 第 ${pageIndex} 页`);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'HAP-Appkey': appKey,
        'HAP-Sign': sign,
      },
      body: JSON.stringify({ pageSize: 1000, pageIndex }),
    });

    if (!res.ok) {
      console.error(`\n❌ 明道云 API 错误: HTTP ${res.status}`);
      process.exit(1);
    }

    const data: any = await res.json();
    const rows: any[] = data?.data?.rows ?? data?.rows ?? [];
    allRecords = allRecords.concat(rows);

    if (rows.length < 1000) break;
    pageIndex++;
  }

  console.log(`\n✅ 明道云共 ${allRecords.length} 条记录`);
  return allRecords;
}

async function fetchAllSupabaseRecords() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ 缺少环境变量: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data, error } = await supabase
    .from('target_apps')
    .select('id, hap_row_id, app_id, app_name')
    .not('app_id', 'is', null);

  if (error) {
    console.error('❌ 查询 Supabase 失败:', error.message);
    process.exit(1);
  }

  console.log(`✅ Supabase 共 ${data?.length ?? 0} 条有 app_id 的记录`);
  return data ?? [];
}

async function main() {
  console.log('🔍 开始对比明道云与 Supabase 数据...\n');

  const [hapRecords, supabaseRecords] = await Promise.all([
    fetchAllHapRecords(),
    fetchAllSupabaseRecords(),
  ]);

  // 建立 Supabase 中 app_id → 记录 的映射
  const supabaseByAppId = new Map<string, { id: string; hap_row_id: string; app_name: string }>();
  for (const r of supabaseRecords) {
    if (r.app_id) supabaseByAppId.set(r.app_id, r);
  }

  // 建立 Supabase 中 hap_row_id 集合（快速判断是否已存在）
  const supabaseHapRowIds = new Set(supabaseRecords.map((r: any) => r.hap_row_id));

  console.log('\n🔎 对比中...\n');

  const conflicts: Array<{
    appId: string;
    hapRecord: { rowId: string; appName: string };
    supabaseRecord: { id: string; hapRowId: string; appName: string };
  }> = [];

  for (const r of hapRecords) {
    const hapRowId = r.rowid || r.rowId;
    const appId = r[FIELD_APP_ID];
    const appName = r[FIELD_APP_NAME] || '未命名';

    if (!appId) continue;

    // 这条 HAP 记录在 Supabase 中不存在（新记录，会触发 INSERT）
    if (!supabaseHapRowIds.has(hapRowId)) {
      // 但 app_id 已经存在于 Supabase 中（不同的 hap_row_id）
      const existing = supabaseByAppId.get(appId);
      if (existing && existing.hap_row_id !== hapRowId) {
        conflicts.push({
          appId,
          hapRecord: { rowId: hapRowId, appName },
          supabaseRecord: {
            id: existing.id,
            hapRowId: existing.hap_row_id,
            appName: existing.app_name,
          },
        });
      }
    }
  }

  console.log(`📊 结果：发现 ${conflicts.length} 个冲突\n`);

  if (conflicts.length === 0) {
    console.log('✅ 没有发现冲突记录。');
    console.log('   可能原因：同步是增量的（只同步最近N天），请尝试全量同步触发问题后再查。');
    return;
  }

  console.log('冲突列表（HAP 新记录 vs Supabase 已有记录）：\n');
  console.log(
    '序号  | app_id       | HAP 新 hap_row_id          | HAP 新 app_name        | Supabase 旧 hap_row_id     | Supabase 旧 app_name'
  );
  console.log('─'.repeat(130));

  conflicts.forEach((c, i) => {
    console.log(
      `${String(i + 1).padEnd(5)} | ${c.appId.padEnd(12)} | ${c.hapRecord.rowId.padEnd(26)} | ${c.hapRecord.appName.padEnd(22)} | ${c.supabaseRecord.hapRowId.padEnd(26)} | ${c.supabaseRecord.appName}`
    );
  });
}

main().catch(console.error);
