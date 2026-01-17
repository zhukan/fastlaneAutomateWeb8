# 下架排查模块数据清理脚本

## 📝 说明

这个脚本用于清空下架排查模块的所有数据，包括：

1. **operation_records** - 操作记录表
2. **removed_apps** - 已下架app表
3. **ri_developer_accounts** - 开发者账号表
4. **removal_investigation_sync_logs** - 同步日志表

## ⚠️ 使用场景

- 数据同步出错，需要重新同步
- 测试环境数据清理
- 修复错误数据后重新开始

## 🚀 使用方法

### 方法1：使用 npm script（推荐）

```bash
cd /Users/zhukan/Documents/code/fastlaneAutomateWeb6/fastlane-agent
npm run clean:removal-data
```

### 方法2：直接运行

```bash
cd /Users/zhukan/Documents/code/fastlaneAutomateWeb6/fastlane-agent
npx ts-node scripts/clean-removal-investigation-data.ts
```

## ✅ 执行结果示例

```
🧹 开始清理下架排查模块数据...

📝 清理操作记录表 (operation_records)...
✅ 已清理操作记录: 1234 条

📱 清理已下架app表 (removed_apps)...
✅ 已清理已下架app: 567 条

👤 清理开发者账号表 (ri_developer_accounts)...
✅ 已清理开发者账号: 89 条

📊 清理同步日志表 (removal_investigation_sync_logs)...
✅ 已清理同步日志: 12 条

✨ 数据清理完成！

💡 提示：现在可以重新运行全量同步或增量同步
🎉 脚本执行成功
```

## 🔄 清理后的操作

清理完成后，你可以：

1. **重启后端服务器**
2. **打开前端页面** `http://localhost:3001/removal-investigation`
3. **点击"🔄 全量同步"按钮**，重新同步所有数据
4. 或者**点击"⚡ 增量同步"按钮**，只同步最近24小时的数据

## ⚙️ 环境变量要求

脚本需要以下环境变量（从 `.env` 文件加载）：

- `SUPABASE_URL` - Supabase项目URL
- `SUPABASE_SERVICE_ROLE_KEY` 或 `SUPABASE_KEY` - Supabase密钥

## 🔒 安全提示

- ⚠️ **此操作不可恢复**，请确认后再执行
- ✅ 只清理下架排查模块的数据，不影响其他模块
- ✅ 数据库表结构不会被删除，只清空数据

