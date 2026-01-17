// 与 Agent 后端保持一致的类型定义

// ============================================================================
// 用户角色和权限相关类型（6.1 版本新增）
// ============================================================================

export type UserRole = 'admin' | 'operator';

export interface UserProfile {
  id: string;
  email: string;
  full_name?: string;
  role: UserRole;
  enable_app_removal_monitor?: boolean;  // 下架状态自动监控（操作员专用）
  enable_target_app_monitor?: boolean;   // 目标包自动监控（操作员专用）
  created_at?: string;
  updated_at?: string;
}

// 角色权限配置
export const ROLE_CONFIG: Record<UserRole, {
  label: string;
  description: string;
  allowedPages: string[];  // 允许访问的页面路径
}> = {
  admin: {
    label: '管理员',
    description: '拥有全部功能权限',
    allowedPages: ['*'],  // * 表示所有页面
  },
  operator: {
    label: '操作员',
    description: '只能访问发布相关功能',
    allowedPages: [
      '/overview',          // 发布看板
      '/projects',          // 发布操作
      '/releases',          // 发布历史
      '/settings',          // 设置
    ],
  },
};

export interface GlobalConfig {
  // 可选的默认值，新项目可以继承这些值
  defaultAppleId?: string;
  defaultTeamId?: string;
  defaultItcTeamId?: string;
  
  // 监控服务开关（多台机器运行 Agent 时，建议只在一台开启）
  enableReviewMonitor?: boolean;        // 启用审核状态自动监控（每小时），默认 true
  enableAppRemovalMonitor?: boolean;    // 启用下架状态自动监控（每 12 小时），默认 true
  enableTargetAppMonitor?: boolean;     // 启用目标包监控（每小时），默认 true
}

export interface Project {
  id: string;
  name: string;
  path: string;
  bundleId: string;
  workspace?: string;
  project?: string;
  scheme: string;
  useMatch: boolean;
  currentVersion?: string;
  currentBuild?: string;
  createdAt: string;
  
  // 项目专属的 Apple 账户信息（可选，可以在创建项目后配置）
  appleId?: string;
  teamId?: string;
  itcTeamId?: string;
  
  // API Key 认证（系统只支持 API Key 认证）
  apiKeyId?: string;
  apiKeyIssuerId?: string;
  apiKeyContent?: string;
}

export interface ProjectDetectionResult {
  valid: boolean;
  error?: string;
  detected?: {
    workspace?: string;
    project?: string;
    schemes: string[];
    bundleId: string;
    currentVersion: string;
    currentBuild: string;
    displayName?: string;
    hasFastlane: boolean;
    hasEnvFile: boolean;
  };
}

export type DeployType = 'beta' | 'release';
export type TaskStatus = 'pending' | 'running' | 'success' | 'failed' | 'cancelled';

export interface DeployStep {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  startTime?: number;
  endTime?: number;
  duration?: number;
}

export interface Task {
  id: string;
  projectId: string;
  type: DeployType;
  status: TaskStatus;
  steps: DeployStep[];
  logs: string[];
  error?: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  options?: {
    isFirstRelease?: boolean;
    userId?: string;
  };
}

export interface Release {
  id: string;
  project_id: string;
  bundle_id: string;
  app_name: string;
  version: string;
  build_number: string;
  is_first_release: boolean;
  apple_id?: string;
  team_id?: string;
  itc_team_id?: string;
  api_key_id?: string;
  api_key_issuer_id?: string;
  api_key_content?: string;
  submitted_at: string;
  completed_at?: string;
  duration?: number;
  task_id?: string;
  deployed_by: string;
  // 审核状态监控（新增）
  review_status?: string;
  last_checked_at?: string;
  error_count?: number;
  error_message?: string;
  metadata?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
  // 监控开关（7.1 版本新增）
  monitor_enabled?: boolean;
  // JOIN 查询的用户信息
  user?: {
    email?: string;
    raw_user_meta_data?: {
      full_name?: string;
    };
  };
}

// 审核状态枚举
export enum ReviewStatus {
  WAITING_FOR_REVIEW = 'WAITING_FOR_REVIEW',
  IN_REVIEW = 'IN_REVIEW',
  READY_FOR_SALE = 'READY_FOR_SALE',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  METADATA_REJECTED = 'METADATA_REJECTED',
  REMOVED_FROM_SALE = 'REMOVED_FROM_SALE',
}

// 审核状态显示配置
export const REVIEW_STATUS_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  WAITING_FOR_REVIEW: { label: '等待审核', icon: '⏳', color: 'gray' },
  IN_REVIEW: { label: '审核中', icon: '🔍', color: 'blue' },
  READY_FOR_SALE: { label: '已上架', icon: '✅', color: 'green' },
  APPROVED: { label: '审核通过', icon: '✅', color: 'green' },
  REJECTED: { label: '被拒绝', icon: '❌', color: 'red' },
  METADATA_REJECTED: { label: '元数据被拒', icon: '⚠️', color: 'yellow' },
  REMOVED_FROM_SALE: { label: '已下架', icon: '🚫', color: 'gray' },
};

export interface SSELogEvent {
  type: 'log';
  content: string;
  timestamp: number;
}

export interface SSEProgressEvent {
  type: 'progress';
  step: DeployStep;
  timestamp: number;
}

export interface SSEStatusEvent {
  type: 'status';
  status: TaskStatus;
  timestamp: number;
}

export interface SSECompleteEvent {
  type: 'complete';
  task: Task;
  timestamp: number;
}

export type SSEEvent = SSELogEvent | SSEProgressEvent | SSEStatusEvent | SSECompleteEvent;

export interface ProjectsQueryParams {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: 'name' | 'createdAt' | 'bundleId';
  sortOrder?: 'asc' | 'desc';
}

export interface ProjectsResponse {
  projects: Project[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

// ============================================================================
// App 下架监控相关类型（3.5 版本新增）
// ============================================================================

// App 状态枚举
export enum AppStatus {
  AVAILABLE = 'AVAILABLE',  // 在售
  REMOVED = 'REMOVED',      // 下架
  UNKNOWN = 'UNKNOWN',      // 未知（检查失败）
}

// App 下架监控记录
export interface AppMonitorRecord {
  id: string;
  bundle_id: string;
  app_name: string;
  app_store_id?: string;
  apple_account_id?: string;
  apple_account_name?: string;  // 开发者账号名称
  hap_product_row_id?: string;
  current_status: AppStatus;
  is_monitoring: boolean;
  last_checked_at?: string;
  check_error_count: number;
  last_error_message?: string;
  removed_at?: string;
  removed_reason?: string;
  synced_from_hap_at?: string;
  created_at?: string;
  updated_at?: string;
}

// 下架监控统计信息
export interface AppMonitorStats {
  total: number;
  available: number;
  removed: number;
  unknown: number;
}

// App 状态显示配置
export const APP_STATUS_CONFIG: Record<AppStatus, { label: string; icon: string; color: string }> = {
  [AppStatus.AVAILABLE]: { label: '在售', icon: '🟢', color: 'green' },
  [AppStatus.REMOVED]: { label: '下架', icon: '🔴', color: 'red' },
  [AppStatus.UNKNOWN]: { label: '未知', icon: '⚪', color: 'gray' },
};

// 按账号分组的 App 监控数据（3.5 版本新增）
export interface AccountGroup {
  accountId: string | null;           // 账号 ID（null 表示未关联账号）
  accountName: string;                // 账号名称
  accountEmail?: string;              // 账号邮箱（如果有）
  apps: AppMonitorRecord[];           // 该账号下的所有 App
  stats: {
    total: number;
    available: number;
    removed: number;
    unknown: number;
  };
  lastCheckedAt?: string;             // 该账号下最后检查时间
}

// ============================================================================
// App 关联对比相关类型（5.0 版本新增）
// ============================================================================

/**
 * 关联对比记录
 */
export interface AppComparisonRecord {
  // 我的包信息
  myApp: {
    bundleId: string;
    appName: string;
    appId: string;
    accountName: string;
    accountEmail: string;
    status: AppStatus;
    lastChecked: string;
    umengId?: string;
    isClearKeyword?: boolean;  // 清词状态（7.0 版本新增）
    isClearRank?: boolean;     // 清榜状态（7.0 版本新增）
  };
  // 目标包信息（可能为空）
  targetApp: {
    appId: string;
    appName: string;
    note: string;
    status: string;
    isOffline: boolean;
    offlineDate?: string;
    qimaiLink?: string;
  } | null;
  // 友盟数据
  todayNew: number | null;
  yesterdayNew: number | null;
  umengAppName: string | null;  // 友盟应用名称（5.0 版本新增）
  // 操作链接
  keywordSearchUrl: string;
  qimaiUrl: string;
  appStoreUrl: string;
  umengDataUrl?: string;
}

/**
 * 关联对比统计数据
 */
export interface AppComparisonStats {
  myAppTotal: number;
  myAppAvailable: number;
  myAppRemoved: number;
  linkedCount: number;
  targetAppAvailable: number;
  targetAppRemoved: number;
}

// ============================================================================
// 下架排查相关类型（6.0 版本新增）
// ============================================================================

/**
 * 下架App记录（含账号信息）
 */
export interface RemovedAppRecord {
  id: string;
  bundleId: string;
  appName: string;
  appId: string | null;
  accountName: string | null;  // 开发者账号邮箱
  removalTime: string | null;
  totalOperations: number;
  firstReleaseTime: string | null;
  lastUpdateTime: string | null;
  survivalDays: number | null;
  keywordSearchUrl: string | null;  // ⭐ 关键词查询链接（6.0 版本新增）
  targetPackageUrl: string | null;  // ⭐ 目标包链接（6.0 版本新增）
  qimaiUrl: string | null;          // ⭐ 七麦链接（6.0 版本新增）
  createdAt: string;
  updatedAt: string;
  
  // 账号详细信息
  accountInfo?: {
    accountEmail: string;                  // 账号邮箱
    accountSource: string | null;          // 账号来源名称（如"代理11号"）
    accountSourceType: string[] | null;    // 账号来源类型（如["账号提供者", "经常合作"]）
    accountStatus: string | null;          // 账号状态（使用中/被关停/回收等）
    accountExpiryDate: string | null;      // 账号到期时间
    accountClosedDate: string | null;      // 账号关停时间（苹果官方关停时间）
    pendingCloseDate: string | null;       // 标记为等待关停时间（业务关停时间）⭐ 优先使用
    accountRegion: string | null;          // 注册地
    accountQualityIssues: string[] | null; // 质量标记（如["秒挂过", "没开广告被下架"]）
    accountProductCount: number | null;    // 该账号下产品总数
    registrationDate: string | null;       // 账号注册日期（账号开通时间）
  };
}

/**
 * 操作记录
 */
export interface OperationRecord {
  id: string;
  bundleId: string;
  operationType: 'RELEASE' | 'UPDATE';
  operationTime: string;
  appName: string | null;
  version: string | null;
  adVersion: string | null;
  operator: string | null;
  location: string | null;
  status: string | null;
  releaseType: string | null;
  remarks: string | null;
  hapSourceTable: 'production_release' | 'update_task';
}

