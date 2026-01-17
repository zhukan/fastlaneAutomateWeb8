# 快速使用指南

## 第一次使用

### 1. 启动服务

在两个终端窗口分别运行：

**终端 1 - 启动 Agent：**
```bash
cd fastlane-agent && npm start
```

**终端 2 - 启动 Cloudflare Tunnel（需要从外部访问时）：**
```bash
cloudflared tunnel --url http://localhost:3000 --protocol auto
```

看到以下信息说明 Agent 启动成功：
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚀 Fastlane Agent Server 已启动
📡 运行在: http://localhost:3000
⚙️  配置文件: ~/.fastlane-agent/config.json
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**终端 3 - 启动 UI（本地开发时）：**
```bash
cd fastlane-ui && npm run dev
```

打开浏览器访问：http://localhost:3001

### 2. 用户登录

系统需要登录才能使用。如果是首次使用，需要管理员在 Supabase Dashboard 创建用户账号。

**登录步骤：**
1. 打开 http://localhost:3001
2. 系统会自动跳转到登录页面
3. 输入管理员提供的邮箱和密码
4. 登录成功后进入主界面

**创建用户账号（管理员操作）：**
1. 访问 [Supabase Dashboard](https://supabase.com/dashboard)
2. 选择你的项目
3. 进入 Authentication → Users
4. 点击 "Add user" → "Create new user"
5. 输入邮箱和密码
6. 点击 "Create user"

💡 **提示**：出于安全考虑，系统不开放自助注册功能，所有用户账号由管理员统一创建。

### 3. 配置认证方式（重要）

**推荐使用 App Store Connect API Key 认证（无需密码，无需双因素认证）**

#### 方式一：API Key 认证（推荐）⭐

**为什么使用 API Key？**

✅ **无需密码** - 不需要输入 Apple ID 密码  
✅ **无需双因素认证** - 避免交互式验证码输入  
✅ **更安全** - Key 可以随时撤销，不暴露主账户密码  
✅ **更稳定** - 适合自动化流程，不会因为认证问题中断  
✅ **权限可控** - 可以设置不同的访问级别  

**获取 API Key：**

1. 访问 [App Store Connect - Users and Access](https://appstoreconnect.apple.com/access/api)
2. 点击 **"Keys"** 标签
3. 点击 **"+"** 生成新 Key
4. 填写信息：
   - **Name**: 例如 "Fastlane Automation"
   - **Access**: 选择 **"Admin"** 或 **"Developer"**
5. 点击 **"Generate"**
6. **⚠️ 重要**：下载 `.p8` 文件（只能下载一次！）
7. 记录以下信息：
   - **Key ID**: 10 位字符，例如 `ABC123DEFG`
   - **Issuer ID**: UUID 格式
   - **文件路径**: 保存 `.p8` 文件的位置

**在项目中配置：**

1. 在项目设置中选择 **"API Key 认证"**
2. 填写 **Key ID**（例如：ABC123DEFG）
3. 填写 **Issuer ID**（UUID 格式）
4. 填写 **API Key 文件路径**（完整路径，例如：`/Users/username/Documents/AuthKey_ABC123DEFG.p8`）

**安全建议：**
- 不要提交 `.p8` 文件到 Git
- 不要分享给他人
- 建议加密存储
- 定期轮换 API Key

#### 方式二：密码认证

1. 点击右上角 **"设置"** 按钮
2. 填写必填信息：
   - **Apple ID**: 你的 Apple Developer 账户邮箱
   - **Team ID**: 在 [Apple Developer](https://developer.apple.com/account) 的 Membership 页面找到
3. 可选信息：
   - **ITC Team ID**: 如果属于多个团队才需要
   - **App-Specific Password**: 双重认证时需要，在 [appleid.apple.com](https://appleid.apple.com) 生成
4. 点击 **"保存配置"**

> **注意**：API Key 认证更安全、更稳定，不需要处理双因素认证问题，强烈推荐！

### 4. 配置明道云集成（可选）

如果你使用明道云管理开发者账号信息，可以配置自动查询功能：

1. 在 `fastlane-agent` 目录创建 `.env` 文件：
```bash
HAP_APP_KEY=your_app_key
HAP_SIGN=your_sign
HAP_WORKSHEET_PRODUCTS=643418197f0301fb51750f00
HAP_WORKSHEET_ACCOUNTS=640adea9c04c8d453ff1ce52
```

2. 重启 Agent 服务

配置后，添加项目时系统会自动根据 Bundle ID 查询并填充开发者账号信息。

### 5. 添加项目

点击首页的 **"添加项目"** 按钮：

1. 输入项目名称
2. 输入项目路径，例如：
   ```
   /Users/username/Projects/MyApp
   ```
3. 点击 **"验证项目路径"**
4. 系统自动检测项目信息：
   - Workspace/Project
   - Scheme
   - Bundle ID
   - 当前版本号
   - Fastlane 配置状态
5. **✨ 自动配置 Fastlane**：如果项目没有 `fastlane/` 目录，系统会自动复制模板
6. **🆕 自动查询账号信息**：如果配置了明道云，系统会根据 Bundle ID 自动查询并填充开发者账号信息
7. 确认信息无误后点击 **"添加项目"**

> **提示**：如果系统自动配置了账号信息，你会看到"已自动配置 Apple 开发者账号"的提示，可以直接发布。如果未找到账号信息，需要在项目设置中手动配置。

### 6. 发布应用

**发布流程（2 步）**

#### 步骤 1：配置 Apple 账号

在项目卡片上点击 **"配置 Apple 账号"**，填写：
- Apple ID
- Team ID
- App Store Connect API Key（推荐）或 Apple ID 密码

#### 步骤 2：发布到 App Store

点击 **"发布到 App Store"** 按钮，进入发布页面。

**发布准备页面（选择发布类型）**

进入发布页面后，会看到 2 个 Tab：

```
[ 全新发布 ]  [ 升级发布 ]  ← 选择发布类型
```

**根据你的情况选择：**

##### 🚀 全新发布（首次发布）

如果这是首次发布此应用，选择 **"全新发布"** Tab：

**步骤 1：创建 App**
- **方式一：使用命令行创建（推荐）⭐**
  1. 展开"方式一"（默认已展开）
  2. 点击 **"复制命令"** 按钮
  3. 在终端粘贴并执行
  4. 按提示输入 Apple ID 密码和验证码
  5. 等待创建完成

- **方式二：在 App Store Connect 网页创建**
  1. 展开"方式二"
  2. 点击 **"打开 App Store Connect"** 按钮
  3. 按照页面提示填写信息创建 App

**步骤 2：开始发布**
- 创建完成后，点击大大的 **"全新发布"** 按钮
- 系统开始自动发布流程

##### 🔄 升级发布（更新已有应用）

如果应用已经在 App Store Connect 创建过，选择 **"升级发布"** Tab（默认 Tab）：

- 页面会显示完整的发布流程说明
- 直接点击大大的 **"升级发布"** 按钮
- 系统开始自动发布流程

**发布流程自动执行：**
- ✅ 自动更新 Build Number
- ✅ 获取证书和配置文件
- ✅ 构建 IPA
- ✅ 上传到 App Store Connect
- ⏱️ 整个流程通常需要 5-8 分钟

**实时查看：**
- 发布进度（每个步骤的状态）
- 完整日志（代码高亮）
- 耗时统计

## 日常使用

### 更新发布（已创建过 App）

当 App 已经在 App Store Connect 创建过后，后续的更新发布非常简单：

1. 打开 UI (http://localhost:3001)
2. 找到要发布的项目
3. 点击 **"发布到 App Store"** 按钮
4. 进入发布准备页面
5. 选择 **"升级发布"** Tab（默认选中）
6. 点击 **"升级发布"** 按钮
7. 系统会自动开始发布流程：
   - 自动更新 Build Number
   - 获取证书和配置文件
   - 构建 IPA
   - 上传到 App Store Connect
8. 等待发布完成（通常 5-8 分钟）

### 发布到 TestFlight（可选）

如果需要先在 TestFlight 测试：

1. 打开 UI
2. 找到要发布的项目
3. 点击 **"App Store"** 按钮
4. 等待上传完成
5. 去 [App Store Connect](https://appstoreconnect.apple.com) 提交审核

### 自定义更新日志

创建 `<项目目录>/fastlane/changelog.txt`：
```
修复了闪退问题
优化了加载速度
新增了深色模式
```

下次发布会自动使用这个日志

## 常见操作

### 查看项目信息
- 项目卡片显示当前版本号和 Build Number
- 系统每 30 秒自动刷新

### 删除项目
1. 点击项目卡片右上角的垃圾桶图标
2. 确认删除

**注意：** 只删除配置，不删除项目文件

### 修改配置
点击项目卡片的 **"配置 Apple 账号"** 可随时修改 Apple 账户信息

### 重新同步账号信息
如果明道云中的账号信息更新了，可以在项目设置中点击 **"重新同步"** 按钮，系统会重新从明道云查询并更新配置

### 取消发布
在发布页面点击 **"取消发布"** 可中止正在进行的任务

## 故障排查

### ❌ 显示"未连接"

**原因：** Agent 未启动或端口被占用

**解决：**
```bash
cd fastlane-agent
npm run dev
```

### ❌ 项目检测失败

**原因：** 路径错误或不是有效的 iOS 项目

**解决：**
1. 确保路径正确
2. 确保包含 `.xcodeproj` 或 `.xcworkspace`
3. 在 Finder 中复制路径：右键 → 获取信息 → 复制路径

### ❌ 发布失败 - 找不到 App ID

**错误信息：**
```
Could not find App with App Identifier 'com.example.app'
```

**原因：** App Store Connect 中未创建 App

**解决：** 按照上面"创建 App"章节操作，使用 UI 辅助创建功能

### ❌ 密码认证失败

**错误信息：**
```
Missing password for user xxx@xxx.com, and running in non-interactive shell
```

**解决方案（推荐）：**
切换到 **App Store Connect API Key 认证**，完全自动化，无需密码

**或者使用密码认证：**
在项目设置中填写 App-Specific Password：
1. 访问 [appleid.apple.com](https://appleid.apple.com)
2. 登录后进入 "安全" 部分
3. 在 "App 专用密码" 下点击 "生成密码"
4. 输入标签名称（例如：Fastlane）
5. 复制生成的密码
6. 在项目设置中粘贴

### ❌ 代码签名失败

**错误信息：**
```
Signing for "YourApp" requires a development team
```

**原因：** Xcode 签名配置问题

**解决：**
1. 打开 Xcode 项目
2. Xcode → Settings → Accounts → 添加 Apple ID
3. 选择 Target → Signing & Capabilities
4. 勾选 **"Automatically manage signing"**
5. 选择正确的 Team

### ❌ 证书找不到

**错误信息：**
```
Certificate 95QRXW5J4N can't be found on your local computer
```

**解决：**
1. 系统会自动创建新证书（如果使用 API Key）
2. 或在 Xcode 中登录账号让 Xcode 自动管理
3. 或手动下载证书并导入到 Keychain

### ❌ Build Number 冲突

**错误信息：**
```
Build version already exists
```

**解决：** 系统会自动处理，基于 App Store Connect 最新版本递增

### ❌ 网络超时

**错误信息：**
```
Upload timed out
```

**解决：**
1. 检查网络连接
2. 使用稳定的网络环境
3. 如果文件很大，可能需要更长时间

### ❌ Vercel 部署后无法连接

**原因：** CORS 配置问题

**解决：**
在 Agent 的 `fastlane-agent/src/server.ts` 中添加 Vercel 域名到 CORS 白名单：
```typescript
cors({
  origin: [
    'http://localhost:3001',
    'https://your-app.vercel.app', // 添加你的域名
    /\.vercel\.app$/,
  ]
})
```

## 高级技巧

### 管理多个项目

✅ **每个项目完全独立**
- 每个项目都有自己的 `fastlane/` 目录和 `.env` 配置
- 可以同时为多个项目启动发布任务，互不干扰
- 系统会自动处理项目之间的隔离

📂 **项目结构示例：**
```
MyApp1/
├── MyApp1.xcodeproj
└── fastlane/            ← 自动复制
    ├── Fastfile
    ├── Appfile
    └── .env             ← 项目 1 的配置

MyApp2/
├── MyApp2.xcworkspace
└── fastlane/            ← 自动复制
    ├── Fastfile
    ├── Appfile
    └── .env             ← 项目 2 的配置
```

### 查看 Agent 日志
```bash
cd fastlane-agent
npm run dev
```
在终端查看详细日志

### 手动执行 fastlane
如果需要更多控制：
```bash
cd <项目目录>
fastlane beta              # TestFlight
fastlane release           # App Store
fastlane version_info      # 查看版本
fastlane clean             # 清理构建产物
```

### 配置元数据

下载现有元数据：
```bash
cd <项目目录>
fastlane download_metadata
```

元数据会保存到 `fastlane/metadata/` 目录，可以编辑后上传：
```bash
fastlane upload_metadata
```

## 团队使用

### 每个人的电脑上
1. 克隆项目
2. 安装依赖（Agent 和 UI）
3. 启动两个服务
4. 配置各自的 Apple 账户（如果不同）
5. 添加各自负责的项目

### 共享配置（可选）
全局配置存储在 `~/.fastlane-agent/config.json`

可以分享这个文件给团队成员（**注意安全**，不要泄露密码）

## 最佳实践

### 发布前检查清单

- ✅ 代码已测试完成
- ✅ Xcode 签名配置正确
- ✅ 更新日志已准备（`changelog.txt`）
- ✅ 截图和元数据已更新（如有需要）
- ✅ 网络连接稳定
- ✅ 首次发布已在 App Store Connect 创建 App

### 版本号管理

**系统采用简化的版本号管理策略：**

- ✅ **版本号（Version）由 Xcode 管理** - 在 Xcode 项目中修改 `CFBundleShortVersionString`
- ✅ **构建号（Build）自动递增** - 系统会在每次发布时自动递增 `CFBundleVersion`
- ✅ **单一数据源** - 避免版本号不一致的问题

**操作流程：**

1. 需要更新版本号时，在 Xcode 中修改（例如从 1.0.0 改为 1.1.0）
2. 发布时系统会读取 Xcode 中的版本号并自动递增构建号
3. 无需在发布系统中管理版本号

### 测试流程建议

1. 使用 **TestFlight** 进行内部测试
2. 确认无问题后再发布到 **App Store**
3. 提交审核前再次检查元数据和截图

## 常用命令速查

```bash
# 启动服务（分开启动）
cd fastlane-agent && npm run dev    # Agent
cd fastlane-ui && npm run dev        # UI

# 手动发布
cd <项目目录>
fastlane beta                        # TestFlight
fastlane release                     # App Store
fastlane version_info                # 查看版本
fastlane clean                       # 清理构建
```

## 下一步

- 📖 阅读 [README](./README.md) 了解技术架构
- 🔧 查看 [Agent API 文档](./fastlane-agent/README.md)
- 🎨 查看 [UI 开发文档](./fastlane-ui/README.md)
- 📚 参考 [Fastlane 官方文档](https://docs.fastlane.tools/)

---

祝你使用愉快！🚀
