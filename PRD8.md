# PRD 8: 外部提交App审核监控

**版本**: v8.0
**创建时间**: 2026-01-17
**更新时间**: 2026-01-17
**状态**: 需求讨论中

---

## 需求背景

### 问题

现在的系统中，发布看板中的"最近发布"模块以及"发布历史"页面，监控的都是通过 fastlane UI "发布操作"提交的 app 审核。

在实际业务场景中，操作人员会有**不通过这套系统提交的 app 审核**，这些 app 的审核进度现在无法在 fastlane UI 中被监控起来。

### 目标

将明道云中"正式包审核中"的 app 纳入 fastlane UI 的审核监控系统，实现：
- ✅ 在发布看板统一显示所有审核中的 app（无论是否通过 fastlane UI 提交）
- ✅ 自动监控所有 app 的审核状态（复用现有的每小时自动检查机制）
- ✅ 统一的审核状态管理和展示

---

## 数据来源

### 明道云数据表

外部提交的 app 数据保存在明道云的两张表中，**通过明道云 V3 REST API 访问**（[API文档](https://www.mingdao.com/worksheetapi/e0d695d1-2a5f-44ef-adcf-96fc9c0d5ca1)）。

#### 1. App生产发布表 ✅ 已验证
- **表ID**: `65612ddfc96f80bfabe5df2e`
- **状态字段**: `64b168be624fef0d46c11054`
- **筛选条件**: 状态 = "正式包审核中" (Key: `37f6baa7-3045-49f7-b28a-fd340ced3ba8`)
- **API 认证**:
  ```bash
  HAP-Appkey: 2b3688e350d918d5
  HAP-Sign: YzE5N2M3MjczOTJmYTU2OWU3OGY3ZjFkYTc0ODczYzk4MzU5YTA0ZjkyMzM5ZDMwMGIyOTQ5YjcxZDI1OTg5NA==
  ```
- **环境变量名**:
  ```bash
  HAP_APP_KEY_PRODUCTION_RELEASES=2b3688e350d918d5
  HAP_SIGN_PRODUCTION_RELEASES=YzE5N2M3MjczOTJmYTU2OWU3OGY3ZjFkYTc0ODczYzk4MzU5YTA0ZjkyMzM5ZDMwMGIyOTQ5YjcxZDI1OTg5NA==
  ```
- **当前数据量**: 3条"正式包审核中"记录（总计100条记录）
- **状态**: ✅ API 验证成功，数据可正常读取

#### 2. App更新任务表 ✅ 已验证
- **表ID**: `640ab32a56058b3df8803af2`
- **状态字段**: `6436a3aa56462b8747397762`
- **筛选条件**: 发布状态 = "正式包审核中" (Key: `a82b43e3-1d40-4d3e-b87d-1d3a80c489bf`)
- **API 认证**:
  ```bash
  HAP-Appkey: 9990f999f7a61d8d
  HAP-Sign: YWI0NGM5ZTNjYTg0MGZiNzI4MmQxMjMyOWE0MTg0YjgwY2Y2NDUxYzU0MzM4NmYzZGY2ZTdiNzI2NDI4MWYzNw==
  ```
- **环境变量名**:
  ```bash
  HAP_APP_KEY=9990f999f7a61d8d
  HAP_SIGN=YWI0NGM5ZTNjYTg0MGZiNzI4MmQxMjMyOWE0MTg0YjgwY2Y2NDUxYzU0MzM4NmYzZGY2ZTdiNzI2NDI4MWYzNw==
  ```
- **当前数据量**: 3条"正式包审核中"记录
- **状态**: ✅ API 验证成功，数据可正常读取

### API 调用示例

```bash
# 查询"App生产发布表"中"正式包审核中"的记录
curl -X POST 'https://api.mingdao.com/v3/app/worksheets/65612ddfc96f80bfabe5df2e/rows/list' \
  -H 'Content-Type: application/json' \
  -H 'HAP-Appkey: 2b3688e350d918d5' \
  -H 'HAP-Sign: YzE5N2M3MjczOTJmYTU2OWU3OGY3ZjFkYTc0ODczYzk4MzU5YTA0ZjkyMzM5ZDMwMGIyOTQ5YjcxZDI1OTg5NA==' \
  -d '{
    "pageSize": 100,
    "pageIndex": 1,
    "filter": {
      "type": "group",
      "logic": "AND",
      "children": [{
        "type": "condition",
        "field": "64b168be624fef0d46c11054",
        "operator": "eq",
        "value": ["37f6baa7-3045-49f7-b28a-fd340ced3ba8"]
      }]
    },
    "useFieldIdAsKey": true
  }'
```

### 关键字段映射

#### App更新任务表（升级发布）

| 明道云字段 | 字段ID | Supabase `releases` 表字段 | 备注 |
|-----------|--------|---------------------------|------|
| 正式包名称 | `64097218d867a5c9c89b043b` | `app_name` | 直接映射 |
| 版本号 | `641f033f5815faac860d15de` | `version` | 直接映射 |
| App ID | `643a18f30c49f729a4893c46` | `apple_id` | 直接映射 |
| 提交审核时间 | `641ee11b56350b78574cf7c1` | `submitted_at` | 直接映射 |
| 发布人 | `64366cddcb42afb8b5e79583` | `deployed_by` | 需要映射用户ID |
| 账号上的产品 | `6437343d6e173a52dea04494` | - | 关联字段，用于获取 bundle_id 和 API Key |
| - | - | `build_number` | ⚠️ 明道云无此字段，设为默认值 "1" |
| - | - | `bundle_id` | 需通过关联查询"账号上的产品"表获取 |

#### App生产发布表（首次发布）✅ 字段更完整

| 明道云字段 | 字段ID | Supabase `releases` 表字段 | 备注 |
|-----------|--------|---------------------------|------|
| App名称 | `64b168be624fef0d46c11058` | `app_name` | ✅ 直接映射 |
| 版本号 | `64b168be624fef0d46c11068` | `version` | ✅ 直接映射 |
| Bundle ID | `64b168be624fef0d46c1105b` | `bundle_id` | ✅ 直接映射（无需关联查询！）|
| 发布时间 | `64b168be624fef0d46c1106b` | `submitted_at` | ✅ 直接映射 |
| 发布人 | `64b3ead57658fd2098b7e311` | `deployed_by` | 需要映射用户ID |
| 苹果开发者账号 | `64b168be624fef0d46c1105d` | - | 关联字段，用于获取 API Key |
| - | - | `apple_id` | ⚠️ 表中无此字段，可能为 null |
| - | - | `build_number` | ⚠️ 明道云无此字段，设为默认值 "1" |

#### 共同说明

- ✅ "App生产发布表"**直接包含 Bundle ID**，无需关联查询，数据获取更简单
- ⚠️ 两张表都需要通过关联查询"苹果开发者账号"表获取 API Key（用于审核监控）
- ⚠️ `build_number` 在明道云中未维护，统一设为默认值 "1"
- ⚠️ 用户映射需要特殊处理（明道云用户 → Supabase 用户）

---

## 技术方案

### 方案选择：手动同步方案 ✅

将明道云中"正式包审核中"的记录通过**手动触发**的方式同步到 Supabase `releases` 表。

**优点**：
- 前端无需大改，复用现有发布看板界面
- 复用现有审核监控逻辑（每小时自动检查）
- 数据统一管理，查询性能好
- 避免多实例运行时的并发冲突
- 按需同步，用户可控

**缺点**：
- 需要用户手动触发
- 数据有延迟（取决于手动同步频率）

### 实现架构

```
┌─────────────────────────────────────────────────────────────┐
│                     明道云（数据源）                          │
│  ┌──────────────────────┐  ┌──────────────────────┐         │
│  │ App生产发布表         │  │ App更新任务表         │         │
│  │ (首次发布)           │  │ (升级发布)           │         │
│  └──────────────────────┘  └──────────────────────┘         │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ 手动触发同步
                            │ （UI按钮）
                            ▼
┌─────────────────────────────────────────────────────────────┐
│          ExternalReleaseSync（新增服务）                     │
│  - 读取明道云"正式包审核中"记录                              │
│  - 通过关联查询获取 bundle_id 和 API Key                     │
│  - 转换数据格式并映射用户名                                   │
│  - 去重并插入 releases 表                                     │
│  - 返回同步结果（新增/已存在/失败）                           │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                Supabase releases 表                          │
│  - source: 'fastlane' | 'manual'（新增字段）                │
│  - monitor_enabled: true（默认启用监控）                    │
│  - 统一管理所有发布记录                                       │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│            ReviewMonitor（现有审核监控服务）                  │
│  - 每小时自动检查所有 monitor_enabled=true 的记录            │
│  - 包括 fastlane 提交和手动同步的 app                        │
└─────────────────────────────────────────────────────────────┘
```

### 核心逻辑

#### 1. 手动同步流程

```typescript
// 伪代码
async function syncExternalReleases(): Promise<SyncResult> {
  const result = {
    newCount: 0,      // 新增记录数
    existCount: 0,    // 已存在记录数
    failCount: 0,     // 失败记录数
    failedApps: [],   // 失败的app详情
  };
  
  try {
    // 1. 从两张明道云表读取"正式包审核中"的记录
    const updateTasks = await getHAPRecords('640ab32a56058b3df8803af2', '正式包审核中');
    const productionReleases = await getHAPRecords('65612ddfc96f80bfabe5df2e', '正式包审核中');
    
    const allRecords = [...updateTasks, ...productionReleases];
    
    for (const record of allRecords) {
      try {
        // 2. 获取 bundle_id（App生产发布表直接读取，App更新任务表需关联查询）
        const bundleId = await getBundleId(record);
        
        // 3. 检查是否已存在（去重：bundle_id + version）
        const exists = await checkIfExists(bundleId, record.version);
        
        if (exists) {
          result.existCount++;
          continue;
        }
        
        // 4. 通过关联查询获取 Apple API Key
        const apiKey = await getAppleAPIKey(record);
        
        // 5. 提取发布人名称
        const deployedBy = record.发布人?.fullname || record.发布人?.name || '未知用户';
        
        // 6. 插入 releases 表
        await insertRelease({
          bundle_id: bundleId,
          app_name: record.appName,
          version: record.version,
          build_number: '1', // 默认值
          submitted_at: record.submittedAt,
          deployed_by: deployedBy, // 存储用户名
          source: 'manual', // 标记为外部提交
          review_status: 'WAITING_FOR_REVIEW', // 初始状态
          monitor_enabled: true, // 默认启用监控
          // API Key 信息
          api_key_id: apiKey.keyId,
          api_key_issuer_id: apiKey.issuerId,
          api_key_content: apiKey.content,
        });
        
        result.newCount++;
      } catch (error) {
        // 记录失败但继续处理其他记录
        result.failCount++;
        result.failedApps.push({
          appName: record.appName,
          version: record.version,
          error: error.message,
        });
      }
    }
  } catch (error) {
    throw new Error(`同步失败: ${error.message}`);
  }
  
  return result;
}
```

#### 2. 去重规则

**关键决策**：使用 `bundle_id + version` 判断记录是否已存在

**原因**：
- ✅ 明道云表中维护了版本号（version）
- ❌ 明道云表中**没有**维护构建号（build_number）

**实现**：
```sql
SELECT COUNT(*) FROM releases 
WHERE bundle_id = ? AND version = ?
```

---

## 数据库变更

### 新增字段：`source`

```sql
-- 为 releases 表添加来源标识
ALTER TABLE releases 
ADD COLUMN source TEXT DEFAULT 'fastlane' 
CHECK (source IN ('fastlane', 'manual'));

-- 添加注释
COMMENT ON COLUMN releases.source IS '发布来源：fastlane=通过系统发布，manual=手动提交';

-- 创建索引（优化按来源筛选）
CREATE INDEX idx_releases_source ON releases(source);
```

---

## 手动同步详细设计

### 触发入口

**位置：**
- **发布看板页面**（`/dashboard`）：在"最近发布"模块顶部
- **发布历史页面**（`/releases`）：在页面顶部工具栏

**按钮样式：**
```tsx
<Button 
  variant="outline" 
  onClick={handleSync}
  disabled={isSyncing}
>
  {isSyncing ? '同步中...' : '同步外部审核'}
</Button>
```

### 同步执行流程

1. **用户点击按钮** → 发起异步请求 `POST /api/releases/sync-external`
2. **立即返回** → 显示 Loading 状态："同步中..."
3. **后台执行** → 调用明道云API，查询并同步数据（约5-15秒）
4. **完成通知** → Toast显示同步结果

### 同步结果反馈

**成功场景：**
```typescript
{
  success: true,
  data: {
    newCount: 3,      // 新增3条
    existCount: 2,    // 2条已存在
    failCount: 0,     // 无失败
    failedApps: []
  }
}
```

**UI显示：**
```
✅ 同步完成！
新增：3条 | 已存在：2条
```

**部分失败场景：**
```typescript
{
  success: true,
  data: {
    newCount: 2,
    existCount: 2,
    failCount: 1,
    failedApps: [
      { appName: '某App', version: '1.0', error: '无法获取API Key' }
    ]
  }
}
```

**UI显示：**
```
⚠️ 同步完成（部分失败）
✅ 新增：2条 | ℹ️ 已存在：2条 | ❌ 失败：1条
点击查看详情 → 弹窗显示失败列表
```

**完全失败场景：**
```typescript
{
  success: false,
  error: '明道云连接失败'
}
```

**UI显示：**
```
❌ 同步失败：明道云连接失败
```

### API设计

**端点：** `POST /api/releases/sync-external`

**请求：** 无参数

**响应：**
```typescript
interface SyncResponse {
  success: boolean;
  data?: {
    newCount: number;
    existCount: number;
    failCount: number;
    failedApps: Array<{
      appName: string;
      version: string;
      error: string;
    }>;
  };
  error?: string;
}
```

### 同步范围

- 每次同步查询**所有**"正式包审核中"的记录
- 去重逻辑：`bundle_id + version` 已存在则跳过
- 失败处理：跳过失败记录，继续同步其他

### 同步后状态

同步成功后，记录会被：
1. 插入到 `releases` 表，`source = 'manual'`
2. `monitor_enabled = true`（自动加入审核监控）
3. `review_status = 'WAITING_FOR_REVIEW'`（初始状态）
4. 等待 `ReviewMonitor` 在下次定时任务中检查实际状态

---

## 待确认问题（已全部解决）

### 🔴 高优先级（已全部解决）

#### 1. V3 API 访问 ✅ 已完成
- **原问题**：MCP 签名验证失败，无法访问"App生产发布表"
- **解决方案**：改用明道云 V3 REST API 直接访问
- **验证结果**：
  - ✅ 成功读取"App生产发布表"（3条"正式包审核中"记录）
  - ✅ 成功读取"App更新任务表"（3条"正式包审核中"记录）
  - ✅ 所有字段数据完整且格式正确
  - ✅ 环境变量配置已明确：
    ```bash
    # App生产发布表
    HAP_APP_KEY_PRODUCTION_RELEASES=2b3688e350d918d5
    HAP_SIGN_PRODUCTION_RELEASES=YzE5N2M3MjczOTJmYTU2OWU3OGY3ZjFkYTc0ODczYzk4MzU5YTA0ZjkyMzM5ZDMwMGIyOTQ5YjcxZDI1OTg5NA==
    
    # App更新任务表
    HAP_APP_KEY=9990f999f7a61d8d
    HAP_SIGN=YWI0NGM5ZTNjYTg0MGZiNzI4MmQxMjMyOWE0MTg0YjgwY2Y2NDUxYzU0MzM4NmYzZGY2ZTdiNzI2NDI4MWYzNw==
    ```

#### 2. Bundle ID 获取方式 ✅ 已完成
- **发现**："App生产发布表"**直接包含 Bundle ID 字段**！
- **验证结果**：
  - ✅ "App生产发布表" Bundle ID 字段：`64b168be624fef0d46c1105b`（直接可用！）
  - ✅ "App更新任务"表需通过关联字段 `6437343d6e173a52dea04494` 查询"账号上的产品"表
  - ✅ "账号上的产品"表 Bundle ID 字段：`64b3a82fa75368cd24c99d8d`
  - ✅ 实际数据验证：
    - 影记报告：`com.b7q1e4h1n.lllIII`
    - 码易生：`com.b7q1e4h1n.IIlIlI`
    - 蚁群交通协同：`com.b7q1e4h1n.IIlIll`

#### 3. Apple API Key 获取 ✅ 路径已明确
- **两张表的 API Key 查询路径**：
  ```
  App更新任务表：
  └─ 账号上的产品（字段 6437343d6e173a52dea04494）
     └─ 苹果开发者账号（字段 64341940fa601169896433f6）
        └─ API Key 字段（在 hap-client.ts 中已定义）
  
  App生产发布表：
  └─ 苹果开发者账号（字段 64b168be624fef0d46c1105d）
     └─ API Key 字段（在 hap-client.ts 中已定义）
  ```
- **可复用的代码**：`hap-client.ts` 中的 `getAppleAccountByBundleId` 方法
- **待实现**：适配新服务使用此方法

### 🟡 中优先级（已全部解决）

#### 4. 审核状态初始化 ✅
- **方案**：同步时设为 `WAITING_FOR_REVIEW`，等定时任务自动检查
- **原因**：避免同步时API调用过多，影响性能；审核监控本来就是每小时跑一次，延迟可接受

#### 5. 同步时机和频率 ✅
- **方案**：手动同步（UI按钮触发）
- **原因**：
  - 避免多实例运行时的并发冲突
  - 外部提交的审核不频繁，无需定时同步
  - 用户可以按需触发，更灵活

#### 6. 数据清理策略 ✅
- **方案**：不处理（一旦同步就永久保留）
- **原因**：
  - 这些记录本来就是已提交审核的，应该保留
  - 状态更新靠 ReviewMonitor 自动检测（会检测到 APPROVED 等最终状态）
  - 不需要反向同步明道云状态到 Supabase

### 🟢 低优先级（已全部解决）

#### 7. 用户映射 ✅
- **方案**：存储明道云用户名（fullname/name）
- **实现**：
  ```typescript
  deployed_by: record.发布人?.fullname || record.发布人?.name || '未知用户'
  ```
- **原因**：
  - 外部提交的记录主要用于审核监控，不需要严格的用户ID关联
  - 前端显示时可以直接显示名字，用户体验更好
  - 可以通过是否为UUID格式区分来源（UUID=fastlane UI发布，非UUID=外部提交）

#### 8. 前端展示优化 ✅

**必须实现：**
- ✅ **同步按钮**：在发布看板和发布历史页面添加"同步外部审核"按钮
- ✅ **同步反馈**：异步执行 + Toast通知，显示同步结果
- ✅ **失败详情**：部分失败时可查看详细失败原因

**可选实现（后续优化）：**
- [ ] 来源标识：在列表中显示"外部提交"标签
- [ ] 来源筛选：按 source 字段筛选记录

---

## 建议方案

基于调研结果和典型使用场景，建议：

| 问题 | 确定方案 | 理由 | 状态 |
|-----|---------|------|------|
| API访问方式 | 使用明道云 V3 REST API | 稳定、灵活、文档完善 | ✅ 已确定 |
| Bundle ID 获取 | "App生产发布表"直接读取；"App更新任务表"关联查询 | 根据表结构差异采用不同策略 | ✅ 已确定 |
| API Key 获取 | 通过关联查询"苹果开发者账号"表 | 保证监控可用，复用现有代码 | ✅ 已确定 |
| 审核状态初始化 | 设为 WAITING_FOR_REVIEW | 避免同步时API调用过多，影响性能 | ✅ 已确定 |
| 同步方式 | 手动触发（UI按钮） | 避免多实例冲突，按需同步更灵活 | ✅ 已确定 |
| 同步执行方式 | 异步执行 + Toast通知 | 避免阻塞UI，提升用户体验 | ✅ 已确定 |
| 数据清理 | 不处理（永久保留） | 保留历史记录，状态由ReviewMonitor更新 | ✅ 已确定 |
| 用户映射 | 存储明道云用户名（fullname/name） | 简单直观，易于展示 | ✅ 已确定 |
| 失败处理 | 跳过失败记录，继续同步其他 | 部分成功优于全部失败 | ✅ 已确定 |
| 前端优化 | 必须：同步按钮+结果反馈；可选：来源标识 | 满足核心功能，后续可优化 | ✅ 已确定 |

### 关键技术决策说明

#### ✅ 已确定的技术方案

1. **使用 V3 REST API**
   - 优点：稳定、灵活、支持复杂查询、有完整文档
   - 实现：直接使用 `fetch` 或 `axios` 调用，无需额外依赖
   - 参考：[明道云 API 文档](https://www.mingdao.com/worksheetapi/e0d695d1-2a5f-44ef-adcf-96fc9c0d5ca1)

2. **Bundle ID 获取策略**
   - "App生产发布表"：字段 `64b168be624fef0d46c1105b` 直接读取
   - "App更新任务表"：通过关联字段 `6437343d6e173a52dea04494` 查询"账号上的产品"表
   - 优化：优先使用直接字段，减少关联查询

3. **代码复用策略**
   - 复用 `hap-client.ts` 的 V3 API 调用方法
   - 复用 `app-removal-investigation-service.ts` 的字段ID定义
   - 新建 `ExternalReleaseMonitor` 服务，专注于审核监控场景

---

## 现有代码可复用性分析

### ✅ 已有的相似功能

系统中已存在**下架排查服务**（`app-removal-investigation-service.ts`），该服务实现了类似的逻辑：
- 从明道云两张表（"App生产发布表" + "App更新任务表"）读取数据
- 通过关联查询获取 Bundle ID 和账号信息
- 同步到 Supabase 数据库
- 支持定时和手动触发

### 🔄 可复用的代码模块

| 模块 | 文件 | 复用价值 |
|-----|------|---------|
| **明道云数据读取** | `hap-client.ts` | ✅ 直接复用 `v3GetRows` 方法 |
| **关联查询逻辑** | `hap-client.ts` | ✅ 复用 `getAppleAccountByBundleId` 方法 |
| **字段ID定义** | `app-removal-investigation-service.ts` | ✅ 两张表的所有字段ID已定义 |
| **环境变量配置** | `server.ts` | ✅ `HAP_APP_KEY_PRODUCTION_RELEASES` 等已支持 |
| **数据转换逻辑** | `app-removal-investigation-service.ts` | ⚠️ 需要适配为 `releases` 表格式 |

### 📝 新增代码估算

基于现有代码，预计新增代码量：
- **新服务类**：`ExternalReleaseMonitor` - ~300行
- **API端点**：`/releases/sync-external` - ~50行
- **类型定义**：新增接口 - ~20行
- **数据库迁移**：添加 `source` 字段 - ~10行

**总计**：约 **380行** 新代码（相比从零开发节省约 70% 工作量）

---

## 实施步骤

### 阶段1：数据调研 ✅ 已完成
- [x] 读取明道云数据样例
  - ✅ 成功读取"App更新任务"表（3条"正式包审核中"记录）
  - ✅ 成功读取"App生产发布表"（3条"正式包审核中"记录）
  - ✅ 通过 V3 REST API 验证数据完整性
- [x] 确认 Bundle ID 获取方式
  - ✅ "App生产发布表"直接包含 Bundle ID（无需关联查询！）
  - ✅ "App更新任务"表需通过"账号上的产品"表关联查询
  - ✅ 实际数据已验证（3个 Bundle ID）
- [x] 确认 API Key 获取方式
  - ✅ 关联查询路径已明确（两张表路径不同）
  - ✅ 可复用 `hap-client.ts` 中的现有方法
- [x] 配置"App生产发布表" API 认证
  - ✅ AppKey: `2b3688e350d918d5`
  - ✅ Sign: `YzE5N2M3MjczOTJmYTU2OWU3OGY3ZjFkYTc0ODczYzk4MzU5YTA0ZjkyMzM5ZDMwMGIyOTQ5YjcxZDI1OTg5NA==`
  - ✅ 环境变量名已确定
- [x] 验证字段映射和数据格式
  - ✅ 所有必需字段已确认
  - ✅ 数据格式正确（用户对象、选项字段等）
  - ✅ 状态 Key 值已获取
- [ ] 与产品确认待定问题（中优先级问题）

### 阶段2：后端开发
- [ ] 数据库添加 `source` 字段
- [ ] 实现 `ExternalReleaseMonitor` 服务
- [ ] 实现关联查询逻辑（Bundle ID, API Key）
- [ ] 实现去重和数据转换
- [ ] 实现定时同步任务
- [ ] 添加手动同步 API 端点

### 阶段3：前端优化
- [ ] 发布看板增加来源标识
- [ ] 发布历史增加来源筛选
- [ ] 概览页增加"同步外部审核"按钮
- [ ] 测试数据展示

### 阶段4：测试和上线
- [ ] 单元测试
- [ ] 集成测试
- [ ] 灰度发布
- [ ] 监控和优化

---

## 数据验证结果

### 实际查询数据（2026-01-17）

#### App生产发布表（共3条"正式包审核中"）

| App名称 | 版本 | Bundle ID | 提交时间 | 发布人 |
|--------|------|-----------|----------|--------|
| 影记报告 | 1.0 | com.b7q1e4h1n.lllIII | 2026-01-15 17:02:12 | 白欣语 |
| 码易生 | 1.0 | com.b7q1e4h1n.IIlIlI | 2026-01-15 15:13:15 | 白欣语 |
| 蚁群交通协同 | 1.0 | com.b7q1e4h1n.IIlIll | 2026-01-15 13:50:58 | 白欣语 |

**状态分布**（共100条记录）：
- 正式包上架：83条
- **正式包审核中：3条** ✅
- 已打包上传：4条
- APP被下架：5条
- 正式包审核不通过：3条
- 其他：2条

#### App更新任务表（共3条"正式包审核中"）

| App名称 | 版本 | App ID | 提交时间 | 发布人 |
|--------|------|--------|----------|--------|
| 助手帮-旋核工程师 | 1.2 | 6757686616 | 2026-01-16 12:10:49 | 王欣怡 |
| 猪贷款 | 1.4 | 6738656048 | 2026-01-14 14:27:47 | 赵志鹏 |
| 快借钱 | 2.1 | 6739096328 | 2026-01-14 14:08:24 | 赵志鹏 |

### 数据质量评估

| 评估项 | App生产发布表 | App更新任务表 | 结论 |
|--------|--------------|--------------|------|
| 必需字段完整性 | ✅ 100% | ✅ 100% | 所有记录包含必需字段 |
| Bundle ID | ✅ 直接可用 | ⚠️ 需关联查询 | 生产发布表数据更便捷 |
| App ID | ⚠️ 未包含 | ✅ 包含 | 更新任务表数据更完整 |
| 用户信息 | ✅ 完整对象 | ✅ 完整对象 | 两表都包含用户全名和头像 |
| 时间格式 | ✅ 标准格式 | ✅ 标准格式 | 统一的日期时间格式 |

### API 调用性能

- **单次查询耗时**：~0.5秒（100条记录）
- **筛选查询耗时**：~0.2秒（3条记录）
- **并发查询**：支持（可同时查询两张表）
- **推荐策略**：批量查询（pageSize=100），减少请求次数

---
