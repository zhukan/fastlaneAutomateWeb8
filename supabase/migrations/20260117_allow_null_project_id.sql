-- ============================================================================
-- PRD 8.0: 允许 releases 表的 project_id 和 deployed_by 为 NULL
-- ============================================================================
--
-- 功能：允许外部同步的发布记录没有关联的项目ID和部署用户
--
-- 原因：从明道云同步的"正式包审核中"记录没有对应的本地项目和Supabase用户
--
-- 创建日期：2026-01-17
-- ============================================================================

-- 移除 project_id 的 NOT NULL 约束（如果存在）
ALTER TABLE releases ALTER COLUMN project_id DROP NOT NULL;

-- 移除 deployed_by 的 NOT NULL 约束（如果存在）
ALTER TABLE releases ALTER COLUMN deployed_by DROP NOT NULL;

-- 验证修改
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'releases' 
    AND column_name = 'project_id'
    AND is_nullable = 'YES'
  ) THEN
    RAISE NOTICE '✅ project_id 字段已允许 NULL 值';
  ELSE
    RAISE WARNING '⚠️  project_id 字段可能仍有 NOT NULL 约束';
  END IF;
  
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'releases' 
    AND column_name = 'deployed_by'
    AND is_nullable = 'YES'
  ) THEN
    RAISE NOTICE '✅ deployed_by 字段已允许 NULL 值';
  ELSE
    RAISE WARNING '⚠️  deployed_by 字段可能仍有 NOT NULL 约束';
  END IF;
END $$;
