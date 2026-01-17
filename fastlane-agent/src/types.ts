// 全局配置 - 只保留可选的默认值
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

// 项目配置
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

// 项目检测结果
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

// 发布类型
export type DeployType = 'beta' | 'release';

// 任务状态
export type TaskStatus = 'pending' | 'running' | 'success' | 'failed' | 'cancelled';

// 发布步骤
export interface DeployStep {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  startTime?: number;
  endTime?: number;
  duration?: number;
}

// 任务
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
  // 新增：保存执行参数
  options?: {
    isFirstRelease?: boolean;
    userId?: string;  // 发布人员 ID（来自 Supabase Auth）
  };
}

// 发布记录
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

// 判断是否为最终状态
export const isFinalReviewStatus = (status: string): boolean => {
  return [
    ReviewStatus.READY_FOR_SALE,
    ReviewStatus.APPROVED,
    ReviewStatus.REJECTED,
    ReviewStatus.METADATA_REJECTED,
    ReviewStatus.REMOVED_FROM_SALE,
  ].includes(status as ReviewStatus);
};

// 配置文件结构
export interface ConfigFile {
  global: GlobalConfig;
  projects: Project[];
}

// SSE 事件类型
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
  apple_account_id?: string;        // 明道云账号 rowid（旧字段，保留兼容）
  apple_account_name?: string;      // 开发者账号名称（显示值）
  hap_product_row_id?: string;      // 明道云产品 rowid
  local_apple_account_id?: string;  // 本地账号 UUID（新增，关联 apple_accounts 表）
  current_status: AppStatus;
  is_monitoring: boolean;
  last_checked_at?: string;
  check_error_count: number;
  last_error_message?: string;
  removed_at?: string;
  removed_reason?: string;
  synced_from_hap_at?: string;
  qimai_url?: string;               // 七麦链接
  created_at?: string;
  updated_at?: string;
}

// 明道云 App 产品信息
export interface HapAppProduct {
  bundleId: string;
  appName: string;
  appId?: string;       // App Store ID（7.0 版本新增）
  accountId: string;
  accountName: string;  // 开发者账号名称（显示值）
  rowId: string;
  qimaiUrl?: string;    // 七麦链接
  umengId?: string;     // 友盟 ID（5.0 版本新增）
  umengDataUrl?: string; // 友盟数据链接（5.0 版本新增）
}

// 下架监控统计信息
export interface AppMonitorStats {
  total: number;
  available: number;
  removed: number;
  unknown: number;
}

// 按账号分组的 App 监控数据（新增）
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

