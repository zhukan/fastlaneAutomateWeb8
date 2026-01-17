-- ============================================================================
-- Fastlane 自动发布系统 - 完整数据库初始化脚本
-- ============================================================================
--
-- 版本：7.2 (完整功能版本)
-- 创建日期：2026-01-07
-- 用途：全新部署时使用，一次性创建所有表和视图
--
-- 使用方法：
-- 1. 登录 Supabase Dashboard
-- 2. 进入 SQL Editor
-- 3. 执行本脚本
--
-- 功能包含：
-- - Part 1: UUID 扩展
-- - Part 2: projects 表（项目管理）
-- - Part 3: releases 表（发布历史）
-- - Part 4: global_configs 表（全局配置）
-- - Part 5: app_removal_monitor 表（下架监控 - 我的应用）
-- - Part 6: apple_accounts 表（开发者账号缓存）
-- - Part 7: app_removal_monitor_history 表（历史归档）
-- - Part 8: target_apps 表（目标包监控 - 竞品应用）
-- - Part 9: target_app_history 表（目标包状态变更历史）
-- - Part 10: ri_developer_accounts 表（下架排查 - 开发者账号）
-- - Part 11: removed_apps 表（下架排查 - 已下架App）
-- - Part 12: operation_records 表（下架排查 - 操作记录）
-- - Part 13: removal_investigation_sync_logs 表（下架排查 - 同步日志）
-- - Part 14: app_removal_analysis 表（下架原因分析）
-- - Part 15: user_profiles 表（用户配置和角色 - RBAC v6.1）
-- - Part 16: qimai_monitoring_logs 表（七麦监控日志 v7.0）
-- - Part 17: system_configs 表（第三方服务配置 v7.1）
-- - Part 18: 视图
-- - Part 19: 辅助函数和触发器
-- - Part 20: RLS 策略
-- - Part 21: 索引
--
-- ============================================================================


-- ============================================================================
-- Part 1: UUID 扩展
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ============================================================================
-- Part 2: projects 表（项目管理）
-- ============================================================================

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  bundle_id TEXT,
  workspace TEXT,
  project TEXT,
  scheme TEXT,
  use_match BOOLEAN DEFAULT false,
  apple_id TEXT,
  team_id TEXT,
  itc_team_id TEXT,
  app_specific_password TEXT,
  status TEXT DEFAULT 'active',
  last_deployed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE projects IS '项目配置表';
COMMENT ON COLUMN projects.name IS '项目名称';
COMMENT ON COLUMN projects.path IS '项目路径（唯一）';
COMMENT ON COLUMN projects.bundle_id IS 'Bundle ID';


-- ============================================================================
-- Part 3: releases 表（发布历史）
-- ============================================================================

CREATE TABLE IF NOT EXISTS releases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  bundle_id TEXT NOT NULL,
  app_name TEXT,
  version TEXT NOT NULL,
  build_number TEXT NOT NULL,
  is_first_release BOOLEAN DEFAULT false,
  apple_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  itc_team_id TEXT,
  api_key_id TEXT,
  api_key_issuer_id TEXT,
  api_key_content TEXT,
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  duration INTEGER,
  task_id TEXT,
  deployed_by TEXT,
  review_status TEXT DEFAULT 'WAITING_FOR_REVIEW',
  review_status_updated_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE releases IS '发布历史记录表';
COMMENT ON COLUMN releases.review_status IS '审核状态：WAITING_FOR_REVIEW, IN_REVIEW, PENDING_DEVELOPER_RELEASE, READY_FOR_SALE, REJECTED, etc.';


-- ============================================================================
-- Part 4: global_configs 表（全局配置）
-- ============================================================================

CREATE TABLE IF NOT EXISTS global_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE global_configs IS '全局配置表';

-- 插入明道云配置（如果不存在）
INSERT INTO global_configs (key, value, description)
VALUES (
  'hap_api',
  '{
    "appKey": "",
    "sign": "",
    "worksheetProducts": "",
    "worksheetAccounts": "",
    "worksheetProductionReleases": "",
    "appKeyProductionReleases": "",
    "signProductionReleases": ""
  }'::jsonb,
  '明道云 API 配置'
) ON CONFLICT (key) DO NOTHING;


-- ============================================================================
-- Part 5: app_removal_monitor 表（下架监控 - 我的应用）
-- ============================================================================

CREATE TABLE IF NOT EXISTS app_removal_monitor (
  -- 主键
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- App 基本信息（从明道云同步）
  bundle_id TEXT UNIQUE NOT NULL,
  app_name TEXT NOT NULL,

  -- 关联账号
  apple_account_id TEXT,
  apple_account_name TEXT,
  local_apple_account_id UUID,
  hap_product_row_id TEXT,

  -- 监控状态
  current_status TEXT NOT NULL DEFAULT 'AVAILABLE',
  is_monitoring BOOLEAN DEFAULT true,

  -- 检查记录
  last_checked_at TIMESTAMP WITH TIME ZONE,
  check_error_count INTEGER DEFAULT 0,
  last_error_message TEXT,

  -- 下架记录
  removed_at TIMESTAMP WITH TIME ZONE,

  -- 清词/清榜状态（v7.2 新增）
  is_clear_rank BOOLEAN DEFAULT false,
  is_clear_keyword BOOLEAN DEFAULT false,

  -- Hostname 追踪
  sync_hostname TEXT,
  check_hostname TEXT,

  -- 时间戳
  synced_from_hap_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE app_removal_monitor IS 'App 下架监控表（我的应用）';
COMMENT ON COLUMN app_removal_monitor.bundle_id IS 'Bundle ID（唯一标识）';
COMMENT ON COLUMN app_removal_monitor.app_name IS 'App 名称';
COMMENT ON COLUMN app_removal_monitor.apple_account_id IS '明道云开发者账号 rowid';
COMMENT ON COLUMN app_removal_monitor.apple_account_name IS '开发者账号名称（显示值）';
COMMENT ON COLUMN app_removal_monitor.local_apple_account_id IS '关联的本地账号ID（指向 apple_accounts 表）';
COMMENT ON COLUMN app_removal_monitor.current_status IS '当前状态：AVAILABLE / REMOVED / UNKNOWN';
COMMENT ON COLUMN app_removal_monitor.is_monitoring IS '是否启用监控';
COMMENT ON COLUMN app_removal_monitor.removed_at IS '首次检测到下架的时间';
COMMENT ON COLUMN app_removal_monitor.is_clear_rank IS '清榜状态（由七麦自动监控系统维护 v7.2）';
COMMENT ON COLUMN app_removal_monitor.is_clear_keyword IS '清词状态（由七麦自动监控系统维护 v7.2）';
COMMENT ON COLUMN app_removal_monitor.sync_hostname IS '执行明道云同步的机器 hostname';
COMMENT ON COLUMN app_removal_monitor.check_hostname IS '执行 App Store 状态检查的机器 hostname';


-- ============================================================================
-- Part 6: apple_accounts 表（开发者账号本地缓存）
-- ============================================================================

CREATE TABLE IF NOT EXISTS apple_accounts (
  -- 主键
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- 明道云关联
  hap_account_id TEXT UNIQUE NOT NULL,
  account_name TEXT NOT NULL,

  -- Apple 开发者账号信息
  apple_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  api_key_id TEXT NOT NULL,
  api_key_issuer_id TEXT NOT NULL,
  api_key_content TEXT NOT NULL,

  -- 可选字段
  itc_team_id TEXT,

  -- 同步时间
  synced_from_hap_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE apple_accounts IS 'Apple 开发者账号缓存表（从明道云同步）';
COMMENT ON COLUMN apple_accounts.hap_account_id IS '明道云账号 rowid（唯一标识）';
COMMENT ON COLUMN apple_accounts.account_name IS '账号名称（用于显示）';
COMMENT ON COLUMN apple_accounts.api_key_content IS 'API 密钥文件内容（.p8 格式）';

-- 添加外键关联
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'app_removal_monitor_local_apple_account_id_fkey'
  ) THEN
    ALTER TABLE app_removal_monitor
    ADD CONSTRAINT app_removal_monitor_local_apple_account_id_fkey
    FOREIGN KEY (local_apple_account_id)
    REFERENCES apple_accounts(id);
  END IF;
END $$;


-- ============================================================================
-- Part 7: app_removal_monitor_history 表（历史归档）
-- ============================================================================

CREATE TABLE IF NOT EXISTS app_removal_monitor_history (
  -- 主键
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- 原始数据（保留完整快照）
  bundle_id TEXT NOT NULL,
  app_name TEXT NOT NULL,

  -- 账号信息
  apple_account_id TEXT,
  apple_account_name TEXT,
  local_apple_account_id UUID,

  -- 明道云关联
  hap_product_row_id TEXT,

  -- 监控状态（归档时的快照）
  last_known_status TEXT NOT NULL,
  was_monitoring BOOLEAN DEFAULT true,

  -- 时间戳
  last_checked_at TIMESTAMP WITH TIME ZONE,
  removed_at TIMESTAMP WITH TIME ZONE,
  last_synced_from_hap_at TIMESTAMP WITH TIME ZONE,

  -- 归档信息
  archived_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  archived_reason TEXT,

  -- 错误信息（如果有）
  check_error_count INTEGER DEFAULT 0,
  last_error_message TEXT,

  -- 元数据
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE app_removal_monitor_history IS 'App下架监控历史归档表（保存从明道云移除的记录）';
COMMENT ON COLUMN app_removal_monitor_history.bundle_id IS 'Bundle ID';
COMMENT ON COLUMN app_removal_monitor_history.app_name IS 'App名称';
COMMENT ON COLUMN app_removal_monitor_history.last_known_status IS '归档时的最后已知状态';
COMMENT ON COLUMN app_removal_monitor_history.was_monitoring IS '归档时是否在监控中';
COMMENT ON COLUMN app_removal_monitor_history.removed_at IS '如果曾被检测下架，记录下架时间';
COMMENT ON COLUMN app_removal_monitor_history.archived_at IS '归档时间';
COMMENT ON COLUMN app_removal_monitor_history.archived_reason IS '归档原因：removed_from_hap=从明道云移除, manual=手动归档';


-- ============================================================================
-- Part 8: target_apps 表（目标包监控 - 竞品应用）
-- ============================================================================

CREATE TABLE IF NOT EXISTS target_apps (
  -- 主键
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- 明道云关联
  hap_row_id TEXT UNIQUE NOT NULL,

  -- App 基本信息
  app_name TEXT NOT NULL,
  app_id TEXT,                    -- Apple App ID
  app_store_link TEXT,
  qimai_link TEXT,                -- 七麦链接
  keyword_search_link TEXT,       -- 关键词查询链接

  -- 监控设置
  is_monitoring BOOLEAN DEFAULT true,

  -- 当前状态
  current_status TEXT DEFAULT 'unknown',  -- available / removed / unknown
  is_offline BOOLEAN DEFAULT false,
  offline_date TIMESTAMP WITH TIME ZONE,

  -- 清词清榜状态（从七麦同步）
  is_clear_keyword BOOLEAN DEFAULT false,
  is_clear_rank BOOLEAN DEFAULT false,

  -- 来源信息
  source TEXT,
  source_screenshot TEXT,
  remark TEXT,

  -- 检查记录
  last_checked_at TIMESTAMP WITH TIME ZONE,
  check_error_count INTEGER DEFAULT 0,
  last_error_message TEXT,

  -- 手动修改标记（防止同步覆盖）
  manual_status_override BOOLEAN DEFAULT false,

  -- Hostname 追踪
  sync_hostname TEXT,
  check_hostname TEXT,

  -- 时间戳
  synced_from_hap_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE target_apps IS '目标包监控表（竞品应用）';
COMMENT ON COLUMN target_apps.hap_row_id IS '明道云记录 ID';
COMMENT ON COLUMN target_apps.current_status IS '当前状态：available（在架）、removed（下架）、unknown（未知）';
COMMENT ON COLUMN target_apps.manual_status_override IS '是否手动修改过状态（防止同步覆盖）';
COMMENT ON COLUMN target_apps.sync_hostname IS '执行明道云同步的机器 hostname';
COMMENT ON COLUMN target_apps.check_hostname IS '执行 App Store 状态检查的机器 hostname';
COMMENT ON COLUMN target_apps.is_clear_keyword IS '清词状态（v7.0）';
COMMENT ON COLUMN target_apps.is_clear_rank IS '清榜状态（v7.0）';


-- ============================================================================
-- Part 9: target_app_history 表（目标包状态变更历史）
-- ============================================================================

CREATE TABLE IF NOT EXISTS target_app_history (
  -- 主键
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- 关联目标包
  target_app_id UUID REFERENCES target_apps(id) ON DELETE CASCADE,

  -- 变更类型
  change_type TEXT NOT NULL,      -- offline / online / monitoring_enabled / monitoring_disabled

  -- 状态信息
  old_status TEXT,
  new_status TEXT,
  offline_date TIMESTAMP WITH TIME ZONE,

  -- 检查者
  checked_by TEXT DEFAULT 'system',  -- system / manual / user_id

  -- 时间戳
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE target_app_history IS '目标包状态变更历史';
COMMENT ON COLUMN target_app_history.change_type IS '变更类型：offline（下架）、online（上架）、monitoring_enabled、monitoring_disabled';


-- ============================================================================
-- Part 10: ri_developer_accounts 表（下架排查 - 开发者账号）
-- ============================================================================
-- 说明：存储从明道云"苹果开发者账号"表同步的账号信息
-- 与 apple_accounts 表的区别：
--   - apple_accounts: 存储实际可操作的账号（含API密钥）
--   - ri_developer_accounts: 仅用于下架排查的账号信息展示

CREATE TABLE IF NOT EXISTS ri_developer_accounts (
  -- 主键
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- 明道云关联
  hap_account_id TEXT UNIQUE NOT NULL,

  -- 账号基本信息
  account_email TEXT,
  account_name TEXT,
  account_source TEXT,

  -- 注册信息
  registration_date DATE,

  -- 账号详细信息
  account_status TEXT,
  account_source_type TEXT[],
  account_expiry_date TIMESTAMP WITH TIME ZONE,
  account_closed_date TIMESTAMP WITH TIME ZONE,
  pending_close_date TIMESTAMP WITH TIME ZONE,
  account_region TEXT,
  account_quality_issues TEXT[],
  account_product_count INTEGER,

  -- 同步时间戳
  synced_from_hap_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE ri_developer_accounts IS '下架排查 - 开发者账号信息表（从明道云同步）';
COMMENT ON COLUMN ri_developer_accounts.hap_account_id IS '明道云账号 rowid（唯一标识）';
COMMENT ON COLUMN ri_developer_accounts.account_email IS '开发者账号邮箱';
COMMENT ON COLUMN ri_developer_accounts.account_source IS '账号来源（如：公司/个人/代理）';
COMMENT ON COLUMN ri_developer_accounts.registration_date IS '账号注册日期';
COMMENT ON COLUMN ri_developer_accounts.account_status IS '账号状态（使用中/被关停/回收等）';
COMMENT ON COLUMN ri_developer_accounts.account_source_type IS '账号来源类型（如：["账号提供者", "经常合作"]）';
COMMENT ON COLUMN ri_developer_accounts.account_expiry_date IS '账号到期时间';
COMMENT ON COLUMN ri_developer_accounts.account_closed_date IS '账号关停时间（苹果官方关停时间）';
COMMENT ON COLUMN ri_developer_accounts.pending_close_date IS '标记为等待关停时间（业务关停时间）';
COMMENT ON COLUMN ri_developer_accounts.account_region IS '注册地';
COMMENT ON COLUMN ri_developer_accounts.account_quality_issues IS '账号质量标记（如：["秒挂过", "没开广告被下架"]）';
COMMENT ON COLUMN ri_developer_accounts.account_product_count IS '该账号下产品总数';


-- ============================================================================
-- Part 11: removed_apps 表（下架排查 - 已下架App）
-- ============================================================================

CREATE TABLE IF NOT EXISTS removed_apps (
  -- 主键
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- App 基本信息（从明道云"账号上的产品"表同步）
  bundle_id TEXT UNIQUE NOT NULL,
  app_name TEXT NOT NULL,
  app_id TEXT,

  -- 关联账号
  account_id UUID REFERENCES ri_developer_accounts(id),
  hap_account_id TEXT,
  account_name TEXT,

  -- 下架信息
  removal_time TIMESTAMP WITH TIME ZONE,
  app_status TEXT,

  -- 链接字段（从明道云"账号上的产品"表同步）
  keyword_search_url TEXT,
  target_package_url TEXT,
  qimai_url TEXT,

  -- 明道云关联
  hap_product_row_id UNIQUE,

  -- 统计信息（冗余字段，用于快速查询）
  total_operations INTEGER DEFAULT 0,
  first_release_time TIMESTAMP WITH TIME ZONE,
  last_update_time TIMESTAMP WITH TIME ZONE,
  survival_days INTEGER,

  -- 同步时间戳
  synced_from_hap_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE removed_apps IS '下架排查 - 已下架App信息表';
COMMENT ON COLUMN removed_apps.bundle_id IS 'Bundle ID（唯一标识）';
COMMENT ON COLUMN removed_apps.app_name IS 'App 名称';
COMMENT ON COLUMN removed_apps.app_id IS 'App Store ID';
COMMENT ON COLUMN removed_apps.removal_time IS 'App被下架的时间';
COMMENT ON COLUMN removed_apps.hap_product_row_id IS '明道云"账号上的产品"表的 rowid';
COMMENT ON COLUMN removed_apps.total_operations IS '总操作次数（发布+更新）';
COMMENT ON COLUMN removed_apps.survival_days IS '从首次发布到下架的存活天数';


-- ============================================================================
-- Part 12: operation_records 表（下架排查 - 操作记录）
-- ============================================================================
-- 说明：合并"App生产发布"表和"App更新任务"表的操作记录

CREATE TABLE IF NOT EXISTS operation_records (
  -- 主键
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- 关联下架App
  bundle_id TEXT NOT NULL,
  removed_app_id UUID REFERENCES removed_apps(id) ON DELETE CASCADE,

  -- 操作基本信息
  operation_type TEXT NOT NULL,  -- 'RELEASE' 或 'UPDATE'
  operation_time TIMESTAMP WITH TIME ZONE NOT NULL,

  -- 版本信息
  app_name TEXT,
  version TEXT,
  build_number TEXT,

  -- 关键字段（来自明道云）
  ad_version TEXT,          -- 广告代码版本
  operator TEXT,            -- 操作人（生产人/发布人）
  location TEXT,            -- 发布地点

  -- 发布状态
  status TEXT,
  release_type TEXT,

  -- 时间节点
  first_submit_time TIMESTAMP WITH TIME ZONE,
  debug_complete_time TIMESTAMP WITH TIME ZONE,
  package_upload_time TIMESTAMP WITH TIME ZONE,

  -- 备注
  remarks TEXT,

  -- 明道云关联
  hap_source_table TEXT,    -- 'production_release' 或 'update_task'
  hap_record_id TEXT,       -- 明道云记录的 rowid

  -- 时间戳
  synced_from_hap_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE operation_records IS '下架排查 - App操作记录表（发布+更新）';
COMMENT ON COLUMN operation_records.operation_type IS '操作类型：RELEASE（首次发布）或 UPDATE（更新）';
COMMENT ON COLUMN operation_records.operation_time IS '操作时间（发布时间或提交审核时间）';
COMMENT ON COLUMN operation_records.ad_version IS '广告代码版本';
COMMENT ON COLUMN operation_records.operator IS '操作人员';
COMMENT ON COLUMN operation_records.location IS '发布地点（公司/家等）';
COMMENT ON COLUMN operation_records.hap_source_table IS '数据来源表';


-- ============================================================================
-- Part 13: removal_investigation_sync_logs 表（下架排查 - 同步日志）
-- ============================================================================

CREATE TABLE IF NOT EXISTS removal_investigation_sync_logs (
  -- 主键
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- 同步信息
  sync_type TEXT NOT NULL,          -- 'FULL'（全量）或 'INCREMENTAL'（增量）
  sync_status TEXT NOT NULL,        -- 'STARTED' / 'IN_PROGRESS' / 'COMPLETED' / 'FAILED'

  -- 统计信息
  total_removed_apps INTEGER DEFAULT 0,
  synced_apps INTEGER DEFAULT 0,
  new_apps INTEGER DEFAULT 0,
  updated_apps INTEGER DEFAULT 0,

  total_operations INTEGER DEFAULT 0,
  new_operations INTEGER DEFAULT 0,

  total_accounts INTEGER DEFAULT 0,
  new_accounts INTEGER DEFAULT 0,

  -- 错误信息
  error_message TEXT,
  error_details JSONB,

  -- 时间信息
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  duration_seconds INTEGER,

  -- 元数据
  triggered_by TEXT,                -- 'MANUAL' / 'AUTO' / 'SYSTEM'
  hostname TEXT,
  metadata JSONB
);

COMMENT ON TABLE removal_investigation_sync_logs IS '下架排查 - 数据同步日志表';
COMMENT ON COLUMN removal_investigation_sync_logs.sync_type IS '同步类型：FULL（全量）或 INCREMENTAL（增量）';
COMMENT ON COLUMN removal_investigation_sync_logs.triggered_by IS '触发方式：MANUAL（手动）/ AUTO（自动）/ SYSTEM（系统）';
COMMENT ON COLUMN removal_investigation_sync_logs.duration_seconds IS '同步耗时（秒）';


-- ============================================================================
-- Part 14: app_removal_analysis 表（下架原因分析）
-- ============================================================================

CREATE TABLE IF NOT EXISTS app_removal_analysis (
  -- 主键
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- 关联APP
  bundle_id TEXT NOT NULL UNIQUE,

  -- 分析内容
  analysis_content TEXT,

  -- 操作员信息
  created_by TEXT,
  updated_by TEXT,

  -- 时间戳
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE app_removal_analysis IS 'APP下架原因分析表';
COMMENT ON COLUMN app_removal_analysis.bundle_id IS 'Bundle ID（唯一标识，关联到下架的APP）';
COMMENT ON COLUMN app_removal_analysis.analysis_content IS '下架原因分析和猜测内容';
COMMENT ON COLUMN app_removal_analysis.created_by IS '创建人';
COMMENT ON COLUMN app_removal_analysis.updated_by IS '最后更新人';


-- ============================================================================
-- Part 15: user_profiles 表（用户配置和角色 - RBAC v6.1）
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'operator' CHECK (role IN ('admin', 'operator')),

  -- 用户级别的监控开关（仅对操作员有效，管理员忽略这些设置）
  enable_app_removal_monitor BOOLEAN DEFAULT false,  -- 下架状态自动监控（操作员默认关闭）
  enable_target_app_monitor BOOLEAN DEFAULT false,   -- 目标包自动监控（操作员默认关闭）

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE user_profiles IS '用户配置表（包含角色和权限设置 - v6.1）';
COMMENT ON COLUMN user_profiles.role IS '用户角色：admin=管理员（全部权限），operator=操作员（受限权限）';
COMMENT ON COLUMN user_profiles.enable_app_removal_monitor IS '下架状态自动监控开关（操作员专用，管理员忽略）';
COMMENT ON COLUMN user_profiles.enable_target_app_monitor IS '目标包自动监控开关（操作员专用，管理员忽略）';


-- ============================================================================
-- Part 16: qimai_monitoring_logs 表（七麦监控日志 v7.0）
-- ============================================================================

CREATE TABLE IF NOT EXISTS qimai_monitoring_logs (
  -- 主键
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 执行时间
  execution_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- 执行状态：success / failed / cookie_expired
  status TEXT NOT NULL,

  -- 统计数据
  clear_rank_detected INTEGER DEFAULT 0,      -- 七麦检测到的清榜数
  clear_keyword_detected INTEGER DEFAULT 0,   -- 七麦检测到的清词数
  clear_rank_matched INTEGER DEFAULT 0,       -- 匹配到的清榜数（target_apps 中存在）
  clear_keyword_matched INTEGER DEFAULT 0,    -- 匹配到的清词数（target_apps 中存在）
  clear_rank_updated INTEGER DEFAULT 0,       -- 实际更新的清榜数（false→true）
  clear_keyword_updated INTEGER DEFAULT 0,    -- 实际更新的清词数（false→true）
  total_target_apps INTEGER DEFAULT 0,        -- target_apps 总数

  -- 执行信息
  execution_duration_ms INTEGER,              -- 执行耗时（毫秒）
  error_message TEXT,                         -- 错误信息

  -- 请求详情（用于调试）
  request_details JSONB,                      -- 包含请求 URL、响应状态等

  -- 时间戳
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE qimai_monitoring_logs IS '七麦自动监控执行日志（v7.0）';
COMMENT ON COLUMN qimai_monitoring_logs.status IS '执行状态：success（成功）、failed（失败）、cookie_expired（Cookie 过期）';
COMMENT ON COLUMN qimai_monitoring_logs.clear_rank_detected IS '七麦清榜页面检测到的 App 总数';
COMMENT ON COLUMN qimai_monitoring_logs.clear_keyword_detected IS '七麦清词页面检测到的 App 总数';
COMMENT ON COLUMN qimai_monitoring_logs.clear_rank_matched IS '清榜列表中与 target_apps 匹配的数量';
COMMENT ON COLUMN qimai_monitoring_logs.clear_keyword_matched IS '清词列表中与 target_apps 匹配的数量';
COMMENT ON COLUMN qimai_monitoring_logs.clear_rank_updated IS '实际更新的清榜记录数（false → true）';
COMMENT ON COLUMN qimai_monitoring_logs.clear_keyword_updated IS '实际更新的清词记录数（false → true）';


-- ============================================================================
-- Part 17: system_configs 表（第三方服务配置 v7.1）
-- ============================================================================

CREATE TABLE IF NOT EXISTS system_configs (
  -- 主键
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 配置键（唯一）
  key TEXT UNIQUE NOT NULL,

  -- 配置值（敏感信息，如 Cookie）
  value TEXT,

  -- 配置名称（用于前端展示）
  name TEXT NOT NULL,

  -- 配置描述
  description TEXT,

  -- 配置类型：cookie / api_key / token
  config_type TEXT DEFAULT 'cookie',

  -- 状态：active（正常）/ expired（已过期）/ invalid（无效）
  status TEXT DEFAULT 'active',

  -- 最后验证时间
  last_verified_at TIMESTAMPTZ,

  -- 最后验证结果信息
  last_verified_message TEXT,

  -- 更新者
  updated_by UUID REFERENCES auth.users(id),

  -- 时间戳
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE system_configs IS '系统配置表 - 存储第三方服务凭证（v7.1）';
COMMENT ON COLUMN system_configs.key IS '配置键，如 qimai_cookie、umeng_cookie';
COMMENT ON COLUMN system_configs.value IS '配置值，敏感信息如 Cookie';
COMMENT ON COLUMN system_configs.status IS '状态：active（正常）、expired（已过期）、invalid（无效）';
COMMENT ON COLUMN system_configs.config_type IS '配置类型：cookie / api_key / token';

-- 插入默认配置项
INSERT INTO system_configs (key, name, description, config_type, status, value)
VALUES
  ('qimai_cookie', '七麦数据 Cookie', '用于访问七麦数据网站的登录凭证，过期后需要重新登录七麦并更新', 'cookie', 'active', NULL),
  ('umeng_cookie', '友盟 Cookie', '用于访问友盟统计数据的登录凭证（暂未使用）', 'cookie', 'active', NULL)
ON CONFLICT (key) DO NOTHING;


-- ============================================================================
-- Part 18: 视图
-- ============================================================================

-- 视图 1：按账号分组的监控视图
DROP VIEW IF EXISTS app_removal_monitor_by_account;
CREATE VIEW app_removal_monitor_by_account AS
SELECT
  COALESCE(a.id, '00000000-0000-0000-0000-000000000000'::uuid) as account_id,
  COALESCE(a.account_name, '未关联账号') as account_name,
  a.apple_id as account_email,
  COUNT(m.id) as total_apps,
  SUM(CASE WHEN m.current_status = 'AVAILABLE' THEN 1 ELSE 0 END) as available_count,
  SUM(CASE WHEN m.current_status = 'REMOVED' THEN 1 ELSE 0 END) as removed_count,
  SUM(CASE WHEN m.current_status = 'UNKNOWN' THEN 1 ELSE 0 END) as unknown_count,
  MAX(m.last_checked_at) as last_checked_at
FROM app_removal_monitor m
LEFT JOIN apple_accounts a ON m.local_apple_account_id = a.id
WHERE m.is_monitoring = true
GROUP BY a.id, a.account_name, a.apple_id;

COMMENT ON VIEW app_removal_monitor_by_account IS '按账号分组的App监控统计视图';

-- 视图 2：历史记录 + 账号信息
DROP VIEW IF EXISTS app_removal_monitor_history_with_accounts;
CREATE VIEW app_removal_monitor_history_with_accounts AS
SELECT
  h.*,
  a.account_name as account_display_name,
  a.apple_id,
  a.team_id
FROM app_removal_monitor_history h
LEFT JOIN apple_accounts a ON h.local_apple_account_id = a.id;

COMMENT ON VIEW app_removal_monitor_history_with_accounts IS '历史归档记录（包含账号详细信息）';

-- 视图 3：目标包统计视图
DROP VIEW IF EXISTS target_app_stats;
CREATE VIEW target_app_stats AS
SELECT
  COUNT(*) AS total_monitoring,
  COUNT(*) FILTER (WHERE current_status = 'available') AS total_available,
  COUNT(*) FILTER (WHERE current_status = 'removed') AS total_removed,
  COUNT(*) FILTER (WHERE current_status = 'unknown') AS total_unknown,
  COUNT(*) FILTER (WHERE is_offline = true) AS total_offline,
  COUNT(*) FILTER (WHERE is_clear_keyword = true) AS total_clear_keyword,
  COUNT(*) FILTER (WHERE is_clear_rank = true) AS total_clear_rank
FROM target_apps
WHERE is_monitoring = true;

COMMENT ON VIEW target_app_stats IS '目标包监控统计视图';

-- 视图 4：七麦监控最新状态
DROP VIEW IF EXISTS qimai_monitoring_latest;
CREATE VIEW qimai_monitoring_latest AS
SELECT
  id,
  execution_time,
  status,
  clear_rank_detected,
  clear_keyword_detected,
  clear_rank_matched,
  clear_keyword_matched,
  clear_rank_updated,
  clear_keyword_updated,
  total_target_apps,
  execution_duration_ms,
  error_message,
  created_at
FROM qimai_monitoring_logs
ORDER BY execution_time DESC
LIMIT 1;

COMMENT ON VIEW qimai_monitoring_latest IS '最近一次七麦监控执行结果';


-- ============================================================================
-- Part 19: 辅助函数和触发器
-- ============================================================================

-- 更新时间戳触发器通用函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 为所有表添加更新时间戳触发器
DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_releases_updated_at ON releases;
CREATE TRIGGER update_releases_updated_at
  BEFORE UPDATE ON releases
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_global_configs_updated_at ON global_configs;
CREATE TRIGGER update_global_configs_updated_at
  BEFORE UPDATE ON global_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_apple_accounts_updated_at ON apple_accounts;
CREATE TRIGGER update_apple_accounts_updated_at
  BEFORE UPDATE ON apple_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_target_apps_updated_at ON target_apps;
CREATE TRIGGER update_target_apps_updated_at
  BEFORE UPDATE ON target_apps
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_ri_developer_accounts_updated_at ON ri_developer_accounts;
CREATE TRIGGER update_ri_developer_accounts_updated_at
  BEFORE UPDATE ON ri_developer_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_removed_apps_updated_at ON removed_apps;
CREATE TRIGGER update_removed_apps_updated_at
  BEFORE UPDATE ON removed_apps
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_system_configs_updated_at ON system_configs;
CREATE TRIGGER update_system_configs_updated_at
  BEFORE UPDATE ON system_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- Part 20: RLS 策略
-- ============================================================================

-- 启用 RLS 并创建策略

-- projects 表 RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "所有已登录用户可查看项目" ON projects;
CREATE POLICY "所有已登录用户可查看项目" ON projects
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "所有已登录用户可插入项目" ON projects;
CREATE POLICY "所有已登录用户可插入项目" ON projects
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "所有已登录用户可更新项目" ON projects;
CREATE POLICY "所有已登录用户可更新项目" ON projects
  FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "所有已登录用户可删除项目" ON projects;
CREATE POLICY "所有已登录用户可删除项目" ON projects
  FOR DELETE TO authenticated USING (true);

-- releases 表 RLS
ALTER TABLE releases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "所有已登录用户可查看发布记录" ON releases;
CREATE POLICY "所有已登录用户可查看发布记录" ON releases
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "所有已登录用户可插入发布记录" ON releases;
CREATE POLICY "所有已登录用户可插入发布记录" ON releases
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "所有已登录用户可更新发布记录" ON releases;
CREATE POLICY "所有已登录用户可更新发布记录" ON releases
  FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "所有已登录用户可删除发布记录" ON releases;
CREATE POLICY "所有已登录用户可删除发布记录" ON releases
  FOR DELETE TO authenticated USING (true);

-- global_configs 表 RLS
ALTER TABLE global_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "所有已登录用户可查看全局配置" ON global_configs;
CREATE POLICY "所有已登录用户可查看全局配置" ON global_configs
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "所有已登录用户可插入全局配置" ON global_configs;
CREATE POLICY "所有已登录用户可插入全局配置" ON global_configs
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "所有已登录用户可更新全局配置" ON global_configs;
CREATE POLICY "所有已登录用户可更新全局配置" ON global_configs
  FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "所有已登录用户可删除全局配置" ON global_configs;
CREATE POLICY "所有已登录用户可删除全局配置" ON global_configs
  FOR DELETE TO authenticated USING (true);

-- app_removal_monitor 表 RLS
ALTER TABLE app_removal_monitor ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "所有已登录用户可查看" ON app_removal_monitor;
CREATE POLICY "所有已登录用户可查看" ON app_removal_monitor
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "所有已登录用户可插入" ON app_removal_monitor;
CREATE POLICY "所有已登录用户可插入" ON app_removal_monitor
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "所有已登录用户可更新" ON app_removal_monitor;
CREATE POLICY "所有已登录用户可更新" ON app_removal_monitor
  FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "所有已登录用户可删除" ON app_removal_monitor;
CREATE POLICY "所有已登录用户可删除" ON app_removal_monitor
  FOR DELETE TO authenticated USING (true);

-- apple_accounts 表 RLS
ALTER TABLE apple_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "所有已登录用户可查看" ON apple_accounts;
CREATE POLICY "所有已登录用户可查看" ON apple_accounts
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "所有已登录用户可插入" ON apple_accounts;
CREATE POLICY "所有已登录用户可插入" ON apple_accounts
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "所有已登录用户可更新" ON apple_accounts;
CREATE POLICY "所有已登录用户可更新" ON apple_accounts
  FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "所有已登录用户可删除" ON apple_accounts;
CREATE POLICY "所有已登录用户可删除" ON apple_accounts
  FOR DELETE TO authenticated USING (true);

-- app_removal_monitor_history 表 RLS
ALTER TABLE app_removal_monitor_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "所有已登录用户可查看" ON app_removal_monitor_history;
CREATE POLICY "所有已登录用户可查看" ON app_removal_monitor_history
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "所有已登录用户可插入" ON app_removal_monitor_history;
CREATE POLICY "所有已登录用户可插入" ON app_removal_monitor_history
  FOR INSERT TO authenticated WITH CHECK (true);

-- target_apps 表 RLS
ALTER TABLE target_apps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "所有已登录用户可查看" ON target_apps;
CREATE POLICY "所有已登录用户可查看" ON target_apps
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "所有已登录用户可插入" ON target_apps;
CREATE POLICY "所有已登录用户可插入" ON target_apps
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "所有已登录用户可更新" ON target_apps;
CREATE POLICY "所有已登录用户可更新" ON target_apps
  FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "所有已登录用户可删除" ON target_apps;
CREATE POLICY "所有已登录用户可删除" ON target_apps
  FOR DELETE TO authenticated USING (true);

-- target_app_history 表 RLS
ALTER TABLE target_app_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "所有已登录用户可查看" ON target_app_history;
CREATE POLICY "所有已登录用户可查看" ON target_app_history
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "所有已登录用户可插入" ON target_app_history;
CREATE POLICY "所有已登录用户可插入" ON target_app_history
  FOR INSERT TO authenticated WITH CHECK (true);

-- ri_developer_accounts 表 RLS
ALTER TABLE ri_developer_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "所有已登录用户可查看" ON ri_developer_accounts;
CREATE POLICY "所有已登录用户可查看" ON ri_developer_accounts
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "所有已登录用户可插入" ON ri_developer_accounts;
CREATE POLICY "所有已登录用户可插入" ON ri_developer_accounts
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "所有已登录用户可更新" ON ri_developer_accounts;
CREATE POLICY "所有已登录用户可更新" ON ri_developer_accounts
  FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "所有已登录用户可删除" ON ri_developer_accounts;
CREATE POLICY "所有已登录用户可删除" ON ri_developer_accounts
  FOR DELETE TO authenticated USING (true);

-- removed_apps 表 RLS
ALTER TABLE removed_apps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "所有已登录用户可查看" ON removed_apps;
CREATE POLICY "所有已登录用户可查看" ON removed_apps
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "所有已登录用户可插入" ON removed_apps;
CREATE POLICY "所有已登录用户可插入" ON removed_apps
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "所有已登录用户可更新" ON removed_apps;
CREATE POLICY "所有已登录用户可更新" ON removed_apps
  FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "所有已登录用户可删除" ON removed_apps;
CREATE POLICY "所有已登录用户可删除" ON removed_apps
  FOR DELETE TO authenticated USING (true);

-- operation_records 表 RLS
ALTER TABLE operation_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "所有已登录用户可查看" ON operation_records;
CREATE POLICY "所有已登录用户可查看" ON operation_records
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "所有已登录用户可插入" ON operation_records;
CREATE POLICY "所有已登录用户可插入" ON operation_records
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "所有已登录用户可更新" ON operation_records;
CREATE POLICY "所有已登录用户可更新" ON operation_records
  FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "所有已登录用户可删除" ON operation_records;
CREATE POLICY "所有已登录用户可删除" ON operation_records
  FOR DELETE TO authenticated USING (true);

-- removal_investigation_sync_logs 表 RLS
ALTER TABLE removal_investigation_sync_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "所有已登录用户可查看" ON removal_investigation_sync_logs;
CREATE POLICY "所有已登录用户可查看" ON removal_investigation_sync_logs
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "所有已登录用户可插入" ON removal_investigation_sync_logs;
CREATE POLICY "所有已登录用户可插入" ON removal_investigation_sync_logs
  FOR INSERT TO authenticated WITH CHECK (true);

-- app_removal_analysis 表 RLS
ALTER TABLE app_removal_analysis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "所有已登录用户可查看" ON app_removal_analysis;
CREATE POLICY "所有已登录用户可查看" ON app_removal_analysis
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "所有已登录用户可插入" ON app_removal_analysis;
CREATE POLICY "所有已登录用户可插入" ON app_removal_analysis
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "所有已登录用户可更新" ON app_removal_analysis;
CREATE POLICY "所有已登录用户可更新" ON app_removal_analysis
  FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "所有已登录用户可删除" ON app_removal_analysis;
CREATE POLICY "所有已登录用户可删除" ON app_removal_analysis
  FOR DELETE TO authenticated USING (true);

-- qimai_monitoring_logs 表 RLS
ALTER TABLE qimai_monitoring_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "所有已登录用户可查看七麦监控日志" ON qimai_monitoring_logs;
CREATE POLICY "所有已登录用户可查看七麦监控日志" ON qimai_monitoring_logs
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "所有已登录用户可插入七麦监控日志" ON qimai_monitoring_logs;
CREATE POLICY "所有已登录用户可插入七麦监控日志" ON qimai_monitoring_logs
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "允许插入七麦监控日志" ON qimai_monitoring_logs;
CREATE POLICY "允许插入七麦监控日志" ON qimai_monitoring_logs
  FOR INSERT TO anon WITH CHECK (true);

-- user_profiles 表 RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "所有认证用户可以查看所有用户配置" ON user_profiles;
CREATE POLICY "所有认证用户可以查看所有用户配置" ON user_profiles
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "用户可以更新自己的配置" ON user_profiles;
CREATE POLICY "用户可以更新自己的配置" ON user_profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- system_configs 表 RLS
ALTER TABLE system_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "管理员可查看系统配置" ON system_configs;
CREATE POLICY "管理员可查看系统配置" ON system_configs
  FOR SELECT TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "管理员可修改系统配置" ON system_configs;
CREATE POLICY "管理员可修改系统配置" ON system_configs
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Service role 完全访问系统配置" ON system_configs;
CREATE POLICY "Service role 完全访问系统配置" ON system_configs
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ============================================================================
-- Part 21: 索引优化
-- ============================================================================

-- projects 表索引
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_bundle_id ON projects(bundle_id);

-- releases 表索引
CREATE INDEX IF NOT EXISTS idx_releases_project_id ON releases(project_id);
CREATE INDEX IF NOT EXISTS idx_releases_bundle_id ON releases(bundle_id);
CREATE INDEX IF NOT EXISTS idx_releases_review_status ON releases(review_status);
CREATE INDEX IF NOT EXISTS idx_releases_submitted_at ON releases(submitted_at DESC);

-- app_removal_monitor 表索引
CREATE INDEX IF NOT EXISTS idx_app_removal_bundle_id ON app_removal_monitor(bundle_id);
CREATE INDEX IF NOT EXISTS idx_app_removal_status ON app_removal_monitor(current_status);
CREATE INDEX IF NOT EXISTS idx_app_removal_monitoring ON app_removal_monitor(is_monitoring);
CREATE INDEX IF NOT EXISTS idx_app_removal_last_checked ON app_removal_monitor(last_checked_at);
CREATE INDEX IF NOT EXISTS idx_app_removal_account ON app_removal_monitor(local_apple_account_id);
CREATE INDEX IF NOT EXISTS idx_app_removal_monitor_sync_hostname ON app_removal_monitor(sync_hostname);
CREATE INDEX IF NOT EXISTS idx_app_removal_monitor_check_hostname ON app_removal_monitor(check_hostname);
-- 清词/清榜索引（v7.2）
CREATE INDEX IF NOT EXISTS idx_app_removal_is_clear_rank ON app_removal_monitor(is_clear_rank) WHERE is_clear_rank = true;
CREATE INDEX IF NOT EXISTS idx_app_removal_is_clear_keyword ON app_removal_monitor(is_clear_keyword) WHERE is_clear_keyword = true;

-- apple_accounts 表索引
CREATE INDEX IF NOT EXISTS idx_apple_accounts_hap_id ON apple_accounts(hap_account_id);
CREATE INDEX IF NOT EXISTS idx_apple_accounts_team_id ON apple_accounts(team_id);

-- app_removal_monitor_history 表索引
CREATE INDEX IF NOT EXISTS idx_history_bundle_id ON app_removal_monitor_history(bundle_id);
CREATE INDEX IF NOT EXISTS idx_history_archived_at ON app_removal_monitor_history(archived_at);
CREATE INDEX IF NOT EXISTS idx_history_status ON app_removal_monitor_history(last_known_status);
CREATE INDEX IF NOT EXISTS idx_history_account_id ON app_removal_monitor_history(local_apple_account_id);

-- target_apps 表索引
CREATE INDEX IF NOT EXISTS idx_target_apps_hap_row_id ON target_apps(hap_row_id);
CREATE INDEX IF NOT EXISTS idx_target_apps_app_id ON target_apps(app_id);
CREATE INDEX IF NOT EXISTS idx_target_apps_current_status ON target_apps(current_status);
CREATE INDEX IF NOT EXISTS idx_target_apps_is_offline ON target_apps(is_offline);
CREATE INDEX IF NOT EXISTS idx_target_apps_sync_hostname ON target_apps(sync_hostname);
CREATE INDEX IF NOT EXISTS idx_target_apps_check_hostname ON target_apps(check_hostname);
CREATE INDEX IF NOT EXISTS idx_target_apps_created_at ON target_apps(created_at DESC);
-- 清词/清榜索引（v7.0）
CREATE INDEX IF NOT EXISTS idx_target_apps_is_clear_keyword ON target_apps(is_clear_keyword) WHERE is_clear_keyword = true;
CREATE INDEX IF NOT EXISTS idx_target_apps_is_clear_rank ON target_apps(is_clear_rank) WHERE is_clear_rank = true;

-- target_app_history 表索引
CREATE INDEX IF NOT EXISTS idx_target_app_history_target_app_id ON target_app_history(target_app_id);
CREATE INDEX IF NOT EXISTS idx_target_app_history_change_type ON target_app_history(change_type);
CREATE INDEX IF NOT EXISTS idx_target_app_history_created_at ON target_app_history(created_at DESC);

-- ri_developer_accounts 表索引
CREATE INDEX IF NOT EXISTS idx_ri_developer_accounts_hap_id ON ri_developer_accounts(hap_account_id);
CREATE INDEX IF NOT EXISTS idx_ri_accounts_status ON ri_developer_accounts(account_status);
CREATE INDEX IF NOT EXISTS idx_ri_accounts_expiry ON ri_developer_accounts(account_expiry_date);
CREATE INDEX IF NOT EXISTS idx_ri_accounts_closed ON ri_developer_accounts(account_closed_date);
CREATE INDEX IF NOT EXISTS idx_ri_accounts_pending_close ON ri_developer_accounts(pending_close_date);

-- removed_apps 表索引
CREATE INDEX IF NOT EXISTS idx_removed_apps_bundle_id ON removed_apps(bundle_id);
CREATE INDEX IF NOT EXISTS idx_removed_apps_account_id ON removed_apps(account_id);
CREATE INDEX IF NOT EXISTS idx_removed_apps_removal_time ON removed_apps(removal_time DESC);
CREATE INDEX IF NOT EXISTS idx_removed_apps_hap_product_row_id ON removed_apps(hap_product_row_id);

-- operation_records 表索引
CREATE INDEX IF NOT EXISTS idx_operation_records_bundle_id ON operation_records(bundle_id);
CREATE INDEX IF NOT EXISTS idx_operation_records_removed_app_id ON operation_records(removed_app_id);
CREATE INDEX IF NOT EXISTS idx_operation_records_bundle_time ON operation_records(bundle_id, operation_time DESC);
CREATE INDEX IF NOT EXISTS idx_operation_records_operation_time ON operation_records(operation_time DESC);
CREATE INDEX IF NOT EXISTS idx_operation_records_hap_record_id ON operation_records(hap_record_id);

-- removal_investigation_sync_logs 表索引
CREATE INDEX IF NOT EXISTS idx_ri_sync_logs_started_at ON removal_investigation_sync_logs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ri_sync_logs_status ON removal_investigation_sync_logs(sync_status);

-- app_removal_analysis 表索引
CREATE INDEX IF NOT EXISTS idx_removal_analysis_bundle_id ON app_removal_analysis(bundle_id);
CREATE INDEX IF NOT EXISTS idx_removal_analysis_updated_at ON app_removal_analysis(updated_at DESC);

-- qimai_monitoring_logs 表索引
CREATE INDEX IF NOT EXISTS idx_qimai_logs_execution_time ON qimai_monitoring_logs(execution_time DESC);
CREATE INDEX IF NOT EXISTS idx_qimai_logs_status ON qimai_monitoring_logs(status);
CREATE INDEX IF NOT EXISTS idx_qimai_logs_created_at ON qimai_monitoring_logs(created_at DESC);

-- system_configs 表索引
CREATE INDEX IF NOT EXISTS idx_system_configs_key ON system_configs(key);
CREATE INDEX IF NOT EXISTS idx_system_configs_status ON system_configs(status);

-- user_profiles 表索引
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON user_profiles(role);
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);


-- ============================================================================
-- Part 22: RBAC 辅助函数（必须在 RLS 策略之前定义）
-- ============================================================================

-- 检查用户是否为管理员
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM user_profiles
    WHERE id = auth.uid()
    AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 获取当前用户角色
CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS TEXT AS $$
BEGIN
  RETURN (
    SELECT role
    FROM user_profiles
    WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 检查用户是否有权限访问指定功能
CREATE OR REPLACE FUNCTION check_user_permission(required_role TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  user_role TEXT;
BEGIN
  user_role := get_current_user_role();

  -- 管理员拥有所有权限
  IF user_role = 'admin' THEN
    RETURN true;
  END IF;

  -- 操作员只能访问基本功能
  IF user_role = 'operator' AND required_role = 'operator' THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- Part 23: 用户自动创建触发器（RBAC）
-- ============================================================================

-- 当新用户在 auth.users 中创建时，自动在 user_profiles 中创建记录
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_count INTEGER;
  new_role TEXT;
BEGIN
  -- 检查是否是第一个用户
  SELECT COUNT(*) INTO user_count FROM user_profiles;

  -- 第一个用户自动成为管理员，其他用户默认为操作员
  IF user_count = 0 THEN
    new_role := 'admin';
  ELSE
    new_role := 'operator';
  END IF;

  -- 创建用户配置
  INSERT INTO user_profiles (id, email, role, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    new_role,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 创建触发器
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();


-- ============================================================================
-- Part 24: 初始化现有用户（如果有）
-- ============================================================================

-- 为所有已存在的用户创建配置（第一个用户为管理员）
DO $$
DECLARE
  user_record RECORD;
  user_count INTEGER := 0;
  new_role TEXT;
BEGIN
  FOR user_record IN
    SELECT id, email, raw_user_meta_data
    FROM auth.users
    WHERE id NOT IN (SELECT id FROM user_profiles)
    ORDER BY created_at ASC
  LOOP
    -- 第一个用户为管理员
    IF user_count = 0 THEN
      new_role := 'admin';
    ELSE
      new_role := 'operator';
    END IF;

    INSERT INTO user_profiles (id, email, role, full_name)
    VALUES (
      user_record.id,
      user_record.email,
      new_role,
      COALESCE(user_record.raw_user_meta_data->>'full_name', user_record.email)
    )
    ON CONFLICT (id) DO NOTHING;

    user_count := user_count + 1;
  END LOOP;

  RAISE NOTICE '✅ 已为 % 个现有用户初始化配置', user_count;

  IF user_count > 0 THEN
    RAISE NOTICE '✅ 第一个用户已设置为管理员';
  END IF;
END $$;


-- ============================================================================
-- 完成！
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '✅ Fastlane 自动发布系统 7.2 - 数据库初始化完成！';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '';
  RAISE NOTICE '已创建的表：';
  RAISE NOTICE '  核心功能：';
  RAISE NOTICE '    - projects (项目管理)';
  RAISE NOTICE '    - releases (发布历史)';
  RAISE NOTICE '    - global_configs (全局配置)';
  RAISE NOTICE '';
  RAISE NOTICE '  下架监控：';
  RAISE NOTICE '    - app_removal_monitor (下架监控 - 我的应用)';
  RAISE NOTICE '    - apple_accounts (开发者账号缓存)';
  RAISE NOTICE '    - app_removal_monitor_history (历史归档)';
  RAISE NOTICE '';
  RAISE NOTICE '  目标包监控：';
  RAISE NOTICE '    - target_apps (目标包监控 - 竞品应用)';
  RAISE NOTICE '    - target_app_history (状态变更历史)';
  RAISE NOTICE '';
  RAISE NOTICE '  下架排查：';
  RAISE NOTICE '    - ri_developer_accounts (开发者账号信息)';
  RAISE NOTICE '    - removed_apps (已下架App)';
  RAISE NOTICE '    - operation_records (操作记录)';
  RAISE NOTICE '    - removal_investigation_sync_logs (同步日志)';
  RAISE NOTICE '    - app_removal_analysis (下架原因分析)';
  RAISE NOTICE '';
  RAISE NOTICE '  权限管理 (v6.1)：';
  RAISE NOTICE '    - user_profiles (用户配置和角色)';
  RAISE NOTICE '';
  RAISE NOTICE '  七麦监控 (v7.0+)：';
  RAISE NOTICE '    - qimai_monitoring_logs (七麦监控日志)';
  RAISE NOTICE '    - system_configs (第三方服务配置)';
  RAISE NOTICE '';
  RAISE NOTICE '已创建的视图：';
  RAISE NOTICE '    - app_removal_monitor_by_account (按账号分组统计)';
  RAISE NOTICE '    - app_removal_monitor_history_with_accounts (历史记录+账号)';
  RAISE NOTICE '    - target_app_stats (目标包统计)';
  RAISE NOTICE '    - qimai_monitoring_latest (七麦监控最新状态)';
  RAISE NOTICE '';
  RAISE NOTICE '已配置 RLS 策略：所有表';
  RAISE NOTICE '已创建索引：已优化所有表的查询性能';
  RAISE NOTICE '';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '角色说明：';
  RAISE NOTICE '  - admin (管理员): 访问所有功能';
  RAISE NOTICE '  - operator (操作员): 只能访问发布看板、发布操作、发布历史、设置';
  RAISE NOTICE '';
  RAISE NOTICE '第一个登录用户将自动成为管理员';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '';
  RAISE NOTICE '下一步：';
  RAISE NOTICE '  1. 配置环境变量';
  RAISE NOTICE '  2. 启动 fastlane-agent 后端服务';
  RAISE NOTICE '  3. 启动 fastlane-ui 前端服务';
  RAISE NOTICE '============================================================';
END $$;
