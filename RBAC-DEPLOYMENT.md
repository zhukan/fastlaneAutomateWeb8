# RBAC 权限系统部署指南

## 📋 功能概述

本次更新为系统添加了完整的基于角色的访问控制（RBAC）功能，包括：

### 角色类型

#### 👨‍💼 管理员 (Admin)
- ✅ 访问所有功能和页面
- ✅ 管理团队成员角色
- ✅ 配置全局监控服务
- ✅ 无任何功能限制

#### 👨‍💻 操作员 (Operator)
- ✅ 访问核心发布功能：
  - 发布看板 (`/overview`)
  - 发布操作 (`/projects`)
  - 发布历史 (`/releases`)
  - 设置 (`/settings`)
- ❌ **无法访问**：
  - 关联对比
  - 下架排查
  - 目标包监控
  - 团队管理
  - 其他高级功能
- ⚙️ **设置限制**：
  - "下架状态自动监控"默认关闭，可手动开启
  - "目标包自动监控"默认关闭，可手动开启

---

## 🚀 部署步骤

### 步骤 1：执行数据库迁移

1. 登录 **Supabase Dashboard**
2. 进入 **SQL Editor**
3. 执行数据库迁移脚本：

```bash
# 位置
/database-rbac-migration.sql
```

4. 确认执行成功，看到以下提示：

```
✅ RBAC 权限系统迁移完成！
已创建的表：
  - user_profiles (用户配置和角色)
已创建的函数：
  - is_admin() - 检查当前用户是否为管理员
  - get_current_user_role() - 获取当前用户角色
  - check_user_permission() - 检查用户权限
```

### 步骤 2：重新构建前端

```bash
cd fastlane-ui
npm install  # 如果有新依赖
npm run build
```

### 步骤 3：重启服务

```bash
# 重启前端服务
# 如果使用 PM2
pm2 restart fastlane-ui

# 如果使用其他方式，请重启对应的进程
```

---

## 📝 首次使用说明

### 自动初始化管理员

**第一个注册/登录的用户将自动成为管理员。**

- 如果数据库中已有用户，第一个（按创建时间排序）用户会被设置为管理员
- 后续注册的用户默认为操作员
- 管理员可以在"团队管理"页面修改其他用户的角色

### 分配角色

1. 以管理员身份登录
2. 进入左侧菜单 **"更多功能"** → **"团队管理"**
3. 在用户列表中，点击角色下拉框修改用户角色
4. 系统会自动保存更改

> ⚠️ **重要提示**：系统至少需要保留一个管理员账号，无法将最后一个管理员改为操作员。

---

## 🎯 功能验证

### 验证管理员功能

1. 以管理员身份登录
2. 确认可以看到所有菜单项：
   - ✅ 发布看板、发布操作、发布历史
   - ✅ 关联对比、下架排查
   - ✅ 目标包监控
   - ✅ 团队管理（在"更多功能"中）
3. 进入"设置"页面，确认可以配置所有监控服务

### 验证操作员功能

1. 创建一个测试用户并设置为操作员
2. 以操作员身份登录
3. 确认只能看到以下菜单项：
   - ✅ 发布看板
   - ✅ 发布操作
   - ✅ 发布历史
   - ✅ 设置
4. 尝试访问受限页面（如 `/app-comparison`），应该被拦截并跳转
5. 进入"设置"页面，确认：
   - ✅ 看到"操作员权限说明"提示
   - ✅ "下架状态自动监控"默认关闭
   - ✅ "目标包自动监控"默认关闭
   - ✅ 可以手动开启这两个选项
   - ❌ 看不到"审核状态自动监控"选项

---

## 📊 数据库表结构

### `user_profiles` 表

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | UUID | 用户ID（关联 auth.users） |
| `email` | TEXT | 用户邮箱 |
| `full_name` | TEXT | 用户姓名 |
| `role` | TEXT | 角色（admin / operator） |
| `enable_app_removal_monitor` | BOOLEAN | 操作员：下架监控开关（默认false） |
| `enable_target_app_monitor` | BOOLEAN | 操作员：目标包监控开关（默认false） |
| `created_at` | TIMESTAMP | 创建时间 |
| `updated_at` | TIMESTAMP | 更新时间 |

---

## 🔒 权限控制实现

### 前端层面

1. **侧边栏菜单过滤** (`components/sidebar.tsx`)
   - 根据 `adminOnly` 标记过滤菜单项
   - 操作员看不到管理员专用功能

2. **路由权限保护** (`components/role-guard.tsx`)
   - 在 dashboard layout 中拦截未授权访问
   - 自动跳转到首页并提示

3. **设置页面权限** (`app/(dashboard)/settings/page.tsx`)
   - 管理员：配置全局监控服务
   - 操作员：配置个人监控偏好（默认关闭）

4. **团队管理** (`app/(dashboard)/team/page.tsx`)
   - 仅管理员可访问
   - 支持修改用户角色

### 后端层面

1. **权限验证中间件** (`fastlane-agent/src/auth-middleware.ts`)
   - `requireAuth()` - 验证用户登录
   - `requireAdmin()` - 验证管理员权限
   - `requireAdminAuth` - 组合中间件

2. **数据库 RLS 策略**
   - 所有用户可以查看用户列表
   - 用户可以更新自己的配置
   - 只有管理员可以更新其他用户的角色

---

## 🛠️ 故障排查

### 问题1：登录后看不到任何菜单

**原因**：用户角色未正确加载

**解决方案**：
1. 检查数据库迁移是否成功执行
2. 确认 `user_profiles` 表中有该用户的记录
3. 尝试重新登录

### 问题2：操作员可以访问受限页面

**原因**：前端缓存或构建问题

**解决方案**：
```bash
cd fastlane-ui
rm -rf .next
npm run build
# 重启服务
```

### 问题3：无法修改用户角色

**原因**：RLS 策略未正确设置

**解决方案**：
1. 确认 `is_admin()` 函数已创建
2. 检查 Supabase RLS 策略是否启用
3. 确认当前用户确实是管理员

### 问题4：第一个用户不是管理员

**解决方案**：
```sql
-- 手动设置某个用户为管理员
UPDATE user_profiles
SET role = 'admin'
WHERE email = 'your-email@example.com';
```

---

## 📈 后续扩展

### 添加新角色类型

1. 在 `lib/types.ts` 中添加新角色：
```typescript
export type UserRole = 'admin' | 'operator' | 'viewer';
```

2. 更新 `ROLE_CONFIG` 配置

3. 修改数据库约束：
```sql
ALTER TABLE user_profiles DROP CONSTRAINT user_profiles_role_check;
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_role_check 
  CHECK (role IN ('admin', 'operator', 'viewer'));
```

### 添加更细粒度的权限

可以在 `user_profiles` 表中添加更多权限字段：

```sql
ALTER TABLE user_profiles ADD COLUMN can_delete_projects BOOLEAN DEFAULT false;
ALTER TABLE user_profiles ADD COLUMN can_manage_settings BOOLEAN DEFAULT false;
```

---

## 📞 技术支持

如有问题，请检查：
1. Supabase Dashboard 的日志
2. 浏览器开发者工具控制台
3. 前端服务日志

---

## 🚀 路由和认证规则

### 自动路由逻辑（已实现）
以下路由逻辑已在代码中实现，部署后自动生效：

1. **根路径 `/`**
   - 已登录 → 自动跳转到 `/overview`
   - 未登录 → 自动跳转到 `/login`

2. **未登录用户访问任何页面**
   - `/overview` → `/login`
   - `/projects` → `/login`
   - `/settings` → `/login`
   - 任何其他页面 → `/login`

3. **已登录用户访问登录页**
   - `/login` → `/overview`（自动跳转）

4. **登录成功后**
   - → `/overview`（发布看板）

### 实现文件
- `app/page.tsx` - 根路径重定向
- `app/login/page.tsx` - 登录逻辑和已登录检查
- `components/auth-guard.tsx` - 全局认证保护
- `components/role-guard.tsx` - 角色权限检查

### Session 管理
- **首次访问**：验证 Supabase session（可能需要15秒）
- **页面切换**：秒开（复用已登录状态）
- **刷新页面**：秒开（从 localStorage 恢复）
- **超时处理**：15秒超时后跳转到登录页

---

## 📋 生产环境部署清单

### 部署前必须完成
- [ ] 在 Supabase 执行 `database-rbac-migration.sql`
- [ ] 使用 `set-admin.sql` 设置第一个管理员账号
- [ ] 确认 `user_profiles` 表已创建并有数据
- [ ] 确认环境变量已配置（前后端）

### 构建和部署
```bash
# 前端
cd fastlane-ui
npm install
npm run build
npm run start  # 或使用 PM2

# 后端
cd fastlane-agent
npm install
npm run build
npm run start  # 或使用 PM2
```

### 部署后必须测试
- [ ] 未登录访问 `/` 自动跳转到 `/login`
- [ ] 未登录访问 `/settings` 自动跳转到 `/login`
- [ ] 登录成功后跳转到 `/overview`
- [ ] 已登录访问 `/login` 自动跳转到 `/overview`
- [ ] 刷新页面保持登录状态
- [ ] 管理员可以看到所有菜单
- [ ] 操作员只能看到4个菜单项
- [ ] 操作员访问受限页面被拦截

---

## 🔒 安全检查

### Supabase RLS 策略确认
- [ ] `user_profiles` 表的 RLS 已启用
- [ ] 所有认证用户可以查看用户列表
- [ ] 用户只能修改自己的配置
- [ ] 只有管理员可以修改其他用户的角色

### 权限保护验证
- [ ] 操作员无法访问 `/app-comparison`
- [ ] 操作员无法访问 `/team`
- [ ] 操作员设置页面监控选项默认关闭
- [ ] 管理员可以修改用户角色

---

**部署完成时间**：2026-01-01  
**版本**：6.1 (RBAC 权限系统)  
**状态**：✅ 已完成

