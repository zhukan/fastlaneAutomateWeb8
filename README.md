# 🚀 Fastlane 自动发布系统

> iOS App Store 自动化发布平台 | 下架排查 | 权限管理 | 明道云集成

**当前版本**: v6.1 | **发布日期**: 2026-01-01

## ✨ 核心功能

### 📱 发布管理
| 功能 | 描述 |
|------|------|
| **一键发布** | Web 界面触发 fastlane，自动完成构建、签名、上传 |
| **版本管理** | 记录每次发布的详细信息，便于追溯 |
| **发布历史** | 完整的发布记录和状态追踪 |
| **实时日志** | SSE 流式传输，实时查看发布进度 |

### 🔍 监控分析
| 功能 | 描述 | 版本 |
|------|------|------|
| **审核监控** | 自动检查 App Store 审核状态 | v3.0+ |
| **下架监控** | 实时检测 App 是否被下架 | v3.5+ |
| **关联对比** | 对比"我的包"和"目标包"下架情况 | v5.0+ |
| **下架排查** ⭐ | 分析下架 App 的操作记录，排查下架原因 | v6.0 |
| **目标包监控** | 监控竞品 App 的状态变化 | v4.0+ |

### 🔐 权限管理 ⭐
| 功能 | 描述 | 版本 |
|------|------|------|
| **角色管理** | 管理员 / 操作员两种角色 | v6.1 |
| **菜单权限** | 基于角色的菜单动态过滤 | v6.1 |
| **路由保护** | 防止未授权访问受限页面 | v6.1 |
| **团队管理** | 管理员可分配用户角色 | v6.1 |

### 🔗 集成能力
| 功能 | 描述 |
|------|------|
| **明道云集成** | 自动获取开发者账号、App信息、操作记录 |
| **Supabase** | 数据库 + 认证 + 实时订阅 |
| **Fastlane** | iOS 自动化构建和发布 |

---

## ⚡ 快速开始

### 1. 配置数据库

在 Supabase Dashboard → SQL Editor 依次执行：

```bash
1. database-complete.sql           # 基础数据库表
2. database-rbac-migration.sql     # 权限管理系统 (v6.1)
3. set-admin.sql                   # 设置管理员账号
```

### 2. 配置环境变量

**后端 (fastlane-agent/.env)**：
```env
# Supabase 配置
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...
SUPABASE_ANON_KEY=eyJhbG...

# 明道云 API - 二维奇智应用
HAP_APP_KEY=xxx
HAP_SIGN=xxx

# 明道云 API - App工厂应用
HAP_APP_KEY_PRODUCTION_RELEASES=xxx
HAP_SIGN_PRODUCTION_RELEASES=xxx

# 工作表 ID
HAP_WORKSHEET_PRODUCTS=xxx
HAP_WORKSHEET_ACCOUNTS=xxx
HAP_WORKSHEET_PRODUCTION_RELEASES=xxx
HAP_WORKSHEET_UPDATE_TASKS=xxx
```

**前端 (fastlane-ui/.env.local)**：
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...
NEXT_PUBLIC_API_URL=http://localhost:3000
```

### 3. 启动服务

```bash
# 后端
cd fastlane-agent
npm install
npm run build
npm start

# 前端（新终端）
cd fastlane-ui
npm install
npm run build
npm start
```

### 4. 首次登录

1. 打开 http://localhost:3001
2. 使用 Supabase 中创建的用户登录
3. **第一个登录的用户自动成为管理员** 🎉
4. 后续用户默认为操作员，管理员可在"团队管理"中分配角色

### 5. 快速验证

- ✅ 管理员：可以看到所有菜单（包括"下架排查"、"团队管理"）
- ✅ 操作员：只能看到4个菜单（发布看板、发布操作、发布历史、设置）

---

## 🏗️ 项目结构

```
├── fastlane-agent/                    后端 Agent (Node.js + Express)
│   ├── src/                           TypeScript 源码
│   │   ├── server.ts                  服务器入口
│   │   ├── task-executor.ts           任务执行器
│   │   ├── review-monitor.ts          审核监控服务
│   │   ├── app-removal-monitor.ts     下架监控服务
│   │   ├── app-removal-investigation-service.ts  下架排查服务 (v6.0)
│   │   ├── auth-middleware.ts         权限验证中间件 (v6.1)
│   │   └── hap-client.ts              明道云 API 客户端
│   └── dist/                          编译后的 JS 文件
│
├── fastlane-ui/                       前端 UI (Next.js 14 + React)
│   ├── app/                           App Router 页面
│   │   ├── (dashboard)/               Dashboard 布局
│   │   │   ├── overview/              发布看板
│   │   │   ├── projects/              发布操作
│   │   │   ├── releases/              发布历史
│   │   │   ├── app-comparison/        关联对比 (v5.0)
│   │   │   ├── removal-investigation/ 下架排查 (v6.0) ⭐
│   │   │   ├── team/                  团队管理 (v6.1) ⭐
│   │   │   └── settings/              设置
│   │   └── login/                     登录页面
│   ├── components/                    React 组件
│   │   ├── auth-guard.tsx             认证保护
│   │   ├── role-guard.tsx             角色权限保护 (v6.1) ⭐
│   │   └── sidebar.tsx                侧边栏菜单
│   ├── hooks/                         React Hooks
│   │   └── use-auth.ts                权限管理 Hook (v6.1) ⭐
│   └── lib/                           工具库
│       ├── supabase.ts                Supabase 客户端
│       ├── store.ts                   全局状态管理
│       └── types.ts                   TypeScript 类型定义
│
├── fastlane/                          Fastlane 配置模板
│
├── database-complete.sql              数据库初始化脚本
├── database-rbac-migration.sql        RBAC 权限系统迁移 (v6.1) ⭐
├── set-admin.sql                      设置管理员脚本 (v6.1) ⭐
├── fix-rls-policies.sql               RLS 策略修复脚本 (v6.1)
│
├── PRD6.0.md                          产品需求文档 (下架排查 + RBAC)
├── RBAC-DEPLOYMENT.md                 RBAC 部署指南 (v6.1) ⭐
├── QUICKSTART.md                      快速使用指南
└── README.md                          本文件
```

---

## 🌐 部署

| 组件 | 部署位置 |
|------|----------|
| fastlane-ui | Zeabur / Vercel |
| fastlane-agent | 本地 Mac（需要 Xcode） |
| 数据库 | Supabase |

**内网穿透**：使用 ngrok 让云端前端访问本地 Agent
```bash
ngrok http 3000
```

---

## 📚 文档

### 产品文档
- 📋 **[PRD6.0.md](./PRD6.0.md)** - 产品需求文档（下架排查 v6.0 + RBAC v6.1）
- 📖 **[QUICKSTART.md](./QUICKSTART.md)** - 快速使用指南

### 部署文档
- 🔐 **[RBAC-DEPLOYMENT.md](./RBAC-DEPLOYMENT.md)** - RBAC 权限系统部署指南 (v6.1) ⭐
- 🗄️ **[database-complete.sql](./database-complete.sql)** - 基础数据库表
- 🗄️ **[database-rbac-migration.sql](./database-rbac-migration.sql)** - RBAC 权限系统迁移

### 工具脚本
- 🔧 **[set-admin.sql](./set-admin.sql)** - 设置管理员账号
- 🔧 **[fix-rls-policies.sql](./fix-rls-policies.sql)** - RLS 策略修复

---

## 🛠️ 技术栈

| 类别 | 技术 |
|------|------|
| 后端 | Node.js 18+ / Express / TypeScript |
| 前端 | Next.js 14 / React 18 / shadcn/ui / Tailwind CSS |
| 数据库 | PostgreSQL (Supabase) |
| 认证 | Supabase Auth + RLS (Row Level Security) |
| 状态管理 | Zustand (持久化) |
| API 集成 | 明道云 V3 API |
| iOS 自动化 | Fastlane + Ruby |

---

## 🎯 版本历史

| 版本 | 日期 | 主要功能 |
|------|------|----------|
| **v6.1** | 2026-01-01 | ⭐ RBAC 权限系统（管理员/操作员角色） |
| **v6.0** | 2025-12-31 | ⭐ 下架排查功能（操作记录分析） |
| **v5.0** | 2025-12-28 | 关联对比功能（我的包 vs 目标包） |
| **v4.0** | 2025-12-20 | 目标包监控功能 |
| **v3.5** | 2025-12-15 | 下架监控增强 |
| **v3.0** | 2025-12-01 | 审核监控功能 |
| **v2.0** | 2025-11-15 | 发布历史记录 |
| **v1.0** | 2025-11-01 | 基础发布功能 |

---

## 🔐 权限管理 (v6.1)

系统支持两种角色，自动根据权限过滤功能和菜单：

### 👨‍💼 管理员 (Administrator)
- ✅ 访问所有功能和页面
- ✅ 管理团队成员角色
- ✅ 配置全局监控服务

### 👨‍💻 操作员 (Operator)
- ✅ 发布看板、发布操作、发布历史、设置
- ❌ 无法访问：关联对比、下架排查、目标包监控、团队管理等

详细说明请参考 **[RBAC-DEPLOYMENT.md](./RBAC-DEPLOYMENT.md)**

---

**v6.1** | 2026-01-01 | Made with ❤️ for iOS developers
