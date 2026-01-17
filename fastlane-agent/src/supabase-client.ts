import { createClient } from '@supabase/supabase-js';
import { Release, ReviewStatus, AppMonitorRecord, AppStatus, AppMonitorStats, AccountGroup } from './types';

// 后端使用环境变量（不需要 NEXT_PUBLIC 前缀）
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.warn('[Supabase] Missing environment variables. Release records will not be saved.');
}

export class SupabaseClient {
  private client: ReturnType<typeof createClient> | null = null;

  constructor() {
    if (supabaseUrl && supabaseServiceRoleKey) {
      this.client = createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
      console.log('[Supabase] Client initialized');
    } else {
      console.warn('[Supabase] Client not initialized - missing credentials');
    }
  }

  async createRelease(release: Omit<Release, 'id' | 'created_at' | 'updated_at'>): Promise<void> {
    if (!this.client) {
      throw new Error('Supabase client not initialized');
    }

    const { error } = await this.client
      .from('releases')
      .insert({
        project_id: release.project_id,
        bundle_id: release.bundle_id,
        app_name: release.app_name,
        version: release.version,
        build_number: release.build_number,
        is_first_release: release.is_first_release,
        apple_id: release.apple_id,
        team_id: release.team_id,
        itc_team_id: release.itc_team_id,
        api_key_id: release.api_key_id,
        api_key_issuer_id: release.api_key_issuer_id,
        api_key_content: release.api_key_content,
        submitted_at: release.submitted_at,
        completed_at: release.completed_at,
        duration: release.duration,
        task_id: release.task_id,
        deployed_by: release.deployed_by,
        review_status: ReviewStatus.WAITING_FOR_REVIEW, // 初始状态
        metadata: release.metadata,
      } as any); // 使用类型断言，因为 Supabase 客户端无法自动推断表类型

    if (error) {
      throw new Error(`Failed to create release: ${error.message}`);
    }

    console.log('[Supabase] Release record created successfully');
  }

  /**
   * 获取所有非最终状态的发布记录（用于审核监控）
   * 只返回 monitor_enabled = true 的记录
   */
  async getPendingReleases(): Promise<Release[]> {
    if (!this.client) {
      throw new Error('Supabase client not initialized');
    }

    const { data, error } = await this.client
      .from('releases')
      .select('*')
      .eq('monitor_enabled', true)  // 只监控启用状态的记录
      .not('review_status', 'in', `(${ReviewStatus.READY_FOR_SALE},${ReviewStatus.APPROVED},${ReviewStatus.REJECTED},${ReviewStatus.METADATA_REJECTED},${ReviewStatus.REMOVED_FROM_SALE})`)
      .order('submitted_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to get pending releases: ${error.message}`);
    }

    return (data || []) as Release[];
  }

  /**
   * 批量更新发布记录的监控启用状态（7.1 版本新增）
   */
  async batchUpdateMonitorEnabled(releaseIds: string[], enabled: boolean): Promise<number> {
    if (!this.client) {
      throw new Error('Supabase client not initialized');
    }

    if (releaseIds.length === 0) {
      return 0;
    }

    // 使用类型断言绕过 Supabase 客户端类型推断限制
    const releasesTable: any = this.client.from('releases');
    const { data, error } = await releasesTable
      .update({
        monitor_enabled: enabled,
        updated_at: new Date().toISOString(),
      })
      .in('id', releaseIds)
      .select();

    if (error) {
      throw new Error(`Failed to batch update monitor_enabled: ${error.message}`);
    }

    return data?.length || 0;
  }

  /**
   * 获取发布记录的监控启用状态
   */
  async getReleaseMonitorEnabled(releaseId: string): Promise<boolean | null> {
    if (!this.client) {
      throw new Error('Supabase client not initialized');
    }

    const { data, error } = await this.client
      .from('releases')
      .select('monitor_enabled')
      .eq('id', releaseId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw new Error(`Failed to get monitor_enabled: ${error.message}`);
    }

    return (data as any)?.monitor_enabled ?? true;  // 默认 true
  }

  /**
   * 根据 ID 获取单条发布记录
   */
  async getReleaseById(releaseId: string): Promise<Release | null> {
    if (!this.client) {
      throw new Error('Supabase client not initialized');
    }

    const { data, error } = await this.client
      .from('releases')
      .select('*')
      .eq('id', releaseId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // 没有找到记录
        return null;
      }
      throw new Error(`Failed to get release by id: ${error.message}`);
    }

    return data as Release;
  }

  /**
   * 更新发布记录的审核状态
   */
  async updateReleaseStatus(
    releaseId: string,
    statusData: {
      review_status: string;
      last_checked_at: string;
      error_count?: number;
      error_message?: string | null;
    }
  ): Promise<void> {
    if (!this.client) {
      throw new Error('Supabase client not initialized');
    }

    const updateData = {
      review_status: statusData.review_status,
      last_checked_at: statusData.last_checked_at,
      error_count: statusData.error_count ?? 0,
      error_message: statusData.error_message,
      updated_at: new Date().toISOString(),
    };

    // 使用类型断言绕过 Supabase 客户端类型推断限制
    const releasesTable: any = this.client.from('releases');
    const { error } = await releasesTable.update(updateData).eq('id', releaseId);

    if (error) {
      throw new Error(`Failed to update release status: ${error.message}`);
    }
  }

  // ============================================================================
  // App 下架监控相关方法（3.5 版本新增）
  // ============================================================================

  /**
   * 获取所有监控的 App（支持状态筛选）
   */
  async getMonitoredApps(statusFilter?: string): Promise<AppMonitorRecord[]> {
    if (!this.client) {
      throw new Error('Supabase client not initialized');
    }

    let query = this.client.from('app_removal_monitor').select('*');

    // 状态筛选
    if (statusFilter && statusFilter !== 'all') {
      query = query.eq('current_status', statusFilter.toUpperCase());
    }

    const { data, error } = await query.order('app_name', { ascending: true });

    if (error) {
      throw new Error(`Failed to get monitored apps: ${error.message}`);
    }

    return (data || []) as AppMonitorRecord[];
  }

  /**
   * 获取单个监控记录
   */
  async getMonitoredApp(bundleId: string): Promise<AppMonitorRecord | null> {
    if (!this.client) {
      throw new Error('Supabase client not initialized');
    }

    const { data, error } = await this.client
      .from('app_removal_monitor')
      .select('*')
      .eq('bundle_id', bundleId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // 记录不存在
        return null;
      }
      throw new Error(`Failed to get monitored app: ${error.message}`);
    }

    return data as AppMonitorRecord;
  }

  /**
   * 批量创建或更新监控记录（upsert）
   */
  async upsertMonitoredApps(apps: Partial<AppMonitorRecord>[]): Promise<number> {
    if (!this.client) {
      throw new Error('Supabase client not initialized');
    }

    if (apps.length === 0) {
      return 0;
    }

    // 使用类型断言绕过 Supabase 客户端类型推断限制
    const monitorTable: any = this.client.from('app_removal_monitor');
    const { data, error } = await monitorTable
      .upsert(apps, {
        onConflict: 'bundle_id',
        ignoreDuplicates: false,
      })
      .select();

    if (error) {
      throw new Error(`Failed to upsert monitored apps: ${error.message}`);
    }

    return data?.length || 0;
  }

  /**
   * 更新 App 状态
   */
  async updateAppStatus(
    bundleId: string,
    status: AppStatus,
    options?: {
      removedAt?: string | null;
      removedReason?: string | null;
      errorCount?: number;
      errorMessage?: string | null;
      checkHostname?: string;  // 5.1 版本新增：记录检查机器
    }
  ): Promise<void> {
    if (!this.client) {
      throw new Error('Supabase client not initialized');
    }

    const updateData: any = {
      current_status: status,
      last_checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // 可选字段
    if (options) {
      if (options.removedAt !== undefined) {
        updateData.removed_at = options.removedAt;
      }
      if (options.removedReason !== undefined) {
        updateData.removed_reason = options.removedReason;
      }
      if (options.errorCount !== undefined) {
        updateData.check_error_count = options.errorCount;
      }
      if (options.errorMessage !== undefined) {
        updateData.last_error_message = options.errorMessage;
      }
      if (options.checkHostname !== undefined) {
        updateData.check_hostname = options.checkHostname;  // 5.1 版本新增
      }
    }

    // 使用类型断言绕过 Supabase 客户端类型推断限制
    const monitorTable: any = this.client.from('app_removal_monitor');
    const { error } = await monitorTable
      .update(updateData)
      .eq('bundle_id', bundleId);

    if (error) {
      throw new Error(`Failed to update app status: ${error.message}`);
    }
  }

  /**
   * 获取监控统计数据
   */
  async getMonitorStats(): Promise<AppMonitorStats> {
    if (!this.client) {
      throw new Error('Supabase client not initialized');
    }

    const { data, error } = await this.client
      .from('app_removal_monitor')
      .select('current_status');

    if (error) {
      throw new Error(`Failed to get monitor stats: ${error.message}`);
    }

    const stats: AppMonitorStats = {
      total: data?.length || 0,
      available: 0,
      removed: 0,
      unknown: 0,
    };

    data?.forEach((record: any) => {
      switch (record.current_status) {
        case AppStatus.AVAILABLE:
          stats.available++;
          break;
        case AppStatus.REMOVED:
          stats.removed++;
          break;
        case AppStatus.UNKNOWN:
          stats.unknown++;
          break;
      }
    });

    return stats;
  }

  /**
   * 按账号分组获取监控 App（3.5 版本新增）
   */
  async getMonitoredAppsByAccount(): Promise<AccountGroup[]> {
    if (!this.client) {
      throw new Error('Supabase client not initialized');
    }

    // 查询所有 App，包含账号信息
    const { data: apps, error } = await this.client
      .from('app_removal_monitor')
      .select(`
        *,
        account:apple_accounts!local_apple_account_id(*)
      `)
      .order('app_name', { ascending: true });

    if (error) {
      throw new Error(`Failed to get apps by account: ${error.message}`);
    }

    // 按账号分组
    const accountMap = new Map<string, AccountGroup>();

    (apps || []).forEach((app: any) => {
      const account = app.account;
      const accountKey = account?.id || 'unlinked'; // 未关联账号使用特殊 key
      
      if (!accountMap.has(accountKey)) {
        accountMap.set(accountKey, {
          accountId: account?.id || null,
          accountName: account?.account_name || '未关联账号',
          accountEmail: account?.apple_id || undefined,
          apps: [],
          stats: {
            total: 0,
            available: 0,
            removed: 0,
            unknown: 0,
          },
          lastCheckedAt: undefined,
        });
      }

      const group = accountMap.get(accountKey)!;
      group.apps.push(app);
      group.stats.total++;

      // 统计状态
      switch (app.current_status) {
        case AppStatus.AVAILABLE:
          group.stats.available++;
          break;
        case AppStatus.REMOVED:
          group.stats.removed++;
          break;
        case AppStatus.UNKNOWN:
          group.stats.unknown++;
          break;
      }

      // 更新最后检查时间
      if (app.last_checked_at) {
        if (!group.lastCheckedAt || app.last_checked_at > group.lastCheckedAt) {
          group.lastCheckedAt = app.last_checked_at;
        }
      }
    });

    // 转换为数组并排序
    const groups = Array.from(accountMap.values());

    // 排序逻辑：
    // 1. 有下架 App 的账号优先（按下架数量降序）
    // 2. 未知状态多的账号其次
    // 3. 正常账号按 App 数量降序
    // 4. 未关联账号放最后
    groups.sort((a, b) => {
      // 未关联账号始终放最后
      if (a.accountId === null && b.accountId !== null) return 1;
      if (a.accountId !== null && b.accountId === null) return -1;

      // 按下架数量降序
      if (a.stats.removed !== b.stats.removed) {
        return b.stats.removed - a.stats.removed;
      }

      // 按未知数量降序
      if (a.stats.unknown !== b.stats.unknown) {
        return b.stats.unknown - a.stats.unknown;
      }

      // 按总数降序
      return b.stats.total - a.stats.total;
    });

    return groups;
  }

  /**
   * 获取所有需要监控的 App（is_monitoring = true）
   */
  async getAppsToMonitor(): Promise<AppMonitorRecord[]> {
    if (!this.client) {
      throw new Error('Supabase client not initialized');
    }

    const { data, error } = await this.client
      .from('app_removal_monitor')
      .select('*')
      .eq('is_monitoring', true)
      .order('last_checked_at', { ascending: true, nullsFirst: true });

    if (error) {
      throw new Error(`Failed to get apps to monitor: ${error.message}`);
    }

    return (data || []) as AppMonitorRecord[];
  }

  /**
   * 批量同步开发者账号（upsert）
   * 用于下架监控功能（3.5 版本新增）
   */
  async upsertAppleAccounts(accounts: Array<{
    hap_account_id: string;
    account_name: string;
    apple_id: string;
    team_id: string;
    api_key_id: string;
    api_key_issuer_id: string;
    api_key_content: string;
    itc_team_id?: string;
    synced_from_hap_at?: string;
  }>): Promise<number> {
    if (!this.client) {
      throw new Error('Supabase client not initialized');
    }

    if (accounts.length === 0) {
      return 0;
    }

    // 使用类型断言绕过 Supabase 客户端类型推断限制
    const accountsTable: any = this.client.from('apple_accounts');
    const { data, error } = await accountsTable
      .upsert(accounts, {
        onConflict: 'hap_account_id',
        ignoreDuplicates: false,
      })
      .select();

    if (error) {
      throw new Error(`Failed to upsert apple accounts: ${error.message}`);
    }

    return data?.length || 0;
  }

  /**
   * 根据明道云账号 ID 查询本地账号记录
   */
  async getAppleAccountByHapId(hapAccountId: string): Promise<any | null> {
    if (!this.client) {
      throw new Error('Supabase client not initialized');
    }

    const { data, error } = await this.client
      .from('apple_accounts')
      .select('*')
      .eq('hap_account_id', hapAccountId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // 记录不存在
        return null;
      }
      throw new Error(`Failed to get apple account: ${error.message}`);
    }

    return data;
  }

  /**
   * 获取监控 App 及其关联的账号信息（JOIN 查询）
   * 用于优化下架检查性能（3.5 版本新增）
   */
  async getAppsToMonitorWithAccounts(): Promise<Array<AppMonitorRecord & { account: any }>> {
    if (!this.client) {
      throw new Error('Supabase client not initialized');
    }

    const { data, error } = await this.client
      .from('app_removal_monitor')
      .select(`
        *,
        account:apple_accounts!local_apple_account_id(*)
      `)
      .eq('is_monitoring', true)
      .order('last_checked_at', { ascending: true, nullsFirst: true });

    if (error) {
      throw new Error(`Failed to get apps with accounts: ${error.message}`);
    }

    return (data || []) as Array<AppMonitorRecord & { account: any }>;
  }

  /**
   * 获取单个监控 App 及其关联的账号信息（JOIN 查询）
   */
  async getMonitoredAppWithAccount(bundleId: string): Promise<(AppMonitorRecord & { account: any }) | null> {
    if (!this.client) {
      throw new Error('Supabase client not initialized');
    }

    const { data, error } = await this.client
      .from('app_removal_monitor')
      .select(`
        *,
        account:apple_accounts!local_apple_account_id(*)
      `)
      .eq('bundle_id', bundleId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // 记录不存在
        return null;
      }
      throw new Error(`Failed to get monitored app with account: ${error.message}`);
    }

    return data as (AppMonitorRecord & { account: any });
  }

  /**
   * 获取监控中的App数量
   */
  async getMonitoredAppsCount(): Promise<number> {
    if (!this.client) {
      throw new Error('Supabase client not initialized');
    }

    const { count, error } = await this.client
      .from('app_removal_monitor')
      .select('*', { count: 'exact', head: true });
    
    if (error) {
      throw new Error(`Failed to count apps: ${error.message}`);
    }
    
    return count || 0;
  }

  /**
   * 获取不在指定bundleIds列表中的App
   */
  async getAppsNotIn(bundleIds: string[]): Promise<AppMonitorRecord[]> {
    if (!this.client) {
      throw new Error('Supabase client not initialized');
    }

    if (bundleIds.length === 0) {
      // 如果传入空数组，返回所有记录
      const { data, error } = await this.client
        .from('app_removal_monitor')
        .select('*');
      
      if (error) {
        throw new Error(`Failed to query apps: ${error.message}`);
      }
      return (data || []) as AppMonitorRecord[];
    }

    const { data, error } = await this.client
      .from('app_removal_monitor')
      .select('*')
      .not('bundle_id', 'in', `(${bundleIds.join(',')})`);
    
    if (error) {
      throw new Error(`Failed to query apps: ${error.message}`);
    }
    
    return (data || []) as AppMonitorRecord[];
  }

  /**
   * 归档App（移动到历史表并删除原记录）
   */
  async archiveApps(
    apps: AppMonitorRecord[], 
    reason: string = 'removed_from_hap'
  ): Promise<number> {
    if (!this.client) {
      throw new Error('Supabase client not initialized');
    }

    if (apps.length === 0) {
      return 0;
    }

    const now = new Date().toISOString();

    // 准备历史记录数据
    const historyRecords = apps.map(app => ({
      bundle_id: app.bundle_id,
      app_name: app.app_name,
      apple_account_id: app.apple_account_id,
      apple_account_name: app.apple_account_name,
      local_apple_account_id: app.local_apple_account_id,
      hap_product_row_id: app.hap_product_row_id,
      last_known_status: app.current_status,
      was_monitoring: app.is_monitoring,
      last_checked_at: app.last_checked_at,
      removed_at: app.removed_at,
      last_synced_from_hap_at: app.synced_from_hap_at,
      qimai_url: app.qimai_url,
      archived_at: now,
      archived_reason: reason,
      check_error_count: app.check_error_count,
      last_error_message: app.last_error_message,
    }));

    // 插入到历史表
    const historyTable: any = this.client.from('app_removal_monitor_history');
    const { error: insertError } = await historyTable.insert(historyRecords);

    if (insertError) {
      throw new Error(`Failed to insert into history: ${insertError.message}`);
    }

    // 删除原记录
    const bundleIds = apps.map(app => app.bundle_id);
    const monitorTable: any = this.client.from('app_removal_monitor');
    const { error: deleteError } = await monitorTable
      .delete()
      .in('bundle_id', bundleIds);

    if (deleteError) {
      throw new Error(`Failed to delete from monitor: ${deleteError.message}`);
    }

    return apps.length;
  }

  /**
   * 查询历史归档记录（使用视图，包含账号信息）
   */
  async getArchivedApps(options?: {
    limit?: number;
    offset?: number;
    bundleId?: string;
    status?: AppStatus;
  }): Promise<any[]> {
    if (!this.client) {
      throw new Error('Supabase client not initialized');
    }

    // 使用视图查询（包含账号信息）
    const historyView: any = this.client.from('app_removal_monitor_history_with_accounts');
    let query = historyView
      .select('*')
      .order('archived_at', { ascending: false });

    if (options?.bundleId) {
      query = query.eq('bundle_id', options.bundleId);
    }

    if (options?.status) {
      query = query.eq('last_known_status', options.status);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    if (options?.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to query history: ${error.message}`);
    }

    return data || [];
  }

  /**
   * 获取历史归档统计
   */
  async getArchivedAppsStats(): Promise<{
    total: number;
    removed: number;
    available: number;
    unknown: number;
  }> {
    if (!this.client) {
      throw new Error('Supabase client not initialized');
    }

    const { data, error } = await this.client
      .from('app_removal_monitor_history')
      .select('last_known_status');

    if (error) {
      throw new Error(`Failed to get archived stats: ${error.message}`);
    }

    const stats = {
      total: data?.length || 0,
      removed: 0,
      available: 0,
      unknown: 0,
    };

    data?.forEach((record: any) => {
      if (record.last_known_status === AppStatus.REMOVED) {
        stats.removed++;
      } else if (record.last_known_status === AppStatus.AVAILABLE) {
        stats.available++;
      } else {
        stats.unknown++;
      }
    });

    return stats;
  }
}

export const supabaseClient = new SupabaseClient();

