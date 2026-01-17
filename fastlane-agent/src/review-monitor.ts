/**
 * App Store 审核状态监控器
 * 
 * 功能：
 * - 每小时自动检查所有非最终状态的发布记录
 * - 调用 App Store Connect API 查询审核状态
 * - 更新数据库中的审核状态
 * 
 * 使用方法：
 * const monitor = new ReviewMonitor(hapClient, supabaseClient);
 * monitor.start(); // 启动监控
 * monitor.stop();  // 停止监控
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { HapClient, AppleAccountInfo } from './hap-client';
import { SupabaseClient } from './supabase-client';
import { Release, ReviewStatus, isFinalReviewStatus } from './types';

const execAsync = promisify(exec);

export class ReviewMonitor {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private hapClient: HapClient;
  private supabaseClient: SupabaseClient;
  
  // 监控间隔：1 小时 = 3600000 毫秒
  private readonly CHECK_INTERVAL = 60 * 60 * 1000;

  constructor(hapClient: HapClient, supabaseClient: SupabaseClient) {
    this.hapClient = hapClient;
    this.supabaseClient = supabaseClient;
  }

  /**
   * 启动监控器
   */
  start(): void {
    if (this.isRunning) {
      console.log('[ReviewMonitor] 监控器已在运行中');
      return;
    }

    console.log('[ReviewMonitor] 🚀 启动审核状态监控器');
    console.log(`[ReviewMonitor] 监控间隔：${this.CHECK_INTERVAL / 1000 / 60} 分钟`);
    
    this.isRunning = true;
    
    // 立即执行一次检查
    this.checkAllPendingReleases().catch((error) => {
      console.error('[ReviewMonitor] 初始检查失败:', error.message);
    });

    // 设置定时任务
    this.intervalId = setInterval(() => {
      this.checkAllPendingReleases().catch((error) => {
        console.error('[ReviewMonitor] 定时检查失败:', error.message);
      });
    }, this.CHECK_INTERVAL);

    console.log('[ReviewMonitor] ✅ 监控器已启动');
  }

  /**
   * 停止监控器
   */
  stop(): void {
    if (!this.isRunning) {
      console.log('[ReviewMonitor] 监控器未运行');
      return;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRunning = false;
    console.log('[ReviewMonitor] ⏸️  监控器已停止');
  }

  /**
   * 检查所有待审核的发布记录
   */
  private async checkAllPendingReleases(): Promise<void> {
    console.log('[ReviewMonitor] ⏰ 开始检查待审核的发布记录...');
    
    try {
      // 查询所有非最终状态的发布记录
      const pendingReleases = await this.supabaseClient.getPendingReleases();
      
      if (pendingReleases.length === 0) {
        console.log('[ReviewMonitor] ℹ️  没有待审核的发布记录');
        return;
      }

      console.log(`[ReviewMonitor] 📋 找到 ${pendingReleases.length} 条待审核记录`);

      // 逐个检查（避免并发过多导致 API 限流）
      for (const release of pendingReleases) {
        try {
          await this.checkSingleRelease(release);
          // 每次检查后稍微延迟，避免 API 限流
          await this.sleep(2000);
        } catch (error: any) {
          console.error(`[ReviewMonitor] ❌ 检查发布记录失败 [${release.id}]:`, error.message);
        }
      }

      console.log('[ReviewMonitor] ✅ 本轮检查完成');
    } catch (error: any) {
      console.error('[ReviewMonitor] ❌ 检查失败:', error.message);
    }
  }

  /**
   * 检查单条发布记录的审核状态
   */
  private async checkSingleRelease(release: Release): Promise<void> {
    console.log(`[ReviewMonitor] 🔍 检查发布记录: ${release.app_name} v${release.version}`);

    try {
      // 1. 获取账号配置（优先使用 release 表中的数据，减少明道云 API 调用）
      let accountConfig: {
        appleId: string;
        teamId: string;
        apiKeyId: string;
        apiKeyIssuerId: string;
        apiKeyContent: string;
        itcTeamId?: string;
      };

      // 1.1 优先使用 releases 表中存储的 API Key（PRD 8.0）
      if (
        release.api_key_id &&
        release.api_key_issuer_id &&
        release.api_key_content &&
        release.team_id &&
        release.account_email
      ) {
        console.log(`[HAP] 使用 releases 表中存储的 API Key 配置`);
        accountConfig = {
          appleId: release.account_email,
          teamId: release.team_id,
          apiKeyId: release.api_key_id,
          apiKeyIssuerId: release.api_key_issuer_id,
          apiKeyContent: release.api_key_content,
          itcTeamId: release.itc_team_id,
        };
      } else {
        // 1.2 回退到明道云查询（兼容旧数据）
        console.log(`[HAP] releases 表中 API Key 信息不完整，回退到明道云查询`);
        const hapAccountConfig = await this.hapClient.getAppleAccountByBundleId(release.bundle_id);
        
        if (!hapAccountConfig) {
          throw new Error(`无法获取 Bundle ID ${release.bundle_id} 的账号配置（releases 表和明道云均无有效数据）`);
        }

        accountConfig = {
          appleId: hapAccountConfig.appleId,
          teamId: hapAccountConfig.teamId,
          apiKeyId: hapAccountConfig.apiKeyId,
          apiKeyIssuerId: hapAccountConfig.apiKeyIssuerId,
          apiKeyContent: hapAccountConfig.apiKeyContent,
          itcTeamId: hapAccountConfig.itcTeamId,
        };
      }

      // 2. 查询 App Store 审核状态
      const appStoreStatus = await this.getAppStoreStatus(
        release.bundle_id,
        accountConfig
      );

      console.log(`[ReviewMonitor] 📊 ${release.app_name}: ${appStoreStatus}`);

      // 3. 更新数据库
      await this.supabaseClient.updateReleaseStatus(release.id, {
        review_status: appStoreStatus,
        last_checked_at: new Date().toISOString(),
        error_count: 0, // 成功查询，重置错误计数
        error_message: null,
      });

      // 4. 如果是最终状态，记录日志
      if (isFinalReviewStatus(appStoreStatus)) {
        console.log(`[ReviewMonitor] 🎉 ${release.app_name} 已达到最终状态: ${appStoreStatus}`);
      }
    } catch (error: any) {
      // 记录错误，但继续检查下一条
      const errorMessage = error.message || String(error);
      console.error(`[ReviewMonitor] ❌ ${release.app_name} 检查失败:`, errorMessage);

      // 更新错误信息
      try {
        await this.supabaseClient.updateReleaseStatus(release.id, {
          review_status: release.review_status || ReviewStatus.WAITING_FOR_REVIEW,
          last_checked_at: new Date().toISOString(),
          error_count: (release.error_count || 0) + 1,
          error_message: errorMessage.substring(0, 500), // 限制长度
        });
      } catch (updateError: any) {
        console.error(`[ReviewMonitor] ❌ 更新错误信息失败:`, updateError.message);
      }
    }
  }

  /**
   * 查询 App Store Connect 的审核状态
   * 
   * 使用 fastlane spaceship 或 App Store Connect API
   * 这里使用 Ruby 脚本调用 spaceship API
   */
  private async getAppStoreStatus(
    bundleId: string,
    accountConfig: AppleAccountInfo
  ): Promise<string> {
    // 创建临时 API Key 文件
    const apiKeyPath = join(tmpdir(), `AuthKey_${accountConfig.apiKeyId}_${Date.now()}.p8`);
    writeFileSync(apiKeyPath, accountConfig.apiKeyContent);

    try {
      // 创建 Ruby 脚本来查询状态
      const rubyScript = `
require 'spaceship'

# 使用 API Key 登录
Spaceship::ConnectAPI.token = Spaceship::ConnectAPI::Token.create(
  key_id: '${accountConfig.apiKeyId}',
  issuer_id: '${accountConfig.apiKeyIssuerId}',
  filepath: '${apiKeyPath}'
)

# 查找 App
app = Spaceship::ConnectAPI::App.find('${bundleId}')

if app.nil?
  puts 'APP_NOT_FOUND'
  exit 0
end

# 获取最新的 App Store 版本
versions = app.get_app_store_versions

if versions.nil? || versions.empty?
  puts 'WAITING_FOR_REVIEW'
  exit 0
end

# 获取最新版本的状态
latest_version = versions.first
state = latest_version.app_store_state

# 映射状态到我们的枚举
case state
when 'PREPARE_FOR_SUBMISSION', 'WAITING_FOR_REVIEW'
  puts 'WAITING_FOR_REVIEW'
when 'IN_REVIEW'
  puts 'IN_REVIEW'
when 'PENDING_DEVELOPER_RELEASE', 'PENDING_APPLE_RELEASE', 'READY_FOR_SALE'
  puts 'READY_FOR_SALE'
when 'REJECTED'
  puts 'REJECTED'
when 'METADATA_REJECTED'
  puts 'METADATA_REJECTED'
when 'REMOVED_FROM_SALE'
  puts 'REMOVED_FROM_SALE'
else
  puts state
end
      `.trim();

      // 执行 Ruby 脚本
      const { stdout, stderr } = await execAsync(`ruby -e "${rubyScript.replace(/"/g, '\\"')}"`);

      if (stderr && !stderr.includes('warning')) {
        throw new Error(`Ruby 脚本执行错误: ${stderr}`);
      }

      const status = stdout.trim();
      
      // 验证返回的状态是否有效
      if (!status) {
        throw new Error('未能获取到审核状态');
      }

      return status;
    } catch (error: any) {
      throw new Error(`查询 App Store 状态失败: ${error.message}`);
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

  /**
   * 手动刷新单条发布记录的审核状态（供 API 调用）
   */
  public async refreshSingleRelease(releaseId: string): Promise<void> {
    console.log(`[ReviewMonitor] 🔄 手动刷新发布记录: ${releaseId}`);

    // 1. 从数据库获取 release 信息
    const release = await this.supabaseClient.getReleaseById(releaseId);
    
    if (!release) {
      throw new Error(`发布记录不存在: ${releaseId}`);
    }

    // 2. 调用现有的 checkSingleRelease 逻辑
    await this.checkSingleRelease(release);
    
    console.log(`[ReviewMonitor] ✅ 手动刷新完成: ${releaseId}`);
  }
}










