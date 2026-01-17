-- ============================================================================
-- PRD 8.0: 外部提交App审核监控 - 数据库迁移
-- ============================================================================
--
-- 功能：为 releases 表添加 source 字段，用于区分发布来源
-- - fastlane: 通过 fastlane UI 系统发布
-- - manual: 从明道云手动同步的外部提交
--
-- 创建日期：2026-01-17
-- ============================================================================

-- 添加 source 字段
ALTER TABLE releases 
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'fastlane' 
CHECK (source IN ('fastlane', 'manual'));

-- 添加字段注释
COMMENT ON COLUMN releases.source IS '发布来源：fastlane=通过系统发布，manual=手动同步';

-- 创建索引以优化按来源筛选的查询
CREATE INDEX IF NOT EXISTS idx_releases_source ON releases(source);

-- 验证迁移
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'releases' 
    AND column_name = 'source'
  ) THEN
    RAISE NOTICE '✅ source 字段已成功添加到 releases 表';
  ELSE
    RAISE EXCEPTION '❌ source 字段添加失败';
  END IF;
END $$;
