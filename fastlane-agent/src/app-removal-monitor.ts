/**
 * App 下架监控器（3.5 版本新增）
 * 
 * 功能：
 * - 从明道云同步"正式包上架"的 App 列表
 * - 每 12 小时自动检查 App 是否被下架
 * - 支持手动触发检查
 * 
 * 使用方法：
 * const monitor = new AppRemovalMonitor(hapClient, supabaseClient);
 * monitor.start(); // 启动监控
 * monitor.stop();  // 停止监控
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir, hostname } from 'os';
import { HapClient, AppleAccountInfo } from './hap-client';
import { SupabaseClient } from './supabase-client';
import { AppMonitorRecord, AppStatus } from './types';

const execAsync = promisify(exec);

export class AppRemovalMonitor {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private hapClient: HapClient;
  private supabaseClient: SupabaseClient;
  
  // 监控间隔：12 小时 = 43200000 毫秒
  private readonly CHECK_INTERVAL = 12 * 60 * 60 * 1000;

  constructor(hapClient: HapClient, supabaseClient: SupabaseClient) {
    this.hapClient = hapClient;
    this.supabaseClient = supabaseClient;
  }

  /**
   * 启动监控器
   */
  start(): void {
    if (this.isRunning) {
      console.log('[AppRemovalMonitor] 监控器已在运行中');
      return;
    }

    console.log('[AppRemovalMonitor] 🚀 启动 App 下架监控器');
    console.log(`[AppRemovalMonitor] 监控间隔：${this.CHECK_INTERVAL / 1000 / 60 / 60} 小时`);
    
    this.isRunning = true;
    
    // 立即执行一次检查（可选，避免启动时负载过大）
    // this.checkAllApps().catch((error) => {
    //   console.error('[AppRemovalMonitor] 初始检查失败:', error.message);
    // });

    // 设置定时任务
    this.intervalId = setInterval(() => {
      this.checkAllApps().catch((error) => {
        console.error('[AppRemovalMonitor] 定时检查失败:', error.message);
      });
    }, this.CHECK_INTERVAL);

    console.log('[AppRemovalMonitor] ✅ 监控器已启动');
  }

  /**
   * 停止监控器
   */
  stop(): void {
    if (!this.isRunning) {
      console.log('[AppRemovalMonitor] 监控器未运行');
      return;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRunning = false;
    console.log('[AppRemovalMonitor] ⏸️  监控器已停止');
  }

  /**
   * 从明道云同步"正式包上架"的 App 列表
   * 
   * 优化版本（3.5）：两步同步策略
   * 1. 先同步开发者账号信息到 apple_accounts 表
   * 2. 再同步 App 列表到 app_removal_monitor 表，并关联本地账号
   */
  async syncFromHap(): Promise<{ 
    synced: number; 
    updated: number; 
    accounts: number;
    archived: number;
    incompleteActiveAccounts: Array<{ 
      hapAccountId: string; 
      accountName: string; 
      status: string; 
      missingFields: string[]; 
    }> 
  }> {
    console.log('[AppRemovalMonitor] 🔄 开始从明道云同步数据...');
    
    try {
      const now = new Date().toISOString();

      // ===== 第一步：同步开发者账号 =====
      console.log('[AppRemovalMonitor] 📥 步骤 1/2: 同步开发者账号信息...');
      const { accounts: hapAccounts, incompleteActiveAccounts } = await this.hapClient.getAllAppleAccounts();
      
      if (hapAccounts.length === 0) {
        console.log('[AppRemovalMonitor] ⚠️  明道云中没有可用的开发者账号');
      } else {
        console.log(`[AppRemovalMonitor] 📋 从明道云获取到 ${hapAccounts.length} 个可用账号`);

        // 转换为数据库格式
        const accountsToUpsert = hapAccounts.map(account => ({
          hap_account_id: account.hapAccountId!,
          account_name: account.accountName!,
          apple_id: account.appleId,
          team_id: account.teamId,
          api_key_id: account.apiKeyId,
          api_key_issuer_id: account.apiKeyIssuerId,
          api_key_content: account.apiKeyContent,
          itc_team_id: account.itcTeamId,
          synced_from_hap_at: now,
        }));

        // 去重：按 hap_account_id 去重（防止明道云返回重复数据）
        const uniqueAccounts = Array.from(
          new Map(accountsToUpsert.map(acc => [acc.hap_account_id, acc])).values()
        );
        
        if (uniqueAccounts.length < accountsToUpsert.length) {
          console.log(`[AppRemovalMonitor] ⚠️  检测到重复账号，已去重：${accountsToUpsert.length} → ${uniqueAccounts.length}`);
        }

        const accountsUpserted = await this.supabaseClient.upsertAppleAccounts(uniqueAccounts);
        console.log(`[AppRemovalMonitor] ✅ 步骤 1/2 完成：${accountsUpserted} 个账号已同步`);
      }

      // ===== 第二步：同步 App 列表 =====
      console.log('[AppRemovalMonitor] 📥 步骤 2/3: 同步 App 列表...');
      const hapApps = await this.hapClient.getOnlineApps();
      
      // 【安全检查】防止误删 - 明道云API故障保护
      const currentCount = await this.supabaseClient.getMonitoredAppsCount();
      if (hapApps.length === 0 && currentCount > 10) {
        const errorMsg = 
          `❌ 同步中止：明道云返回 0 个App，但本地有 ${currentCount} 个记录。\n` +
          `   疑似明道云 API 故障，已拒绝同步以保护现有数据。\n` +
          `   请检查明道云连接或稍后重试。`;
        console.error(`[AppRemovalMonitor] ${errorMsg}`);
        throw new Error(errorMsg);
      }
      
      if (hapApps.length === 0) {
        console.log('[AppRemovalMonitor] ⚠️  明道云中没有"正式包上架"的 App');
        return { 
          synced: 0, 
          updated: 0, 
          accounts: hapAccounts.length,
          archived: 0,
          incompleteActiveAccounts: incompleteActiveAccounts,
        };
      }

      console.log(`[AppRemovalMonitor] 📋 从明道云获取到 ${hapApps.length} 个 App`);
      const hapBundleIds = hapApps.map(app => app.bundleId);

      // 准备 upsert 数据，并关联本地账号
      const appsToUpsert = [];
      for (const app of hapApps) {
        const appData: any = {
          bundle_id: app.bundleId,
          app_name: app.appName,
          app_store_id: app.appId || undefined,          // App Store ID（7.0 版本新增）
          apple_account_id: app.accountId || undefined,
          apple_account_name: app.accountName || undefined,
          hap_product_row_id: app.rowId,
          qimai_url: app.qimaiUrl || undefined,         // 七麦链接
          umeng_id: app.umengId || undefined,            // 友盟 ID（5.0 版本新增）
          umeng_data_url: app.umengDataUrl || undefined, // 友盟数据链接（5.0 版本新增）
          synced_from_hap_at: now,
          sync_hostname: hostname(),                     // 记录同步机器（5.1 版本新增）
          is_monitoring: true,
          
          // 【激进重置策略】
          // 明道云标记为"正式包上架"，强制重置为在架状态
          current_status: AppStatus.AVAILABLE,
          removed_at: null,
          check_error_count: 0,
          last_error_message: null,
        };

        // 如果有账号 ID，查询本地账号并关联
        if (app.accountId) {
          try {
            const localAccount = await this.supabaseClient.getAppleAccountByHapId(app.accountId);
            if (localAccount) {
              appData.local_apple_account_id = localAccount.id;
              console.log(`[AppRemovalMonitor]   ✓ ${app.appName}: 已关联账号 ${app.accountName}`);
            } else {
              console.log(`[AppRemovalMonitor]   ⚠️  ${app.appName}: 账号 ${app.accountName} 未找到本地记录`);
            }
          } catch (error: any) {
            console.log(`[AppRemovalMonitor]   ⚠️  ${app.appName}: 查询本地账号失败 - ${error.message}`);
          }
        }

        appsToUpsert.push(appData);
      }

      // 批量 upsert 到数据库
      const appsUpserted = await this.supabaseClient.upsertMonitoredApps(appsToUpsert);

      console.log(`[AppRemovalMonitor] ✅ 步骤 2/3 完成：${appsUpserted} 个 App 已同步`);

      // ===== 第三步：归档明道云不再返回的 App =====
      console.log('[AppRemovalMonitor] 📦 步骤 3/3: 处理已从明道云移除的 App...');
      
      const toArchive = await this.supabaseClient.getAppsNotIn(hapBundleIds);
      let archivedCount = 0;
      
      if (toArchive.length > 0) {
        console.log(`[AppRemovalMonitor] 📋 发现 ${toArchive.length} 个App已从明道云移除：`);
        toArchive.forEach(app => {
          const statusText = app.current_status === AppStatus.REMOVED ? '已下架' : '在架';
          const removedInfo = app.removed_at 
            ? ` (下架于 ${new Date(app.removed_at).toLocaleString('zh-CN')})` 
            : '';
          console.log(`[AppRemovalMonitor]   - ${app.app_name} (${app.bundle_id}) [${statusText}]${removedInfo}`);
        });
        
        // 移动到历史表
        archivedCount = await this.supabaseClient.archiveApps(
          toArchive, 
          'removed_from_hap'
        );
        
        console.log(`[AppRemovalMonitor] ✅ 已归档 ${archivedCount} 个App到历史表`);
      } else {
        console.log('[AppRemovalMonitor] ✅ 步骤 3/3 完成：无需归档');
      }

      console.log(`[AppRemovalMonitor] 🎉 全部同步完成！`);
      console.log(`[AppRemovalMonitor]   - 开发者账号：${hapAccounts.length} 个`);
      console.log(`[AppRemovalMonitor]   - 监控 App：${appsUpserted} 个`);
      console.log(`[AppRemovalMonitor]   - 归档 App：${archivedCount} 个`);
      
      // 如果有信息不完整的活跃账号，在最后再次提醒
      if (incompleteActiveAccounts.length > 0) {
        console.log('');
        console.log(`[AppRemovalMonitor] ⚠️  提醒：有 ${incompleteActiveAccounts.length} 个活跃账号信息不完整，请查看上方详细列表并到明道云补充`);
      }
      
      return {
        synced: hapApps.length,
        updated: appsUpserted,
        accounts: hapAccounts.length,
        archived: archivedCount,
        incompleteActiveAccounts: incompleteActiveAccounts,
      };
    } catch (error: any) {
      console.error('[AppRemovalMonitor] ❌ 同步失败:', error.message);
      throw error;
    }
  }

  /**
   * 检查所有需要监控的 App
   * 
   * 优化版本（3.5）：使用 JOIN 查询一次性获取 App + 账号信息，不再逐个查询明道云
   */
  async checkAllApps(): Promise<void> {
    console.log('[AppRemovalMonitor] ⏰ 开始检查所有监控的 App...');
    
    try {
      // 使用 JOIN 查询，一次性获取 App 和账号信息
      const apps = await this.supabaseClient.getAppsToMonitorWithAccounts();
      
      if (apps.length === 0) {
        console.log('[AppRemovalMonitor] ℹ️  没有需要监控的 App');
        return;
      }

      console.log(`[AppRemovalMonitor] 📋 找到 ${apps.length} 个需要监控的 App`);

      // 逐个检查（避免并发过多导致 API 限流）
      let successCount = 0;
      let errorCount = 0;

      for (const app of apps) {
        try {
          await this.checkSingleAppOptimized(app);
          successCount++;
          // 每次检查后稍微延迟，避免 API 限流
          await this.sleep(2000);
        } catch (error: any) {
          errorCount++;
          console.error(`[AppRemovalMonitor] ❌ 检查 App 失败 [${app.app_name}]:`, error.message);
        }
      }

      console.log('[AppRemovalMonitor] ✅ 本轮检查完成');
      console.log(`[AppRemovalMonitor]   - 成功：${successCount} 个`);
      console.log(`[AppRemovalMonitor]   - 失败：${errorCount} 个`);
    } catch (error: any) {
      console.error('[AppRemovalMonitor] ❌ 检查失败:', error.message);
    }
  }

  /**
   * 检查单个 App 的状态（手动触发）
   * 
   * 优化版本（3.5）：使用 JOIN 查询获取 App + 账号信息，不再查询明道云
   */
  async checkSingleApp(bundleId: string): Promise<AppStatus> {
    console.log(`[AppRemovalMonitor] 🔍 检查 App: ${bundleId}`);

    try {
      // 使用 JOIN 查询获取 App 和账号信息
      const appWithAccount = await this.supabaseClient.getMonitoredAppWithAccount(bundleId);
      
      if (!appWithAccount) {
        throw new Error(`App 记录不存在: ${bundleId}`);
      }

      if (!appWithAccount.is_monitoring) {
        console.log(`[AppRemovalMonitor] ⏭️  ${appWithAccount.app_name}: 监控已禁用，跳过`);
        return appWithAccount.current_status;
      }

      return await this.checkSingleAppOptimized(appWithAccount);
    } catch (error: any) {
      console.error(`[AppRemovalMonitor] ❌ 检查失败 ${bundleId}:`, error.message);
      return AppStatus.UNKNOWN;
    }
  }

  /**
   * 检查单个 App 的状态（内部优化版本）
   * 接收已包含账号信息的 App 记录，无需额外查询
   */
  private async checkSingleAppOptimized(appWithAccount: any): Promise<AppStatus> {
    const bundleId = appWithAccount.bundle_id;
    const appName = appWithAccount.app_name;

    try {
      const oldStatus = appWithAccount.current_status;

      // 查询 App Store 状态
      let newStatus: AppStatus;
      
      try {
        // 主方案：使用 iTunes API（反映真实的 App Store 状态）
        // 原因：App Store Connect API 中的版本状态不会因为"从 App Store 移除"而改变
        // 只有 iTunes API 能准确反映 App 是否在公开商店可见
        console.log(`[AppRemovalMonitor] 🔍 步骤 1: 使用 iTunes API 检查公开状态...`);
        newStatus = await this.checkWithiTunesAPI(bundleId);
        
        // 如果 iTunes API 显示已下架，进一步用 App Store Connect API 验证（可选）
        if (newStatus === AppStatus.REMOVED && appWithAccount.account) {
          try {
            console.log(`[AppRemovalMonitor] 🔍 步骤 2: 使用 App Store Connect API 验证...`);
            const connectStatus = await this.checkWithAppStoreConnectAPIOptimized(bundleId, appWithAccount.account);
            console.log(`[AppRemovalMonitor] ℹ️  对比: iTunes API = REMOVED, Connect API = ${connectStatus}`);
          } catch (error: any) {
            console.log(`[AppRemovalMonitor] ⚠️  Connect API 验证失败: ${error.message}`);
          }
        }
      } catch (error: any) {
        const errorMessage = error.message || String(error);
        console.log(`[AppRemovalMonitor] ⚠️  iTunes API 失败: ${errorMessage}`);
        
        // 降级到 App Store Connect API
        if (appWithAccount.account) {
          console.log(`[AppRemovalMonitor] 🔄 降级使用 App Store Connect API...`);
          newStatus = await this.checkWithAppStoreConnectAPIOptimized(bundleId, appWithAccount.account);
        } else {
          throw new Error('iTunes API 失败且无可用的开发者账号配置');
        }
      }

      console.log(`[AppRemovalMonitor] 📊 ${appName}: ${oldStatus} → ${newStatus}`);

      // 更新数据库
      const updateOptions: any = {
        errorCount: 0, // 成功查询，重置错误计数
        errorMessage: null,
        checkHostname: hostname(), // 记录检查机器（5.1 版本新增）
      };

      // 检测状态变化
      if (oldStatus !== newStatus) {
        if (newStatus === AppStatus.REMOVED) {
          // 在售 → 下架：记录下架时间
          updateOptions.removedAt = new Date().toISOString();
          console.log(`[AppRemovalMonitor] 🚨 ${appName} 已被下架！`);
        } else if (oldStatus === AppStatus.REMOVED && newStatus === AppStatus.AVAILABLE) {
          // 下架 → 在售：清除下架时间（重新上架）
          updateOptions.removedAt = null;
          console.log(`[AppRemovalMonitor] 🎉 ${appName} 已重新上架！`);
        }
      }

      await this.supabaseClient.updateAppStatus(bundleId, newStatus, updateOptions);

      return newStatus;
    } catch (error: any) {
      // 记录错误
      const errorMessage = error.message || String(error);
      const isConfigError = errorMessage.includes('账号配置不完整') || errorMessage.includes('CONFIG_MISSING');
      
      if (isConfigError) {
        console.error(`[AppRemovalMonitor] ❌ 配置错误 ${bundleId}:`, errorMessage);
        console.error(`[AppRemovalMonitor] 💡 请同步明道云数据或检查该 App 的开发者账号配置是否完整`);
      } else {
        console.error(`[AppRemovalMonitor] ❌ 检查失败 ${bundleId}:`, errorMessage);
      }

      // 更新错误信息
      try {
        // 配置错误不累加错误计数（避免误判为临时错误）
        const errorCount = isConfigError ? 999 : (appWithAccount.check_error_count || 0) + 1;
        
        await this.supabaseClient.updateAppStatus(
          bundleId,
          AppStatus.UNKNOWN,
          {
            errorCount,
            errorMessage: errorMessage.substring(0, 500),
            checkHostname: hostname(), // 记录检查机器（5.1 版本新增）
          }
        );

        if (isConfigError) {
          console.log(`[AppRemovalMonitor] ⚠️  ${appName} 配置错误，已标记为需要修复（错误计数: 999）`);
        } else if (errorCount >= 3) {
          console.log(`[AppRemovalMonitor] ⚠️  ${appName} 连续失败 ${errorCount} 次，建议检查配置`);
        }
      } catch (updateError: any) {
        console.error(`[AppRemovalMonitor] ❌ 更新错误信息失败:`, updateError.message);
      }

      return AppStatus.UNKNOWN;
    }
  }

  /**
   * 使用 App Store Connect API 检查（优化版本，使用本地账号信息）
   */
  private async checkWithAppStoreConnectAPIOptimized(
    bundleId: string,
    account: any
  ): Promise<AppStatus> {
    // 检查本地账号信息是否完整
    if (!account || !account.team_id || !account.api_key_id || !account.api_key_issuer_id || !account.api_key_content) {
      throw new Error(`CONFIG_MISSING:账号配置不完整，请重新从明道云同步数据`);
    }

    const accountConfig = {
      appleId: account.apple_id,
      teamId: account.team_id,
      apiKeyId: account.api_key_id,
      apiKeyIssuerId: account.api_key_issuer_id,
      apiKeyContent: account.api_key_content,
      itcTeamId: account.itc_team_id,
    };

    // 2. 创建临时 API Key 文件
    const apiKeyPath = join(tmpdir(), `AuthKey_${accountConfig.apiKeyId}_${Date.now()}.p8`);
    writeFileSync(apiKeyPath, accountConfig.apiKeyContent);

    try {
      // 3. 创建 Ruby 脚本来查询状态
      const rubyScript = `
require 'spaceship'

begin
  # 使用 API Key 登录
  Spaceship::ConnectAPI.token = Spaceship::ConnectAPI::Token.create(
    key_id: '${accountConfig.apiKeyId}',
    issuer_id: '${accountConfig.apiKeyIssuerId}',
    filepath: '${apiKeyPath}'
  )

  # 查找 App
  app = Spaceship::ConnectAPI::App.find('${bundleId}')

  if app.nil?
    puts 'REMOVED'
    exit 0
  end

  # 检查 App 本身是否被移除
  if app.removed == true
    puts 'REMOVED'
    exit 0
  end

  # 获取 App Store 版本（仅作为辅助判断）
  versions = app.get_app_store_versions
  
  if versions.nil? || versions.empty?
    # 没有任何版本，可能是刚创建的 App 或已被下架
    puts 'REMOVED'
    exit 0
  end

  # 检查是否所有版本都被移除
  # 只要有一个版本是 READY_FOR_SALE 或其他在售状态，且 App 本身没被移除，就认为在架
  removed_states = ['REMOVED_FROM_SALE', 'DEVELOPER_REMOVED_FROM_SALE']
  active_versions = versions.reject { |v| removed_states.include?(v.app_store_state) }

  if active_versions.empty?
    puts 'REMOVED'
  else
    puts 'AVAILABLE'
  end
rescue => e
  STDERR.puts "Error: #{e.message}"
  exit 1
end
      `.trim();

      // 4. 执行 Ruby 脚本
      console.log(`[AppRemovalMonitor] 🔧 执行 Ruby 脚本查询 ${bundleId}...`);
      const { stdout, stderr } = await execAsync(`ruby -e "${rubyScript.replace(/"/g, '\\"')}"`);

      // 输出调试信息（stderr 中的 Debug 不是错误）
      if (stderr) {
        const lines = stderr.split('\n');
        for (const line of lines) {
          if (line.includes('Debug:')) {
            console.log(`[AppRemovalMonitor] ${line}`);
          } else if (!line.includes('warning') && line.trim()) {
            // 只有非 Debug、非 warning 的内容才是真正的错误
            throw new Error(`Ruby 脚本执行错误: ${line}`);
          }
        }
      }

      const status = stdout.trim();
      console.log(`[AppRemovalMonitor] 🎯 解析状态: "${status}"`);
      
      if (status === 'AVAILABLE') {
        return AppStatus.AVAILABLE;
      } else if (status === 'REMOVED') {
        return AppStatus.REMOVED;
      } else {
        throw new Error(`未知的状态返回: ${status}`);
      }
    } catch (error: any) {
      throw new Error(`App Store Connect API 查询失败: ${error.message}`);
    } finally {
      // 清理临时文件
      try {
        unlinkSync(apiKeyPath);
      } catch (cleanupError) {
        // 忽略清理错误
      }
    }
  }

  /**
   * 使用 iTunes Search API 检查（备用方案）
   * 
   * ⚠️ 已知问题：iTunes Search API 有严重的缓存问题
   * - 即使 App 已下架，API 可能在数小时/数天内仍返回旧数据
   * - 解决方案：改用直接访问 App Store 页面的方式验证
   */
  private async checkWithiTunesAPI(bundleId: string): Promise<AppStatus> {
    try {
      // 方案 1：先尝试通过 iTunes API 获取 App ID
      const lookupUrl = `https://itunes.apple.com/lookup?bundleId=${encodeURIComponent(bundleId)}`;
      const lookupResponse = await fetch(lookupUrl);
      
      if (!lookupResponse.ok) {
        throw new Error(`iTunes API HTTP ${lookupResponse.status}`);
      }

      const lookupData = await lookupResponse.json() as { resultCount: number; results?: Array<{ trackId: number }> };
      
      // 如果 API 返回 0 个结果，直接判定为下架
      if (lookupData.resultCount === 0) {
        return AppStatus.REMOVED;
      }

      // 方案 2：使用 App ID 直接访问 App Store 页面验证
      // 这是更可靠的方式，因为页面会立即反映下架状态
      const appId = lookupData.results?.[0]?.trackId;
      if (!appId) {
        throw new Error('无法从 iTunes API 获取 App ID');
      }

      console.log(`[AppRemovalMonitor] 🔍 步骤 1.1: iTunes API 返回 App ID: ${appId}`);
      console.log(`[AppRemovalMonitor] 🔍 步骤 1.2: 访问 App Store 页面验证...`);

      // 访问 App Store 页面（使用中国区）
      const storeUrl = `https://apps.apple.com/cn/app/id${appId}`;
      const storeResponse = await fetch(storeUrl, {
        redirect: 'manual', // 不自动跟随重定向
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      });

      // 检查响应状态
      if (storeResponse.status === 404) {
        // 404 明确表示 App 不存在或已下架
        console.log(`[AppRemovalMonitor] 📊 App Store 页面返回 404，确认已下架`);
        return AppStatus.REMOVED;
      }

      if (storeResponse.status === 200) {
        // 200 表示页面存在，进一步检查页面内容
        const html = await storeResponse.text();
        
        // 检查是否包含"无法找到"等下架标志
        const removedKeywords = [
          '无法找到你所需的页面',
          'We could not find the page you requested',
          '找不到该页面',
          'Page Not Found',
        ];
        
        const isRemoved = removedKeywords.some(keyword => html.includes(keyword));
        
        if (isRemoved) {
          console.log(`[AppRemovalMonitor] 📊 App Store 页面显示"无法找到"，确认已下架`);
          return AppStatus.REMOVED;
        }

        // 页面正常且没有下架标志，判定为在架
        console.log(`[AppRemovalMonitor] 📊 App Store 页面正常，确认在架`);
        return AppStatus.AVAILABLE;
      }

      // 其他状态码（如 302/301 重定向）需要进一步分析
      console.log(`[AppRemovalMonitor] ⚠️  App Store 页面返回状态码 ${storeResponse.status}`);
      
      // 保守判断：如果 iTunes API 有数据但页面异常，暂时认为在架
      // （避免误判，后续可以通过 Connect API 进一步验证）
      return AppStatus.AVAILABLE;
      
    } catch (error: any) {
      throw new Error(`iTunes API 查询失败: ${error.message}`);
    }
  }

  /**
   * 延迟函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 获取监控状态
   */
  getStatus(): { isRunning: boolean; checkInterval: number } {
    return {
      isRunning: this.isRunning,
      checkInterval: this.CHECK_INTERVAL,
    };
  }
}

