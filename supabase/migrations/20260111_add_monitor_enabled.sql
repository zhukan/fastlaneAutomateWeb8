-- PRD 7.1: 发布记录审核状态监控开关
-- 执行时间: 2026-01-11
-- 请在 Supabase Dashboard -> SQL Editor 中执行

-- 1. 添加 monitor_enabled 字段
ALTER TABLE releases ADD COLUMN monitor_enabled BOOLEAN NOT NULL DEFAULT true;

-- 2. 添加索引（只索引启用监控的记录，提升查询性能）
CREATE INDEX idx_releases_monitor_enabled
ON releases(monitor_enabled)
WHERE monitor_enabled = true;

-- 3. 验证字段已添加
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'releases' AND column_name = 'monitor_enabled';
