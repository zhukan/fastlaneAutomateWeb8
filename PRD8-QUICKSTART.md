# PRD 8.0 外部审核监控 - 快速启动

## 一键部署

### 步骤1: 数据库迁移（2分钟）

访问 Supabase Dashboard -> SQL Editor，执行：

```sql
-- 复制粘贴 supabase/migrations/20260117_add_releases_source.sql 的内容
```

或使用命令行：

```bash
# 如果你有 Supabase CLI
supabase db push
```

### 步骤2: 验证环境（1分钟）

```bash
cd fastlane-agent
npx ts-node scripts/verify-external-sync-setup.ts
```

**预期输出**: 所有检查项显示 ✅

### 步骤3: 启动服务（1分钟）

```bash
# 后端（如果未启动）
cd fastlane-agent
npm start

# 前端（如果未启动）
cd fastlane-ui
npm run dev
```

### 步骤4: 首次同步（1分钟）

**方法1: 使用测试脚本**

```bash
cd fastlane-agent
npx ts-node scripts/test-external-release-sync.ts
```

**方法2: 使用前端UI**

1. 访问 http://localhost:3001/releases
2. 点击右上角"同步外部审核"按钮
3. 等待Toast提示

### 步骤5: 验证结果（1分钟）

**查看数据库**:

```sql
SELECT 
  app_name, 
  version, 
  source, 
  monitor_enabled,
  deployed_by,
  submitted_at
FROM releases 
WHERE source = 'manual'
ORDER BY submitted_at DESC;
```

**预期**: 看到6条记录（3条来自生产发布表，3条来自更新任务表）

## 快速测试清单

- [ ] ✅ 数据库迁移执行成功
- [ ] ✅ 环境验证脚本全部通过
- [ ] ✅ 后端服务启动无错误
- [ ] ✅ 前端页面显示同步按钮
- [ ] ✅ 点击同步按钮能正常工作
- [ ] ✅ Toast提示显示同步结果
- [ ] ✅ 发布列表显示新增记录
- [ ] ✅ 新记录的监控状态为"已启用"

## 常见问题快速解决

### 问题1: 环境变量未配置

**现象**: 验证脚本显示 ❌ 缺少环境变量

**解决**: 在 `fastlane-agent/.env` 中添加：

```bash
HAP_APP_KEY_PRODUCTION_RELEASES=2b3688e350d918d5
HAP_SIGN_PRODUCTION_RELEASES=YzE5N2M3MjczOTJmYTU2OWU3OGY3ZjFkYTc0ODczYzk4MzU5YTA0ZjkyMzM5ZDMwMGIyOTQ5YjcxZDI1OTg5NA==
```

### 问题2: 同步按钮不显示

**现象**: 前端页面没有"同步外部审核"按钮

**解决**: 
1. 清除浏览器缓存
2. 重启前端服务
3. 检查是否在正确的页面（/releases 或 /overview）

### 问题3: 同步失败

**现象**: Toast显示"同步失败: ..."

**排查**:
1. 检查后端日志（fastlane-agent控制台）
2. 确认明道云API连接正常
3. 运行验证脚本检查配置

### 问题4: 记录不显示

**现象**: 同步成功但列表中看不到

**解决**:
1. 刷新页面（F5）
2. 检查筛选条件（是否过滤了该记录）
3. 查询数据库确认数据已插入

## 5分钟完整测试流程

```bash
# 1. 验证环境（30秒）
cd fastlane-agent
npx ts-node scripts/verify-external-sync-setup.ts

# 2. 执行同步（10秒）
npx ts-node scripts/test-external-release-sync.ts

# 3. 查看结果（10秒）
# 访问 http://localhost:3001/releases

# 4. 验证监控（可选，需等待1小时或手动刷新）
# 点击记录右侧的刷新按钮
```

## 下一步

1. **生产部署**: 参考 `PRD8-DEPLOYMENT.md`
2. **完整测试**: 参考 `PRD8-TEST-PLAN.md`
3. **功能使用**: 参考 `PRD8.md` 的使用说明

## 技术支持

如遇问题，请查看：
1. 后端日志: fastlane-agent 控制台
2. 前端日志: 浏览器 DevTools Console
3. 数据库日志: Supabase Dashboard -> Logs

或参考详细文档：
- 部署指南: `PRD8-DEPLOYMENT.md`
- 测试计划: `PRD8-TEST-PLAN.md`
- 实施总结: `PRD8-IMPLEMENTATION-SUMMARY.md`
