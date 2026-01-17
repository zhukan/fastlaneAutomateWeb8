/**
 * 目标包同步诊断脚本
 * 用于排查目标包监控模块无法从明道云同步的问题
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '../.env') });

const HAP_WORKSHEET_ID = '6436b372ca1784f12b3a4a91'; // 目标包表

async function diagnose() {
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 目标包同步诊断工具');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  // 1. 检查环境变量
  console.log('📋 步骤 1: 检查环境变量配置');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const hapAppKey = process.env.HAP_APP_KEY;
  const hapSign = process.env.HAP_SIGN;
  
  if (!hapAppKey || !hapSign) {
    console.error('❌ 环境变量缺失:');
    if (!hapAppKey) console.error('   - HAP_APP_KEY 未配置');
    if (!hapSign) console.error('   - HAP_SIGN 未配置');
    console.log('');
    console.log('💡 解决方案:');
    console.log('   请在 fastlane-agent/.env 文件中配置以下变量:');
    console.log('   HAP_APP_KEY=你的明道云AppKey');
    console.log('   HAP_SIGN=你的明道云Sign');
    console.log('');
    process.exit(1);
  }
  
  console.log('✅ 环境变量配置正常');
  console.log(`   HAP_APP_KEY: ${hapAppKey.substring(0, 10)}...`);
  console.log(`   HAP_SIGN: ${hapSign.substring(0, 10)}...`);
  console.log('');

  // 2. 测试 API 连接
  console.log('📋 步骤 2: 测试明道云 API 连接');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const url = `https://api.mingdao.com/v3/app/worksheets/${HAP_WORKSHEET_ID}/rows/list`;
  
  console.log(`   请求地址: ${url}`);
  console.log(`   工作表 ID: ${HAP_WORKSHEET_ID}`);
  console.log('');
  console.log('   正在发送请求...');
  
  try {
    const requestBody = {
      pageSize: 10,
      pageIndex: 1,
    };
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'HAP-Appkey': hapAppKey,
        'HAP-Sign': hapSign,
      },
      body: JSON.stringify(requestBody),
    });
    
    console.log(`   HTTP 状态码: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('');
      console.error('❌ API 请求失败');
      console.error(`   状态码: ${response.status}`);
      console.error(`   错误信息: ${errorText}`);
      console.log('');
      console.log('💡 可能的原因:');
      console.log('   1. HAP_APP_KEY 或 HAP_SIGN 配置错误');
      console.log('   2. 没有访问工作表的权限');
      console.log('   3. 工作表 ID 不正确');
      console.log('');
      process.exit(1);
    }
    
    const hapData: any = await response.json();
    
    console.log('');
    console.log('✅ API 请求成功');
    console.log('');
    
    // 3. 解析响应数据
    console.log('📋 步骤 3: 解析响应数据');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    let records: any[] = [];
    
    // 尝试多种响应格式
    if (hapData.data && hapData.data.rows && Array.isArray(hapData.data.rows)) {
      records = hapData.data.rows;
      console.log('   响应格式: hapData.data.rows (标准格式)');
    } else if (Array.isArray(hapData)) {
      records = hapData;
      console.log('   响应格式: hapData (数组格式)');
    } else if (hapData.rows && Array.isArray(hapData.rows)) {
      records = hapData.rows;
      console.log('   响应格式: hapData.rows (简化格式)');
    } else {
      console.warn('⚠️  未识别的响应格式');
      console.log('   响应示例:', JSON.stringify(hapData, null, 2).substring(0, 500));
    }
    
    console.log(`   记录数量: ${records.length}`);
    console.log('');
    
    if (records.length === 0) {
      console.warn('⚠️  工作表为空或没有数据');
      console.log('');
      console.log('💡 解决方案:');
      console.log('   1. 确认明道云"目标包表"中有数据');
      console.log('   2. 检查是否有筛选条件限制了数据返回');
      console.log('');
      process.exit(0);
    }
    
    // 4. 检查字段映射
    console.log('📋 步骤 4: 检查字段映射');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const firstRecord = records[0];
    const fieldIds = {
      appName: 'mbbmc',           // 目标包名称
      appId: 'appid',             // appid
      appStoreLink: 'appstorelj', // appstore链接
      qimaiLink: 'qmlj',          // 七麦链接（目标包链接）
      keywordSearchLink: 'ddcxlj', // 关键词查询链接
      isMonitoring: '68463c3a2d40df3ff99fcac5',  // 监控（无别名，使用字段ID）
      isOffline: '663f424caf568575fcc2d0c5',     // 下架（无别名，使用字段ID）
      offlineDate: '67e2500e867bf63841fe7265',   // 下架日期（无别名，使用字段ID）
      isClearKeyword: 'mbbyxj',                  // 清词（别名）
      isClearRank: '694aa701a87445aaca8d9aa8',   // 清榜（无别名，使用字段ID）
      source: '6853b81b0e080d3c9fdbc710',        // 来源（无别名，使用字段ID）
      sourceScreenshot: '6853b81b0e080d3c9fdbc711', // 来源截图（无别名，使用字段ID）
      remark: 'beizhu',           // 备注
    };
    
    console.log('   检查第一条记录的字段映射:');
    console.log('');
    
    let missingFields: string[] = [];
    let foundFields: string[] = [];
    
    for (const [key, fieldId] of Object.entries(fieldIds)) {
      const value = firstRecord[fieldId];
      if (value !== undefined && value !== null && value !== '') {
        foundFields.push(key);
        console.log(`   ✅ ${key} (${fieldId}): ${JSON.stringify(value).substring(0, 50)}`);
      } else {
        missingFields.push(key);
        console.log(`   ⚠️  ${key} (${fieldId}): 无数据`);
      }
    }
    
    console.log('');
    console.log(`   已找到字段: ${foundFields.length}/${Object.keys(fieldIds).length}`);
    
    if (missingFields.length > 0) {
      console.log('');
      console.log(`   ⚠️  缺失或为空的字段: ${missingFields.join(', ')}`);
      console.log('');
      console.log('   💡 注意: 某些字段可能在明道云中为空，这是正常的');
    }
    
    // 5. 显示记录示例
    console.log('');
    console.log('📋 步骤 5: 记录示例');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const appName = firstRecord[fieldIds.appName];
    const appId = firstRecord[fieldIds.appId];
    const qimaiLink = firstRecord[fieldIds.qimaiLink];
    
    console.log(`   应用名称: ${appName || '(空)'}`);
    console.log(`   App ID: ${appId || '(空)'}`);
    console.log(`   七麦链接: ${qimaiLink || '(空)'}`);
    console.log(`   创建时间: ${firstRecord.ctime || '(空)'}`);
    console.log(`   Row ID: ${firstRecord.rowid || firstRecord.rowId || '(空)'}`);
    
    // 总结
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ 诊断完成 - 配置正常');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('📝 建议:');
    console.log('   1. 环境变量配置正确');
    console.log('   2. 可以成功访问明道云目标包表');
    console.log('   3. 字段映射基本正常');
    console.log('');
    console.log('如果前端仍然无法同步，请检查:');
    console.log('   1. fastlane-agent 服务是否正在运行');
    console.log('   2. 前端是否连接到正确的后端地址');
    console.log('   3. 查看 fastlane-agent 的控制台日志');
    console.log('');
    
  } catch (error: any) {
    console.error('');
    console.error('❌ 发生异常');
    console.error(`   错误信息: ${error.message}`);
    console.error(`   错误堆栈: ${error.stack}`);
    console.log('');
    process.exit(1);
  }
}

// 运行诊断
diagnose();
