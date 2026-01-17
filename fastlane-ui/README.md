# Fastlane UI

基于 Next.js 14 的 Fastlane 可视化管理界面。

## 功能特性

- 📱 项目管理 - 添加、配置、管理 iOS 项目
- 🚀 一键发布 - 发布到 TestFlight 或 App Store
- 📊 实时进度 - 发布进度可视化追踪
- 📝 日志查看 - 代码高亮的实时日志流
- ⚙️ 配置管理 - 可视化配置 Apple 开发者账户
- 🔌 Agent 连接 - 自动检测本地 Agent 连接状态

## 技术栈

- **框架**: Next.js 14 (App Router)
- **样式**: Tailwind CSS + shadcn/ui
- **状态管理**: Zustand
- **数据请求**: TanStack Query (React Query)
- **日志高亮**: react-syntax-highlighter
- **图标**: Lucide React

## 安装

### 1. 安装依赖

```bash
cd fastlane-ui
npm install
```

### 2. 启动开发服务器

```bash
npm run dev
```

应用将在 `http://localhost:3001` 启动。

## 使用

### 前提条件

确保 fastlane-agent 已启动：

```bash
cd ../fastlane-agent
npm run dev
```

### 使用流程

1. **打开应用** - 访问 http://localhost:3001
2. **配置全局设置** - 点击右上角"设置"，填写 Apple ID 和 Team ID
3. **添加项目** - 点击"添加项目"，输入项目路径
4. **发布应用** - 在项目卡片上点击"TestFlight"或"App Store"
5. **查看进度** - 实时查看发布进度和日志

## 项目结构

```
app/
  page.tsx                       # 主页 Dashboard
  layout.tsx                     # 根布局
  providers.tsx                  # React Query Provider
  projects/[id]/deploy/page.tsx  # 发布页面
  globals.css                    # 全局样式

components/
  ui/                            # shadcn/ui 组件
  connection-status.tsx          # 连接状态组件
  project-card.tsx               # 项目卡片
  log-viewer.tsx                 # 日志查看器
  progress-tracker.tsx           # 进度追踪器
  add-project-dialog.tsx         # 添加项目对话框
  global-settings-dialog.tsx     # 全局设置对话框

lib/
  agent-client.ts                # Agent API 客户端
  types.ts                       # 类型定义
  store.ts                       # Zustand 状态管理
  utils.ts                       # 工具函数

hooks/
  use-agent-connection.ts        # Agent 连接状态
  use-projects.ts                # 项目管理
  use-task-stream.ts             # 任务日志流
```

## 部署到 Vercel

### 1. 推送代码到 GitHub

```bash
git add .
git commit -m "Initial commit"
git push origin main
```

### 2. 导入到 Vercel

1. 访问 [vercel.com](https://vercel.com)
2. 点击 "New Project"
3. 导入你的 GitHub 仓库
4. Root Directory 选择 `fastlane-ui`
5. 点击 "Deploy"

### 3. 配置 CORS

部署后，需要在 fastlane-agent 的 `server.ts` 中添加你的 Vercel 域名到 CORS 白名单：

```typescript
cors({
  origin: [
    'http://localhost:3001',
    'https://your-app.vercel.app', // 添加你的域名
    /\.vercel\.app$/,
  ],
  credentials: true,
})
```

## 开发

### 添加新组件

使用 shadcn/ui CLI 添加组件：

```bash
npx shadcn@latest add [component-name]
```

### 类型定义

所有类型定义都在 `lib/types.ts` 中，与 Agent 后端保持一致。

### 状态管理

使用 Zustand 管理全局状态：

```typescript
import { useAppStore } from '@/lib/store';

const { isConnected, projects } = useAppStore();
```

### API 调用

使用 AgentClient 调用后端 API：

```typescript
import { agentClient } from '@/lib/agent-client';

const projects = await agentClient.getProjects();
```

## 环境变量

创建 `.env.local` 文件（可选）：

```bash
NEXT_PUBLIC_AGENT_URL=http://localhost:3000
```

默认连接到 `http://localhost:3000`。

## 注意事项

- 应用必须与 fastlane-agent 配合使用
- 需要在 macOS 上运行 Agent
- 首次使用需要配置全局 Apple 开发者账户信息
- 生产环境部署后，确保本地 Agent 允许来自 Vercel 的 CORS 请求

## License

MIT
