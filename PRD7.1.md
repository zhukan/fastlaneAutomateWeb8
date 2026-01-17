# PRD 7.1: 发布记录审核状态监控开关

**版本**: v7.1
**创建时间**: 2026-01-11
**状态**: 已实现

---

## 需求背景

### 问题

当前所有发布的 app 都会自动监控审核状态，但有些 app 不需要审核监控（比如内部测试版、不想关注的 app），却仍然在列表中显示并参与自动轮询。

### 解决方案

为发布记录增加"是否监控审核状态"的开关，用户可以选择性地启用/禁用某些 app 的审核状态监控。

---

## 功能需求

### F1: 发布记录监控开关

- 发布记录增加 `monitor_enabled` 布尔字段（默认 true）
- 前端展示监控开关（Toggle/Switch）
- 关闭开关后，该记录不再参与审核状态自动监控
- 手动刷新功能对关闭监控的记录禁用

### F2: 批量管理功能

- 发布历史页面支持批量启用/禁用监控
- 支持全选/反选操作
- 批量操作后自动清除选择状态

### F3: 统计展示优化

- 概览页统计卡片增加"监控中"数量
- 发布历史页面筛选器增加"监控状态"选项（全部/已启用/已禁用）

### F4: 数据保留策略

- 关闭监控后，已有的审核状态数据（review_status、last_checked_at）保留
- 只停止自动更新，数据不会清空

---

## 技术方案

### 数据库变更

```sql
ALTER TABLE releases ADD COLUMN monitor_enabled BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX idx_releases_monitor_enabled ON releases(monitor_enabled) WHERE monitor_enabled = true;
```

### 后端变更

1. **supabase-client.ts**:
   - `getPendingReleases()`: 查询时增加 `.eq('monitor_enabled', true)` 条件
   - 新增 `batchUpdateMonitorEnabled()`: 批量更新监控状态
   - 新增 `getReleaseMonitorEnabled()`: 获取单条记录的监控状态

2. **server.ts** (新增 API 端点):
   - `PUT /api/releases/batch-monitor-status`: 批量更新
   - `PUT /api/releases/:id/monitor-status`: 单条更新
   - `GET /api/releases/:id/monitor-status`: 获取状态

### 前端变更

1. **types.ts**:
   - `Release` 接口增加 `monitor_enabled?: boolean` 字段

2. **agent-client.ts** (新增方法):
   - `batchUpdateMonitorStatus()`: 批量更新
   - `updateMonitorStatus()`: 单条更新
   - `getMonitorStatus()`: 获取状态

3. **overview/page.tsx**:
   - 统计卡片增加"监控中"数量
   - 最近发布列表增加监控开关列
   - 未启用监控的记录禁用手动刷新按钮

4. **releases/page.tsx**:
   - 筛选器增加监控状态选项
   - 表格增加监控开关列
   - 增加批量选择和批量操作功能

5. **release-history.tsx**:
   - 表格增加监控开关列

---

## 涉及文件

### 数据库
- `supabase/migrations/20260111_add_monitor_enabled.sql` - 迁移脚本

### 后端 (fastlane-agent)
- `src/supabase-client.ts` - 查询条件增加过滤，新增批量更新方法
- `src/server.ts` - 新增 API 端点

### 前端 (fastlane-ui)
- `lib/types.ts` - Release 接口增加字段
- `lib/agent-client.ts` - 新增批量更新方法
- `app/(dashboard)/overview/page.tsx` - 概览页展示
- `app/(dashboard)/releases/page.tsx` - 发布历史页面
- `components/release-history.tsx` - 项目发布历史组件

---

## 验收标准

- [x] 数据库字段添加成功
- [x] 概览页显示监控开关，可切换状态
- [x] 发布历史页面显示监控开关，支持筛选
- [x] 关闭监控后，记录不再自动刷新审核状态
- [x] 批量操作功能正常
- [x] 未启用监控的记录禁用手动刷新

---

## 发布说明

### 执行顺序

1. **先执行数据库迁移**（在 Supabase Dashboard SQL Editor 中执行）:
   ```sql
   ALTER TABLE releases ADD COLUMN monitor_enabled BOOLEAN NOT NULL DEFAULT true;
   CREATE INDEX idx_releases_monitor_enabled ON releases(monitor_enabled) WHERE monitor_enabled = true;
   ```

2. **重启 fastlane-agent**:
   ```bash
   cd fastlane-agent && npm run dev
   ```

3. **刷新前端页面**即可看到新功能

### 注意事项

- 现有记录的 `monitor_enabled` 默认都是 `true`，无需手动处理
- 关闭监控后，已有的审核状态数据保留，只是不再自动更新

---

**文档版本**: v7.1
**最后更新**: 2026-01-11
**状态**: 已实现
