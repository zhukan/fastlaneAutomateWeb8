# Fastlane Agent

本地 Agent 服务，为 Fastlane Web UI 提供后端支持。

## 功能特性

- 📦 项目管理和自动检测
- 🔧 自动生成 fastlane 配置文件
- 🚀 执行 fastlane 发布任务
- 📝 实时日志流式传输
- ⚙️ 全局配置管理

## 安装

### 1. 安装依赖

```bash
cd fastlane-agent
npm install
```

### 2. 构建

```bash
npm run build
```

## 使用

### 开发模式

```bash
npm run dev
```

### 生产模式

```bash
npm run build
npm start
```

服务器将在 `http://localhost:3000` 启动。

## API 端点

### 健康检查

```
GET /health
```

返回服务器状态。

### 全局配置

```
GET /config/global
PUT /config/global
```

获取或更新全局配置（Apple ID, Team ID 等）。

### 项目管理

```
GET /projects              # 获取所有项目
POST /projects/detect      # 检测项目
POST /projects             # 添加项目
GET /projects/:id          # 获取项目详情
GET /projects/:id/info     # 获取项目实时信息
DELETE /projects/:id       # 删除项目
```

### 任务管理

```
POST /tasks                # 创建发布任务
GET /tasks/:id             # 获取任务状态
GET /tasks/:id/stream      # SSE 实时日志流
POST /tasks/:id/cancel     # 取消任务
```

## 配置文件

配置文件存储在：`~/.fastlane-agent/config.json`

结构：

```json
{
  "global": {
    "appleId": "your-apple-id@example.com",
    "teamId": "YOUR_TEAM_ID",
    "itcTeamId": "123456789",
    "appSpecificPassword": "xxxx-xxxx-xxxx-xxxx"
  },
  "projects": [
    {
      "id": "uuid",
      "name": "MyApp",
      "path": "/Users/username/Projects/MyApp",
      "bundleId": "com.company.app",
      "workspace": "MyApp.xcworkspace",
      "scheme": "MyApp",
      "useMatch": false,
      "currentVersion": "1.0.0",
      "currentBuild": "1",
      "createdAt": "2024-11-15T10:00:00Z"
    }
  ]
}
```

## 环境变量

### 基础配置

- `PORT`: 服务器端口（默认 3000）

### 明道云集成（可选）

用于自动查询 Apple 开发者账号配置：

- `HAP_APP_KEY`: 明道云 AppKey（必需）
- `HAP_SIGN`: 明道云 Sign（必需）
- `HAP_WORKSHEET_PRODUCTS`: "账号上的产品"表 ID（必需）
- `HAP_WORKSHEET_ACCOUNTS`: "苹果开发者账号"表 ID（必需）
- `HAP_WORKSHEET_TARGET_PACKAGES`: "目标包"表 ID（可选，用于降级查询）
- `HAP_WORKSHEET_PRODUCTION_RELEASES`: "App生产发布"表 ID（可选，用于降级查询）

**降级查询说明：**

当配置了 `HAP_WORKSHEET_TARGET_PACKAGES` 和 `HAP_WORKSHEET_PRODUCTION_RELEASES` 时，系统会在主查询路径失败后自动尝试降级查询。这对于首次发布的场景特别有用，因为此时"账号上的产品"表中可能还没有记录。

查询流程：
1. **主路径**：通过"账号上的产品"表查询开发者账号
2. **降级路径**（主路径失败时）：通过"目标包"表 → "App生产发布"表 → 开发者账号

### Supabase 集成（可选）

用于持久化发布记录和审核状态监控：

- `SUPABASE_URL`: Supabase 项目 URL
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase Service Role Key

## 开发

### 文件结构

```
src/
  index.ts              # 入口文件
  server.ts             # Express 服务器
  types.ts              # 类型定义
  config-manager.ts     # 配置管理
  project-detector.ts   # 项目检测
  env-generator.ts      # 环境文件生成
  task-executor.ts      # 任务执行
  step-parser.ts        # 步骤解析
```

### 添加新功能

1. 在 `types.ts` 中定义类型
2. 创建对应的模块文件
3. 在 `server.ts` 中添加 API 端点

## 注意事项

- 需要在 macOS 上运行（需要 Xcode 和 fastlane）
- 确保已安装 fastlane：`brew install fastlane`
- 首次使用需要配置全局 Apple 开发者账户信息

## License

MIT

