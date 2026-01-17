import {
  GlobalConfig,
  Project,
  ProjectDetectionResult,
  Task,
  DeployType,
  SSEEvent,
  ProjectsQueryParams,
  ProjectsResponse,
  Release,
  AppMonitorRecord,
  AppMonitorStats,
  AccountGroup,
  AppComparisonRecord,
  AppComparisonStats,
} from './types';
import { supabase } from './supabase';

export class AgentClient {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
  }

  async checkConnection(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000), // 3 秒超时
      });
      return res.ok;
    } catch (error) {
      return false;
    }
  }

  async getGlobalConfig(): Promise<GlobalConfig> {
    const res = await fetch(`${this.baseUrl}/config/global`);
    if (!res.ok) throw new Error('Failed to fetch global config');
    return res.json();
  }

  async setGlobalConfig(config: GlobalConfig): Promise<void> {
    const res = await fetch(`${this.baseUrl}/config/global`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (!res.ok) throw new Error('Failed to update global config');
  }

  async getProjects(params?: ProjectsQueryParams): Promise<ProjectsResponse> {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.pageSize) queryParams.append('pageSize', params.pageSize.toString());
    if (params?.search) queryParams.append('search', params.search);
    if (params?.sortBy) queryParams.append('sortBy', params.sortBy);
    if (params?.sortOrder) queryParams.append('sortOrder', params.sortOrder);
    
    const url = `${this.baseUrl}/projects${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch projects');
    return res.json();
  }

  async detectProject(path: string): Promise<ProjectDetectionResult> {
    const res = await fetch(`${this.baseUrl}/projects/detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    if (!res.ok) throw new Error('Failed to detect project');
    return res.json();
  }

  async addProject(
    name: string,
    path: string,
    config?: {
      bundleId?: string;
      workspace?: string;
      project?: string;
      scheme?: string;
      useMatch?: boolean;
      appleId?: string;
      teamId?: string;
      itcTeamId?: string;
      appSpecificPassword?: string;
    }
  ): Promise<Project> {
    const res = await fetch(`${this.baseUrl}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, path, config }),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to add project');
    }
    return res.json();
  }

  async updateProject(id: string, updates: Partial<Project>): Promise<Project> {
    const res = await fetch(`${this.baseUrl}/projects/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to update project');
    }
    return res.json();
  }

  async getProject(id: string): Promise<Project> {
    const res = await fetch(`${this.baseUrl}/projects/${id}`);
    if (!res.ok) throw new Error('Failed to fetch project');
    return res.json();
  }

  async getProjectInfo(id: string): Promise<Project> {
    const res = await fetch(`${this.baseUrl}/projects/${id}/info`);
    if (!res.ok) throw new Error('Failed to fetch project info');
    return res.json();
  }

  async deleteProject(id: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/projects/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete project');
  }

  async syncProjectAccount(projectId: string): Promise<Project> {
    const res = await fetch(`${this.baseUrl}/projects/${projectId}/sync-account`, {
      method: 'POST',
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to sync account');
    }
    return res.json();
  }

  async createTask(
    projectId: string, 
    type: DeployType,
    options?: { 
      isFirstRelease?: boolean;
      userId?: string;
    }
  ): Promise<string> {
    const res = await fetch(`${this.baseUrl}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, type, ...options }),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to create task');
    }
    const data = await res.json();
    return data.taskId;
  }

  async getTask(taskId: string): Promise<Task> {
    const res = await fetch(`${this.baseUrl}/tasks/${taskId}`);
    if (!res.ok) throw new Error('Failed to fetch task');
    return res.json();
  }

  streamTask(
    taskId: string,
    onEvent: (event: SSEEvent) => void,
    onError?: (error: Error) => void,
    onComplete?: () => void
  ): EventSource {
    const eventSource = new EventSource(`${this.baseUrl}/tasks/${taskId}/stream`);
    
    let hasReceivedData = false;

    eventSource.onmessage = (e) => {
      hasReceivedData = true;
      
      if (e.data === '[DONE]') {
        eventSource.close();
        onComplete?.();
        return;
      }

      try {
        const event: SSEEvent = JSON.parse(e.data);
        onEvent(event);
      } catch (error) {
        console.error('Failed to parse SSE event:', error);
      }
    };

    eventSource.onerror = (e: Event) => {
      const eventSourceError = e.target as EventSource;
      const readyState = eventSourceError.readyState;
      
      console.error('SSE error:', {
        readyState,
        hasReceivedData,
        url: eventSourceError.url,
      });
      
      eventSource.close();
      
      // 提供更详细的错误信息
      let errorMessage = 'SSE 连接失败';
      
      if (readyState === EventSource.CLOSED) {
        if (!hasReceivedData) {
          errorMessage = 'Agent 服务未响应，请确保 fastlane-agent 已启动（运行 npm start）';
        } else {
          errorMessage = '连接已关闭';
        }
      } else if (readyState === EventSource.CONNECTING) {
        errorMessage = '正在尝试重新连接...';
      }
      
      onError?.(new Error(errorMessage));
    };

    return eventSource;
  }

  async cancelTask(taskId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/tasks/${taskId}/cancel`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error('Failed to cancel task');
  }

  async refreshReleaseStatus(releaseId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/releases/${releaseId}/refresh-status`, {
      method: 'POST',
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || '刷新审核状态失败');
    }
  }

  async backfillRelease(params: {
    projectId?: string;
    bundleId?: string;
    projectPath?: string;
    submittedAt: string;
    completedAt?: string;
    userId: string;
    isFirstRelease?: boolean;
    taskId?: string;
  }): Promise<{
    success: boolean;
    message: string;
    project: {
      id: string;
      name: string;
      bundleId: string;
      version: string;
      build: string;
    };
  }> {
    const res = await fetch(`${this.baseUrl}/releases/backfill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || '补录发布记录失败');
    }
    return res.json();
  }

  // 获取发布历史（查询 releases 表，然后获取用户信息）
  async getReleases(projectId: string): Promise<Release[]> {
    // 先查询 releases
    const { data: releases, error: releasesError } = await supabase
      .from('releases')
      .select('*')
      .eq('project_id', projectId)
      .order('submitted_at', { ascending: false });

    if (releasesError) {
      throw new Error(`Failed to fetch releases: ${releasesError.message}`);
    }

    if (!releases || releases.length === 0) {
      return [];
    }

    // 获取所有唯一的 user IDs
    const userIds = Array.from(new Set(releases.map(r => r.deployed_by).filter(Boolean)));

    // 查询用户信息（使用 users_view）
    const { data: users, error: usersError } = await supabase
      .from('users_view')
      .select('id, email, full_name')
      .in('id', userIds);

    if (usersError) {
      console.warn('Failed to fetch users:', usersError.message);
    }

    // 创建用户映射
    const userMap = new Map();
    (users || []).forEach((user: any) => {
      userMap.set(user.id, user);
    });

    // 合并数据
    return releases.map((release: any) => {
      const user = userMap.get(release.deployed_by);
      return {
        ...release,
        deployed_by_display: user?.full_name || user?.email || '未知用户',
      };
    });
  }

  async getLatestRelease(projectId: string): Promise<Release | null> {
    const { data, error } = await supabase
      .from('releases')
      .select('*')
      .eq('project_id', projectId)
      .order('submitted_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // 没有找到记录
        return null;
      }
      throw new Error(`Failed to fetch latest release: ${error.message}`);
    }

    if (!data) return null;

    const release = data as any;

    // 获取用户信息
    if (release.deployed_by) {
      const { data: user } = await supabase
        .from('users_view')
        .select('id, email, full_name')
        .eq('id', release.deployed_by)
        .single();

      if (user) {
        release.deployed_by_display = user.full_name || user.email || '未知用户';
      }
    }

    return {
      ...release,
      deployed_by_display: release.deployed_by_display || '未知用户',
    } as Release;
  }

  // ============================================================================
  // 发布记录监控状态管理 API（7.1 版本新增）
  // ============================================================================

  /**
   * 批量更新发布记录的监控启用状态
   */
  async batchUpdateMonitorStatus(releaseIds: string[], enabled: boolean): Promise<number> {
    const res = await fetch(`${this.baseUrl}/api/releases/batch-monitor-status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ releaseIds, enabled }),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || '批量更新监控状态失败');
    }
    const data = await res.json();
    return data.updatedCount || 0;
  }

  /**
   * 更新单条发布记录的监控启用状态
   */
  async updateMonitorStatus(releaseId: string, enabled: boolean): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/releases/${releaseId}/monitor-status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || '更新监控状态失败');
    }
  }

  /**
   * 获取发布记录的监控启用状态
   */
  async getMonitorStatus(releaseId: string): Promise<boolean> {
    const res = await fetch(`${this.baseUrl}/api/releases/${releaseId}/monitor-status`);
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || '获取监控状态失败');
    }
    const data = await res.json();
    return data.monitorEnabled ?? true;
  }

  // ============================================================================
  // 外部审核同步 API（8.0 版本新增）
  // ============================================================================

  /**
   * 同步外部提交的审核记录
   */
  async syncExternalReleases(): Promise<{
    success: boolean;
    data?: {
      newCount: number;
      existCount: number;
      failCount: number;
      failedApps: Array<{
        appName: string;
        version: string;
        error: string;
      }>;
    };
    error?: string;
  }> {
    const res = await fetch(`${this.baseUrl}/api/releases/sync-external`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || '同步外部审核失败');
    }
    
    return res.json();
  }

  // ============================================================================
  // App 下架监控 API（3.5 版本新增）
  // ============================================================================

  /**
   * 从明道云同步 App 列表
   */
  async syncMonitoredApps(): Promise<{ 
    synced: number; 
    updated: number; 
    accounts: number;
    incompleteActiveAccounts: Array<{
      hapAccountId: string;
      accountName: string;
      status: string;
      missingFields: string[];
    }>;
  }> {
    const res = await fetch(`${this.baseUrl}/api/app-removal-monitor/sync`, {
      method: 'POST',
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to sync apps');
    }
    return res.json();
  }

  /**
   * 获取监控的 App 列表
   */
  async getMonitoredApps(status?: string): Promise<AppMonitorRecord[]> {
    const url = new URL(`${this.baseUrl}/api/app-removal-monitor/list`);
    if (status) {
      url.searchParams.append('status', status);
    }
    
    const res = await fetch(url.toString());
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to get monitored apps');
    }
    
    const data = await res.json();
    return data.apps;
  }

  /**
   * 获取监控统计数据
   */
  async getMonitorStats(): Promise<AppMonitorStats> {
    const res = await fetch(`${this.baseUrl}/api/app-removal-monitor/stats`);
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to get monitor stats');
    }
    return res.json();
  }

  /**
   * 按账号分组获取监控的 App 列表（3.5 版本新增）
   */
  async getMonitoredAppsByAccount(): Promise<AccountGroup[]> {
    const res = await fetch(`${this.baseUrl}/api/app-removal-monitor/list-by-account`);
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to get apps by account');
    }
    
    const data = await res.json();
    return data.groups;
  }

  /**
   * 手动检查单个 App
   */
  async checkApp(bundleId: string): Promise<{ bundleId: string; status: string; checked_at: string }> {
    const res = await fetch(`${this.baseUrl}/api/app-removal-monitor/check/${encodeURIComponent(bundleId)}`, {
      method: 'POST',
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to check app');
    }
    return res.json();
  }

  /**
   * 手动检查所有 App
   */
  async checkAllApps(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/app-removal-monitor/check-all`, {
      method: 'POST',
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to check all apps');
    }
  }

  /**
   * 获取 App 下架监控器状态
   */
  async getAppRemovalMonitorStatus(): Promise<{ enabled: boolean; isRunning?: boolean; checkInterval?: number }> {
    const res = await fetch(`${this.baseUrl}/api/app-removal-monitor/status`);
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to get monitor status');
    }
    return res.json();
  }

  // ============================================
  // 目标包监控 API（4.0 版本新增）
  // ============================================

  /**
   * 从明道云同步目标包列表
   */
  async syncTargetApps(days?: number): Promise<{ synced: number; updated: number }> {
    const res = await fetch(`${this.baseUrl}/api/target-app-monitor/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ days }),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to sync target apps');
    }
    return res.json();
  }

  /**
   * 获取目标包列表（带筛选和分页）
   */
  async getTargetApps(params: {
    daysRange?: number;
    statusFilter?: string;
    search?: string;
    pageIndex: number;
    pageSize: number;
  }): Promise<{ apps: any[]; total: number }> {
    const queryParams = new URLSearchParams();
    if (params.daysRange !== undefined) queryParams.append('daysRange', params.daysRange.toString());
    if (params.statusFilter) queryParams.append('statusFilter', params.statusFilter);
    if (params.search) queryParams.append('search', params.search);
    queryParams.append('pageIndex', params.pageIndex.toString());
    queryParams.append('pageSize', params.pageSize.toString());

    const res = await fetch(`${this.baseUrl}/api/target-app-monitor/list?${queryParams.toString()}`);
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to get target apps');
    }
    return res.json();
  }

  /**
   * 获取目标包统计数据
   */
  async getTargetAppStats(): Promise<{
    total: number;
    available: number;
    removed: number;
    unknown: number;
    offline: number;
    clearKeyword: number;
    clearRank: number;
  }> {
    const res = await fetch(`${this.baseUrl}/api/target-app-monitor/stats`);
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to get target app stats');
    }
    return res.json();
  }

  /**
   * 手动检查单个目标包
   */
  async checkTargetApp(appId: string): Promise<{ appId: string; status: string; checked_at: string }> {
    const res = await fetch(`${this.baseUrl}/api/target-app-monitor/check/${encodeURIComponent(appId)}`, {
      method: 'POST',
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to check target app');
    }
    return res.json();
  }

  /**
   * 手动检查所有目标包
   */
  async checkAllTargetApps(): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${this.baseUrl}/api/target-app-monitor/check-all`, {
      method: 'POST',
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to check all target apps');
    }
    return res.json();
  }

  /**
   * 同步并检查目标包（一键操作）
   */
  async syncAndCheckTargetApps(days?: number): Promise<{ 
    success: boolean; 
    message: string; 
    syncResult: { synced: number; updated: number } 
  }> {
    const res = await fetch(`${this.baseUrl}/api/target-app-monitor/sync-and-check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ days }),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to sync and check target apps');
    }
    return res.json();
  }

  /**
   * 获取目标包监控器状态
   */
  async getTargetAppMonitorStatus(): Promise<{
    enabled: boolean;
    isRunning?: boolean;
    config?: any;
  }> {
    const res = await fetch(`${this.baseUrl}/api/target-app-monitor/status`);
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to get monitor status');
    }
    return res.json();
  }

  /**
   * 更新目标包监控配置
   */
  async updateTargetAppMonitorConfig(config: {
    checkIntervalHours?: number;
    autoCheckEnabled?: boolean;
    apiTimeout?: number;
    retryCount?: number;
    concurrency?: number;
  }): Promise<{ success: boolean; message: string; config: any }> {
    const res = await fetch(`${this.baseUrl}/api/target-app-monitor/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to update config');
    }
    return res.json();
  }

  // ============================================================================
  // App 关联对比 API（5.0 版本新增）
  // ============================================================================

  /**
   * 同步关联关系
   */
  async syncAppRelations(): Promise<{ synced: number }> {
    const res = await fetch(`${this.baseUrl}/api/app-comparison/sync-relations`, {
      method: 'POST',
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to sync relations');
    }
    const data = await res.json();
    return data.data;
  }

  /**
   * 单独同步某条记录的关联关系
   */
  async syncSingleApp(bundleId: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${this.baseUrl}/api/app-comparison/sync-single`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ bundleId }),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to sync single app');
    }
    const data = await res.json();
    return data;
  }

  /**
   * 获取关联对比列表
   */
  async getComparisonList(): Promise<AppComparisonRecord[]> {
    const res = await fetch(`${this.baseUrl}/api/app-comparison/list`);
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to get comparison list');
    }
    const data = await res.json();
    return data.data;
  }

  /**
   * 获取关联对比统计数据
   */
  async getComparisonStats(): Promise<AppComparisonStats> {
    const res = await fetch(`${this.baseUrl}/api/app-comparison/stats`);
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to get comparison stats');
    }
    const data = await res.json();
    return data.data;
  }

  /**
   * 刷新单行数据（我的包 + 目标包）
   */
  async refreshComparisonRow(bundleId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/app-comparison/refresh/${encodeURIComponent(bundleId)}`, {
      method: 'POST',
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to refresh row');
    }
  }

  /**
   * 批量检查所有包（我的包 + 目标包）
   */
  async checkAllComparison(): Promise<{ checked: number }> {
    const res = await fetch(`${this.baseUrl}/api/app-comparison/check-all`, {
      method: 'POST',
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to check all');
    }
    const data = await res.json();
    return data.data || { checked: 0 };
  }

  /**
   * 获取全局同步状态（5.1 版本新增）
   */
  async getComparisonSyncStatus(): Promise<{
    myApps: {
      lastSyncTime: string | null;
      syncHostname: string | null;
      lastCheckTime: string | null;
      checkHostname: string | null;
    };
    targetApps: {
      lastSyncTime: string | null;
      syncHostname: string | null;
      lastCheckTime: string | null;
      checkHostname: string | null;
    };
  }> {
    const res = await fetch(`${this.baseUrl}/api/app-comparison/sync-status`);
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to get sync status');
    }
    const data = await res.json();
    return data.data;
  }

  // ============================================================================
  // 下架排查 API (6.0 版本新增)
  // ============================================================================

  /**
   * 触发下架排查数据同步
   */
  async syncRemovalInvestigation(): Promise<{
    syncId: string;
    status: string;
    stats: {
      totalRemovedApps: number;
      syncedApps: number;
      newApps: number;
      totalOperations: number;
      newOperations: number;
    };
  }> {
    const res = await fetch(`${this.baseUrl}/api/removal-investigation/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to sync removal investigation data');
    }
    const data = await res.json();
    return data.data;
  }

  /**
   * 增量同步下架排查数据（只同步新增的App）
   */
  async syncRemovalInvestigationIncremental(): Promise<{
    syncId: string;
    status: string;
    stats: {
      totalRemovedApps: number;
      syncedApps: number;
      newApps: number;
      totalOperations: number;
      newOperations: number;
    };
  }> {
    const res = await fetch(`${this.baseUrl}/api/removal-investigation/sync-incremental`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to sync removal investigation data incrementally');
    }
    const data = await res.json();
    return data.data;
  }

  /**
   * 获取下架App列表（分页+筛选）
   */
  async getRemovalInvestigationApps(
    page: number = 1,
    pageSize: number = 20,
    search?: string,
    filters?: any
  ): Promise<{
    apps: any[];
    total: number;
    page: number;
    pageSize: number;
    availableFilters?: {
      accountSources: string[];
      regions: string[];
      adVersions: string[];
      operators: string[];
      locations: string[];
    };
  }> {
    const params = new URLSearchParams({
      page: page.toString(),
      pageSize: pageSize.toString(),
    });
    if (search) {
      params.append('search', search);
    }
    
    // 添加筛选参数
    if (filters) {
      params.append('filters', JSON.stringify(filters));
    }
    
    const res = await fetch(`${this.baseUrl}/api/removal-investigation/apps?${params.toString()}`);
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to get removed apps');
    }
    const data = await res.json();
    return data.data;
  }

  /**
   * 获取App的操作时间线
   */
  async getRemovalInvestigationTimeline(bundleId: string): Promise<any[]> {
    const res = await fetch(
      `${this.baseUrl}/api/removal-investigation/apps/${encodeURIComponent(bundleId)}/timeline`
    );
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to get app timeline');
    }
    const data = await res.json();
    return data.data;
  }

  /**
   * 获取同步状态
   */
  async getRemovalInvestigationSyncStatus(): Promise<{
    lastSyncTime: string | null;
    isRunning: boolean;
    lastSyncStatus: 'COMPLETED' | 'FAILED' | 'IN_PROGRESS' | null;
    lastSyncStats: {
      totalRemovedApps: number;
      syncedApps: number;
      newApps: number;
      totalOperations: number;
      newOperations: number;
    } | null;
  }> {
    const res = await fetch(`${this.baseUrl}/api/removal-investigation/sync-status`);
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to get sync status');
    }
    const data = await res.json();
    return data.data;
  }

  /**
   * 获取账号详情（该账号下的所有App和操作记录）
   */
  async getAccountDetail(accountEmail: string): Promise<{
    apps: Array<{
      id: string;
      bundleId: string;
      appName: string;
      isRemoved: boolean;
      removalTime: string | null;
      survivalDays: number | null;
      totalOperations: number;
      keywordSearchUrl: string | null;
      targetPackageUrl: string | null;
      qimaiUrl: string | null;
    }>;
    operations: Array<{
      id: string;
      bundleId: string;
      appName: string;
      operationType: 'RELEASE' | 'UPDATE';
      operationTime: string;
      version: string | null;
      adVersion: string | null;
      operator: string | null;
      location: string | null;
    }>;
  }> {
    const res = await fetch(
      `${this.baseUrl}/api/removal-investigation/accounts/${encodeURIComponent(accountEmail)}/detail`
    );
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to get account detail');
    }
    const data = await res.json();
    return data.data;
  }

  /**
   * 获取账号分组列表（账号视图）
   */
  async getAccountGroupList(
    page: number = 1,
    pageSize: number = 20,
    search?: string,
    filters?: any
  ): Promise<{
    accounts: Array<{
      accountEmail: string;
      accountInfo: any;
      totalApps: number;
      removedApps: number;
      activeApps: number;
      latestRemovalTime: string | null;
      accountSurvivalDays: number | null;
    }>;
    total: number;
  }> {
    const params = new URLSearchParams({
      page: page.toString(),
      pageSize: pageSize.toString(),
    });
    if (search) {
      params.append('search', search);
    }
    if (filters) {
      params.append('filters', JSON.stringify(filters));
    }

    const res = await fetch(`${this.baseUrl}/api/removal-investigation/account-groups?${params.toString()}`);
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to get account groups');
    }
    const data = await res.json();
    return data.data;
  }

  /**
   * 导出下架App数据到Excel
   */
  async exportRemovalInvestigationData(params: {
    search?: string;
    filters?: any;
  }): Promise<any[]> {
    const res = await fetch(`${this.baseUrl}/api/removal-investigation/export`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });
    
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to export data');
    }
    
    const result = await res.json();
    return result.data;
  }
}

// 单例实例
export const agentClient = new AgentClient(
  process.env.NEXT_PUBLIC_AGENT_URL || 'http://localhost:3000'
);

