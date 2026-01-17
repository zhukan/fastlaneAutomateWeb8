# PRD 8.0 外部审核监控 - 部署指南

## 功能概述

将明道云中"正式包审核中"的记录同步到 Supabase，实现统一的审核监控。

## 部署步骤

### 1. 数据库迁移

在 Supabase Dashboard -> SQL Editor 中执行：

```bash
supabase/migrations/20260117_add_releases_source.sql
```

**验证**：
```sql
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'releases' AND column_name = 'source';
```

应该看到：
- column_name: source
- data_type: text
- column_default: 'fastlane'::text

### 2. 环境变量配置

确保 `fastlane-agent/.env` 包含以下配置：

```bash
# App更新任务表（二维奇智应用）
HAP_APP_KEY=9990f999f7a61d8d
HAP_SIGN=YWI0NGM5ZTNjYTg0MGZiNzI4MmQxMjMyOWE0MTg0YjgwY2Y2NDUxYzU0MzM4NmYzZGY2ZTdiNzI2NDI4MWYzNw==
HAP_WORKSHEET_UPDATE_TASKS=640ab32a56058b3df8803af2

# App生产发布表（App工厂应用）
HAP_APP_KEY_PRODUCTION_RELEASES=2b3688e350d918d5
HAP_SIGN_PRODUCTION_RELEASES=YzE5N2M3MjczOTJmYTU2OWU3OGY3ZjFkYTc0ODczYzk4MzU5YTA0ZjkyMzM5ZDMwMGIyOTQ5YjcxZDI1OTg5NA==
HAP_WORKSHEET_PRODUCTION_RELEASES=65612ddfc96f80bfabe5df2e

# 账号上的产品表
HAP_WORKSHEET_PRODUCTS=643418197f0301fb51750f00
HAP_WORKSHEET_ACCOUNTS=640adea9c04c8d453ff1ce52

# Supabase
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 3. 重启服务

```bash
cd fastlane-agent
npm install  # 如果有新依赖
npm start
```

### 4. 前端部署（如需）

```bash
cd fastlane-ui
npm install  # 如果有新依赖
npm run build
```

## 使用方法

### 手动同步

1. **在发布历史页面**：
   - 访问 `/releases`
   - 点击右上角"同步外部审核"按钮
   - 等待同步完成（约5-15秒）
   - 查看Toast提示的同步结果

2. **在概览页面**：
   - 访问 `/overview`
   - 在"最近发布"模块顶部点击"同步外部审核"按钮
   - 等待同步完成
   - 刷新后可在列表中看到新增记录

### 同步结果说明

- **新增**: 首次同步的记录
- **已存在**: 已经在系统中的记录（通过 bundle_id + version 去重）
- **失败**: 无法同步的记录（通常是缺少 Bundle ID 或 API Key）

### 审核监控

同步后的记录会：
1. 自动标记为 `source = 'manual'`
2. 自动启用监控 `monitor_enabled = true`
3. 初始状态设为 `WAITING_FOR_REVIEW`
4. 等待 ReviewMonitor 在下次定时任务（每小时）中检查实际状态

## 测试验证

### 1. 后端测试

```bash
cd fastlane-agent
npx ts-node scripts/test-external-release-sync.ts
```

**预期输出**：
```
✅ 同步成功
   - 新增: X 条
   - 已存在: Y 条
   - 失败: 0 条
```

### 2. API测试

```bash
curl -X POST http://localhost:3000/api/releases/sync-external \
  -H "Content-Type: application/json"
```

**预期响应**：
```json
{
  "success": true,
  "data": {
    "newCount": 3,
    "existCount": 0,
    "failCount": 0,
    "failedApps": []
  }
}
```

### 3. 数据库验证

```sql
-- 查看同步的记录
SELECT 
  app_name, 
  version, 
  source, 
  monitor_enabled, 
  review_status,
  submitted_at,
  deployed_by
FROM releases 
WHERE source = 'manual'
ORDER BY submitted_at DESC;
```

### 4. 前端测试

1. 访问 `http://localhost:3001/releases`
2. 点击"同步外部审核"按钮
3. 观察Toast提示
4. 刷新页面，确认新记录出现在列表中
5. 检查记录的监控状态（应该显示绿色眼睛图标）

### 5. 审核监控测试

等待 ReviewMonitor 下次运行（每小时），或手动刷新单条记录：
- 点击记录右侧的刷新按钮
- 观察 `review_status` 是否更新

## 故障排查

### 同步失败

**问题**: 提示"同步失败: 明道云连接失败"

**解决**:
1. 检查环境变量是否正确配置
2. 检查网络连接
3. 验证明道云 API Key 和 Sign 是否有效

### 部分失败

**问题**: 某些记录同步失败

**常见原因**:
1. **Bundle ID 为空**: 明道云记录未填写 Bundle ID
2. **API Key 缺失**: 无法通过 Bundle ID 查询到开发者账号配置
3. **关联查询失败**: "App更新任务表"的产品关联字段为空

**解决**: 在明道云中补充缺失的字段数据

### 记录重复

**问题**: 同一个 App 的相同版本被多次同步

**原因**: 去重逻辑基于 `bundle_id + version`，如果版本号不同则会创建新记录

**解决**: 这是预期行为。如果需要删除重复记录，手动在数据库中删除：
```sql
DELETE FROM releases 
WHERE id = 'release_id_to_delete';
```

### 监控未生效

**问题**: 同步后的记录审核状态一直不更新

**检查**:
1. 确认 `monitor_enabled = true`
2. 确认 ReviewMonitor 服务正在运行
3. 查看 Agent 日志，确认定时任务执行
4. 手动刷新单条记录测试

## 数据说明

### 字段映射

| Supabase 字段 | 明道云来源 | 说明 |
|--------------|-----------|------|
| source | - | 固定为 'manual' |
| bundle_id | 直接读取或关联查询 | 去重关键字段 |
| app_name | App名称/正式包名称 | - |
| version | 版本号 | 去重关键字段 |
| build_number | - | 固定为 "1"（明道云未维护） |
| apple_id | App ID | 仅"App更新任务表"有 |
| submitted_at | 发布时间/提交审核时间 | - |
| deployed_by | 发布人姓名 | 存储明道云用户名 |
| api_key_* | 关联查询获取 | 用于审核监控 |
| monitor_enabled | - | 固定为 true |
| review_status | - | 初始为 WAITING_FOR_REVIEW |

### 数据来源

- **App生产发布表**: 首次发布场景，直接包含 Bundle ID
- **App更新任务表**: 升级发布场景，需通过"账号上的产品"表关联查询

## 注意事项

1. **手动触发**: 同步需要手动触发，不会自动执行
2. **去重策略**: 使用 `bundle_id + version` 判断，不考虑 `build_number`
3. **用户映射**: 存储明道云用户名，不映射 Supabase 用户ID
4. **并发安全**: 同步时有锁机制，避免重复执行
5. **失败处理**: 单条记录失败不影响其他记录同步

## 监控数据

同步后可通过以下方式查看：

1. **发布看板** (`/overview`): 在"最近发布"中显示
2. **发布历史** (`/releases`): 完整列表，可按来源筛选
3. **数据库查询**: 通过 `source = 'manual'` 筛选

## 后续优化（可选）

1. 在列表中显示"外部提交"标签（通过 `source` 字段）
2. 添加按来源筛选功能
3. 支持自动定时同步（需考虑多实例并发问题）
4. 同步"App生产发布表"的 Apple ID（需明道云补充字段）
