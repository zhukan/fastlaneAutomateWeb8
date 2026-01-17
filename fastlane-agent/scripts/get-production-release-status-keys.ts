/**
 * 获取"App生产发布"表的状态字段选项 Key 值
 */

import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(__dirname, '../.env') });

const HAP_APP_KEY = process.env.HAP_APP_KEY_PRODUCTION_RELEASES || process.env.HAP_APP_KEY;
const HAP_SIGN = process.env.HAP_SIGN_PRODUCTION_RELEASES || process.env.HAP_SIGN;
const WORKSHEET_ID = process.env.HAP_WORKSHEET_PRODUCTION_RELEASES || '65612ddfc96f80bfabe5df2e';

// "App生产发布"表有多个状态相关字段
const STATUS_FIELDS = {
  PACKAGE_STATUS: '64b168be624fef0d46c11054',    // 打包状态
  FORMAL_STATUS: '64b168be624fef0d46c11055',     // 正式包状态
  WHITE_STATUS: '64e35d9518064e34061e5e2e',      // 白包/综合状态（如果存在）
};

async function getFieldOptions() {
  console.log('🔍 正在获取"App生产发布"表状态字段的选项 Key 值...\n');
  console.log(`工作表 ID: ${WORKSHEET_ID}\n`);

  try {
    // 查询数据，从中提取状态字段的实际值
    const url = `https://api.mingdao.com/v3/app/worksheets/${WORKSHEET_ID}/rows/list`;
    
    const body = {
      pageSize: 100,
      pageIndex: 1,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'HAP-Appkey': HAP_APP_KEY!,
        'HAP-Sign': HAP_SIGN!,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as any;
    
    if (!data.success) {
      throw new Error(data.error_msg || `API Error: ${data.error_code}`);
    }

    const rows = data.data?.rows || [];
    console.log(`✅ 获取到 ${rows.length} 条数据\n`);

    // 提取所有状态字段的不同值
    const allStatusValues = new Map<string, { key: string; value: string }>();
    
    rows.forEach((row: any) => {
      // 遍历所有状态字段
      Object.values(STATUS_FIELDS).forEach(fieldId => {
        const statusField = row[fieldId];
        if (Array.isArray(statusField) && statusField.length > 0) {
          statusField.forEach(item => {
            if (item.key && item.value) {
              allStatusValues.set(item.value, { key: item.key, value: item.value });
            }
          });
        }
      });
    });

    if (allStatusValues.size === 0) {
      console.log('⚠️  未从数据中提取到任何状态值');
      return;
    }

    console.log(`📋 从数据中提取到 ${allStatusValues.size} 个不同的状态值：\n`);
    console.log('export const PRODUCTION_RELEASE_STATUS_KEYS = {');
    
    Array.from(allStatusValues.values())
      .sort((a, b) => a.value.localeCompare(b.value, 'zh-CN'))
      .forEach(option => {
        const key = option.value.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
        console.log(`  ${key}: '${option.key}', // ${option.value}`);
      });
    
    console.log('} as const;\n');

    console.log('\n📝 需要筛选的状态（用于降级查询）：');
    const targetStatuses = [
      '待处理', '调试中', '调试完成', '已打包上传',
      '正式包审核中', '正式包上架',
      '白包审核中', '白包上架', '白包审核不通过'
    ];
    
    console.log('\nconst allowedStatusKeys = [');
    const foundKeys: string[] = [];
    targetStatuses.forEach(status => {
      const option = allStatusValues.get(status);
      if (option) {
        const key = status.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
        console.log(`  PRODUCTION_RELEASE_STATUS_KEYS.${key}, // ${status}`);
        foundKeys.push(option.key);
      } else {
        console.log(`  // ⚠️  未找到: ${status}`);
      }
    });
    console.log('];\n');
    
    console.log(`\n✅ 找到 ${foundKeys.length}/${targetStatuses.length} 个目标状态`)

  } catch (error: any) {
    console.error('❌ 获取失败:', error.message);
    console.error('详细信息:', error);
  }
}

getFieldOptions();
