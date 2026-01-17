-- ============================================================================
-- PRD 8.0: 重构 apple_id 字段语义
-- ============================================================================
--
-- 功能：
-- 1. 将 apple_id 重命名为 account_email（存储账号邮箱）
-- 2. 新增 app_store_id 字段（存储 App Store ID 数字）
--
-- 创建日期：2026-01-17
-- ============================================================================

-- 1. 重命名 apple_id 为 account_email
ALTER TABLE releases 
RENAME COLUMN apple_id TO account_email;

-- 2. 修改字段注释
COMMENT ON COLUMN releases.account_email IS 'Apple 开发者账号邮箱（Apple ID）';

-- 3. 新增 app_store_id 字段（可空，存储 App Store ID）
ALTER TABLE releases 
ADD COLUMN IF NOT EXISTS app_store_id TEXT;

-- 4. 添加字段注释
COMMENT ON COLUMN releases.app_store_id IS 'App Store ID（应用商店中的数字ID）';

-- 5. 创建索引优化查询
CREATE INDEX IF NOT EXISTS idx_releases_account_email ON releases(account_email);
CREATE INDEX IF NOT EXISTS idx_releases_app_store_id ON releases(app_store_id);

-- 验证迁移
DO $$
BEGIN
  -- 检查 account_email 字段
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'releases' 
    AND column_name = 'account_email'
  ) THEN
    RAISE NOTICE '✅ account_email 字段已成功创建';
  ELSE
    RAISE EXCEPTION '❌ account_email 字段创建失败';
  END IF;

  -- 检查 app_store_id 字段
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'releases' 
    AND column_name = 'app_store_id'
  ) THEN
    RAISE NOTICE '✅ app_store_id 字段已成功添加';
  ELSE
    RAISE EXCEPTION '❌ app_store_id 字段添加失败';
  END IF;

  -- 确认 apple_id 字段已不存在
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'releases' 
    AND column_name = 'apple_id'
  ) THEN
    RAISE NOTICE '✅ apple_id 字段已成功重命名';
  ELSE
    RAISE EXCEPTION '❌ apple_id 字段仍然存在';
  END IF;
END $$;
