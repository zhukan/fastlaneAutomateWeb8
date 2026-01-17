# 七麦数据自动监控系统 - 项目需求与设计文档

**版本**: v7.0  
**创建时间**: 2026-01-07  
**状态**: 已实现

---

## 📋 项目概述

### 1.1 项目背景

当前系统已实现 iOS 应用下架监控的自动化，但清榜和清词监控仍依赖人工查看七麦数据网站并手动更新明道云字段。

**现有流程**：
```
人工看七麦 → 手动改明道云 → 系统同步到 Supabase → 前端展示
      ↑
  人工环节（需要消除）
```

### 1.2 项目目标

**目标流程**：
```
七麦自动抓取 → 直接更新 Supabase → 前端展示
      ↑
  全自动化
```

- **主要目标**: 自动化监控七麦数据的清榜和清词页面
- **次要目标**: 将监控结果自动同步到现有 Supabase 数据库的 `target_apps` 表
- **期望效果**: 减少人工工作量，提高监控的及时性和准确性

### 1.3 业务价值

- **效率提升**: 将人工查看+手动更新工作完全自动化
- **准确性提升**: 避免人工操作可能出现的遗漏
- **实时性提升**: 每 2 小时自动检查一次
- **零额外开发**: 前端展示功能已存在，直接复用

---

## 🔍 需求分析

### 2.1 核心功能

#### F1: 七麦数据抓取

- 访问七麦清榜监控页面: https://www.qimai.cn/rank/clear
  - 默认展示 **7 天**数据
- 访问七麦清词监控页面: https://www.qimai.cn/rank/clearWord
  - 默认展示 **1 天**数据
- 提取页面中所有 App ID（纯数字格式，如 `6756691631`）

#### F2: 数据匹配与更新

- 将七麦数据中的 App ID 与 `target_apps` 表的 `app_id` 字段进行匹配
- **更新策略**（重要）：
  - ✅ 检测到清榜/清词 且 当前为 `false` → 更新为 `true`
  - ❌ **不会**自动将 `true` 恢复为 `false`
  - 需要人工手动恢复状态
- 更新字段：
  - `is_clear_rank`: 清榜状态
  - `is_clear_keyword`: 清词状态
  - `updated_at`: 更新时间

#### F3: 执行日志记录

- 新建 `qimai_monitoring_logs` 表记录每次执行
- 记录内容：执行时间、状态、检测数量、错误信息、耗时

#### F4: Cookie 状态管理

- Cookie 存储在 Supabase Edge Function 环境变量
- 检测 Cookie 过期并记录状态
- 前端展示 Cookie 状态告警

### 2.2 与现有系统的集成

#### 2.2.1 数据冲突处理

**问题**：明道云同步 和 七麦自动监控 都会更新 `is_clear_keyword` / `is_clear_rank` 字段

**解决方案**：采用与 `is_offline` 字段相同的策略

```typescript
// target-app-monitor.ts 同步时构建的对象
const app = {
  hap_row_id: hapRowId,
  app_name: record[this.FIELD_IDS.appName],
  app_id: record[this.FIELD_IDS.appId],
  // ... 其他字段
  
  // 🔒 以下字段由系统自动维护，同步时不包含，避免覆盖
  // is_offline        - 由下架检查维护
  // is_clear_keyword  - 由七麦监控维护（新增）
  // is_clear_rank     - 由七麦监控维护（新增）
};
```

**需要修改的代码**：
- `fastlane-agent/src/target-app-monitor.ts`：移除同步对象中的 `is_clear_keyword` 和 `is_clear_rank`
- `fastlane-agent/src/app-comparison-service.ts`：同样移除这两个字段

#### 2.2.2 前端展示

- **无需额外开发**
- 现有前端已支持 `is_clear_keyword` 和 `is_clear_rank` 字段展示
- 七麦监控更新数据库后，前端自动展示

---

## 🏗️ 技术架构设计

### 3.1 整体架构

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  GitHub Actions │────│  Supabase Edge   │────│   七麦数据网站   │
│   (定时触发)     │    │    Function      │    │   (数据源)      │
│   每2小时        │    │  (qimai-monitor) │    │                 │
└─────────────────┘    └────────┬─────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │   Supabase DB   │
                       │  target_apps    │◄── 现有表，更新 2 个字段
                       │  qimai_logs     │◄── 新增表，记录执行日志
                       └─────────────────┘
```

### 3.2 技术选型

| 组件 | 选择 | 理由 |
|------|------|------|
| 后端服务 | Supabase Edge Function | 独立部署，与数据库无缝集成 |
| 定时触发 | GitHub Actions | 免费、可靠、支持手动触发 |
| 数据抓取 | HTTP + 正则解析 | 简单高效，无需 Headless Browser |
| 认证方式 | Cookie | 稳定可靠 |

### 3.3 数据流设计

```
GitHub Actions (每2小时)
        │
        ▼
Edge Function 启动
        │
        ├──► 访问清榜页面 ──► 解析 App ID 列表
        │
        ├──► 访问清词页面 ──► 解析 App ID 列表
        │
        ▼
查询 target_apps 表（所有 app_id）
        │
        ▼
对比匹配：
  - 
  
   App ID ∩ target_apps.app_id
  - 清词列表中的 App ID ∩ target_apps.app_id
        │
        ▼
更新数据库（仅 false → true）：
  - is_clear_rank = true
  - is_clear_keyword = true
        │
        ▼
记录执行日志到 qimai_monitoring_logs
        │
        ▼
返回执行结果
```

---

## 📊 数据库设计

### 4.1 现有表更新（target_apps）

| 字段名 | 类型 | 说明 | 更新逻辑 |
|--------|------|------|----------|
| app_id | TEXT | App Store ID（纯数字） | 匹配依据 |
| is_clear_rank | BOOLEAN | 清榜状态 | 🔄 七麦监控更新（false→true） |
| is_clear_keyword | BOOLEAN | 清词状态 | 🔄 七麦监控更新（false→true） |
| updated_at | TIMESTAMP | 更新时间 | 🔄 自动更新 |

**注意**：这两个字段原来从明道云同步，现在改为由七麦监控系统维护。

### 4.2 新增日志表（qimai_monitoring_logs）

```sql
CREATE TABLE qimai_monitoring_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL, -- 'success' | 'failed' | 'cookie_expired'
  
  -- 统计数据
  clear_rank_detected INTEGER DEFAULT 0,      -- 七麦检测到的清榜数
  clear_keyword_detected INTEGER DEFAULT 0,   -- 七麦检测到的清词数
  clear_rank_matched INTEGER DEFAULT 0,       -- 匹配到的清榜数
  clear_keyword_matched INTEGER DEFAULT 0,    -- 匹配到的清词数
  clear_rank_updated INTEGER DEFAULT 0,       -- 实际更新的清榜数（false→true）
  clear_keyword_updated INTEGER DEFAULT 0,    -- 实际更新的清词数（false→true）
  total_target_apps INTEGER DEFAULT 0,        -- target_apps 总数
  
  -- 执行信息
  execution_duration_ms INTEGER,              -- 执行耗时（毫秒）
  error_message TEXT,                         -- 错误信息
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_qimai_logs_execution_time ON qimai_monitoring_logs(execution_time DESC);
CREATE INDEX idx_qimai_logs_status ON qimai_monitoring_logs(status);
```

### 4.3 Cookie 状态表（可选，也可用日志表的 status 字段）

如果需要更细粒度的 Cookie 管理：

```sql
-- 或者直接用 qimai_monitoring_logs.status = 'cookie_expired' 来判断
-- 前端查询最近一条记录即可
```

---

## 🔧 详细设计方案

### 5.1 七麦数据抓取

#### 5.1.1 七麦 API 接口（推荐方式）

七麦网站使用 API 接口获取数据，比解析 HTML 更可靠：

| 类型 | API 端点 | 数据范围 |
|------|----------|----------|
| 清榜 | `https://api.qimai.cn/rank/clear` | 7 天 |
| 清词 | `https://api.qimai.cn/rank/clearWords` | 1 天 |

**API 请求参数**：
```
analysis=加密参数（从页面获取）
filter=offline
sort_field=beforeClearNum
sort_type=desc
```

**App 详情页 URL 格式**：
```
https://www.qimai.cn/app/rank/appid/{APP_ID}/country/cn
```
例如：`https://www.qimai.cn/app/rank/appid/466312552/country/cn`

#### 5.1.2 认证方式

```javascript
const headers = {
  'Cookie': Deno.env.get('QIMAI_COOKIE'),
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36...',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'Referer': 'https://www.qimai.cn/rank/clear',
};
```

#### 5.1.3 数据获取（两种方式）

**方式 A：API 调用（推荐）**

```javascript
// 清榜 API
const clearRankApi = 'https://api.qimai.cn/rank/clear?analysis=xxx';

// 清词 API  
const clearKeywordApi = 'https://api.qimai.cn/rank/clearWords?analysis=xxx&filter=offline&sort_field=beforeClearNum&sort_type=desc';

// API 返回 JSON，包含 appid 字段
const response = await fetch(clearRankApi, { headers });
const data = await response.json();
// data.appList 或类似结构中包含每个 app 的 appid
```

**方式 B：页面解析（备选）**

```javascript
// 清榜页面（7天数据）
const clearRankUrl = 'https://www.qimai.cn/rank/clear';

// 清词页面（1天数据）
const clearKeywordUrl = 'https://www.qimai.cn/rank/clearWord';
```

#### 5.1.4 App ID 格式

- **纯数字格式**（如 `466312552`, `6756691631`）
- 与 Apple App Store 的 `trackId` 一致
- 长度通常为 9-10 位

```javascript
// App ID 提取（从 HTML 解析时使用）
const patterns = [
  /\/appid\/(\d+)/gi,                  // /appid/466312552
  /data-appid=["']?(\d+)["']?/gi,      // data-appid="466312552"
  /appid[=:](\d+)/gi,                  // appid=466312552
];

function extractAppIds(html: string): string[] {
  const appIds = new Set<string>();
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const appId = match[1];
      // 验证 App ID 格式（9-10位数字）
      if (/^\d{9,10}$/.test(appId)) {
        appIds.add(appId);
      }
    }
  }
  
  return Array.from(appIds);
}
```

### 5.2 数据更新策略

#### 5.2.1 核心逻辑

```javascript
async function updateClearStatus(
  supabase: SupabaseClient,
  clearRankAppIds: string[],
  clearKeywordAppIds: string[]
) {
  const now = new Date().toISOString();
  let rankUpdated = 0;
  let keywordUpdated = 0;

  // 更新清榜状态：只更新 is_clear_rank = false 且在七麦列表中的
  if (clearRankAppIds.length > 0) {
    const { data, error } = await supabase
      .from('target_apps')
      .update({ is_clear_rank: true, updated_at: now })
      .in('app_id', clearRankAppIds)
      .eq('is_clear_rank', false);  // 只更新 false → true
    
    if (!error) {
      rankUpdated = data?.length || 0;
    }
  }

  // 更新清词状态：只更新 is_clear_keyword = false 且在七麦列表中的
  if (clearKeywordAppIds.length > 0) {
    const { data, error } = await supabase
      .from('target_apps')
      .update({ is_clear_keyword: true, updated_at: now })
      .in('app_id', clearKeywordAppIds)
      .eq('is_clear_keyword', false);  // 只更新 false → true
    
    if (!error) {
      keywordUpdated = data?.length || 0;
    }
  }

  return { rankUpdated, keywordUpdated };
}
```

#### 5.2.2 为什么不自动重置为 false

1. **清榜/清词是"事件"**：一旦发生过，就是历史记录
2. **七麦数据有时效**：清榜 7 天、清词 1 天后会从页面消失
3. **业务需求**：需要人工确认后再手动恢复状态

### 5.3 Cookie 过期检测

```javascript
async function checkCookieValid(html: string): Promise<boolean> {
  // 检测是否被重定向到登录页
  if (html.includes('请登录') || html.includes('login')) {
    return false;
  }
  
  // 检测是否返回了有效数据
  if (!html.includes('/app/') && !html.includes('data-appid')) {
    return false;
  }
  
  return true;
}
```

### 5.4 错误处理

```javascript
try {
  // 执行监控逻辑
} catch (error) {
  // 记录失败日志
  await supabase.from('qimai_monitoring_logs').insert({
    status: error.message.includes('Cookie') ? 'cookie_expired' : 'failed',
    error_message: error.message,
    execution_duration_ms: Date.now() - startTime,
  });
  
  throw error;
}
```

---

## 🚀 部署方案

### 6.1 部署架构

```
┌─────────────────────────────────────────────────────────────┐
│                     GitHub Repository                        │
│  .github/workflows/qimai-monitor.yml                        │
└────────────────────────────┬────────────────────────────────┘
                             │ 每2小时触发
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                 Supabase Edge Function                       │
│                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐  │
│  │ 环境变量     │    │ qimai-monitor│    │ Supabase Client │  │
│  │ QIMAI_COOKIE│───▶│ Edge Function│───▶│ 数据库操作      │  │
│  └─────────────┘    └─────────────┘    └─────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 文件结构

```
supabase/
└── functions/
    └── qimai-monitor/
        ├── index.ts          # 主入口
        ├── parser.ts         # HTML 解析
        └── database.ts       # 数据库操作
        
.github/
└── workflows/
    └── qimai-monitor.yml     # 定时触发
```

### 6.3 GitHub Actions 配置

```yaml
name: Qimai Monitor

on:
  schedule:
    - cron: '0 */2 * * *'  # 每2小时执行
  workflow_dispatch:        # 支持手动触发

jobs:
  monitor:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Edge Function
        run: |
          curl -X POST \
            "${{ secrets.SUPABASE_URL }}/functions/v1/qimai-monitor" \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_ANON_KEY }}" \
            -H "Content-Type: application/json"
```

### 6.4 环境变量配置

| 变量名 | 位置 | 说明 |
|--------|------|------|
| `QIMAI_COOKIE` | Supabase Edge Function | 七麦登录 Cookie |
| `SUPABASE_URL` | GitHub Secrets | Supabase 项目 URL |
| `SUPABASE_ANON_KEY` | GitHub Secrets | Supabase 匿名密钥 |

### 6.5 Cookie 获取方法

1. 浏览器登录 https://www.qimai.cn
2. 打开开发者工具 → Network
3. 刷新页面，找到任意请求
4. 复制 Request Headers 中的 Cookie 值
5. 在 Supabase Dashboard → Edge Functions → Secrets 中配置

---

## 📈 前端集成

### 7.1 现有功能复用

**无需额外开发**，以下功能已存在：

- ✅ `target_apps` 表的 `is_clear_rank` / `is_clear_keyword` 展示
- ✅ 关联对比页面的清榜/清词状态展示
- ✅ 目标包监控页面的状态展示

### 7.2 Cookie 状态告警（可选）

可在现有页面增加一个状态提示：

```typescript
// 查询最近一条执行记录
const { data: lastLog } = await supabase
  .from('qimai_monitoring_logs')
  .select('status, execution_time, error_message')
  .order('execution_time', { ascending: false })
  .limit(1)
  .single();

// 如果 Cookie 过期，显示告警
if (lastLog?.status === 'cookie_expired') {
  showWarning('七麦监控 Cookie 已过期，请更新');
}
```

---

## 🔒 风险评估

### 8.1 高风险

| 风险 | 影响 | 应对策略 |
|------|------|----------|
| 七麦 HTML 结构变更 | 解析失败 | 多种正则模式备选，快速修复 |
| 反爬虫机制升级 | 无法获取数据 | 降低频率，模拟真实浏览器 |

### 8.2 中风险

| 风险 | 影响 | 应对策略 |
|------|------|----------|
| Cookie 过期 | 单次执行失败 | 状态检测 + 前端告警 |
| 网络超时 | 执行中断 | 重试机制 |

### 8.3 低风险

| 风险 | 影响 | 应对策略 |
|------|------|----------|
| App ID 格式变化 | 匹配失败 | 日志记录，人工核查 |

---

## 📋 实施计划

### 阶段 1：后端改动（0.5 天）

- [ ] 修改 `target-app-monitor.ts`：移除同步时的 `is_clear_keyword` 和 `is_clear_rank`
- [ ] 修改 `app-comparison-service.ts`：同样移除这两个字段
- [ ] 更新注释说明

### 阶段 2：Edge Function 开发（1-2 天）

- [ ] 创建 `supabase/functions/qimai-monitor/` 目录
- [ ] 实现 HTML 抓取和解析
- [ ] 实现数据库更新逻辑
- [ ] 实现日志记录
- [ ] 本地测试

### 阶段 3：部署和测试（0.5 天）

- [ ] 部署 Edge Function 到 Supabase
- [ ] 配置环境变量（QIMAI_COOKIE）
- [ ] 创建 GitHub Actions workflow
- [ ] 手动触发测试
- [ ] 验证数据库更新

### 阶段 4：监控和优化（持续）

- [ ] 观察执行日志
- [ ] 根据需要调整解析规则
- [ ] 优化执行频率

---

## ✅ 验收标准

### 功能验收

- [ ] 能够自动访问七麦清榜和清词页面
- [ ] 能够正确提取 App ID
- [ ] 能够准确更新 `target_apps` 表的 `is_clear_rank` / `is_clear_keyword` 字段
- [ ] 只更新 `false → true`，不会自动重置
- [ ] 能够记录完整的执行日志
- [ ] Cookie 过期时能够检测并记录

### 性能验收

- [ ] 单次执行时间 < 30 秒
- [ ] 执行成功率 > 95%
- [ ] App ID 匹配准确率 100%

### 集成验收

- [ ] 明道云同步不再覆盖 `is_clear_keyword` / `is_clear_rank`
- [ ] 前端能够正常展示更新后的状态
- [ ] GitHub Actions 定时执行正常

---

**文档版本**: v7.0  
**最后更新**: 2026-01-07  
**状态**: 需求确认中

