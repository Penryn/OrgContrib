# zjutjh 组织贡献看板（今年）- 项目需求与实现规格

## 1. 背景与目标

做一个让任何 GitHub 用户在登录后，可以**按自己的仓库权限**查看自己在 GitHub 组织 `zjutjh` 下今年贡献情况的 Web 应用。

核心思路：先用一个“全权限账号 token”把“今年”的 PR / Review / Commit 记录同步到数据库（缓存），再让用户按自身仓库权限从缓存快速汇总贡献并生成年度报告。

本项目只覆盖“今年”（按 `Asia/Shanghai` 时区切年）。

## 2. 范围（MVP）

### 2.1 支持的贡献类型

- **Commit 贡献（所有分支）**
  - 时间口径：按 `committedDate` 统计今年范围内的提交
  - 分支口径：统计仓库 `refs/heads/*` 下所有分支
  - 去重：同一提交 `SHA(oid)` 在多个分支出现只计一次
  - 排除：**不计入 merge commit**（`parents > 1`）
- **PR 贡献**
  - 口径：今年内创建的 PR 数量（唯一 PR）
- **Code Review 贡献**
  - 口径：今年内 review 他人 PR 的数量（按 PR 去重，不按 review 次数）

### 2.2 不在 MVP 范围

- Issue 贡献与 Issue/PR 评论统计
- 基于代码内容的 AI 代码质量点评（本期只发送统计）

## 3. 权限与隐私

### 3.1 私有仓库访问边界

- 缓存阶段：使用 `ORG_SYNC_GITHUB_TOKEN` 同步组织仓库全量数据（包含私有仓库）。
- 展示阶段：用户登录后，会用用户自己的 GitHub OAuth Token 拉取“可访问仓库列表”，只从缓存里筛选这些仓库的记录进行汇总与展示。

### 3.2 AI 数据边界（豆包）

- AI 点评只发送**统计/聚合指标**（纯数字 + 少量枚举），**不发送**仓库名、PR 标题/描述、链接、代码、diff、文件名等任何可能暴露私有信息的内容。

## 4. 交互与页面（MVP）

- 登录：GitHub OAuth 登录
- Dashboard（默认 org=`zjutjh`，默认今年）
  - 组织年度缓存：worker 启动时同步一次今年 PR + Review + Commit 记录（异步任务 + 进度）
  - 我的贡献：按“我可访问的仓库”筛选缓存并汇总（只显示有贡献的仓库）
  - PR + Review + Commit：同时加载展示（未加载完成不展示仓库明细）
  - AI 年度报告：展示中文总结 + 3-5 条建议（只基于统计）

## 5. 数据来源与计算口径

### 5.1 仓库清单（含私有）

缓存同步（服务账号）拉取仓库清单：

- GitHub REST：`GET /user/repos?visibility=all&affiliation=collaborator,organization_member,owner&per_page=100&page=n`
- 过滤：`repo.owner.login === "zjutjh"`

### 5.2 PR / Review（推荐 GraphQL）

- GraphQL：按仓库遍历 `repository.pullRequests(orderBy: CREATED_AT)`
  - 过滤 `createdAt` 在今年范围内
  - 同时读取 `reviews(first: 100)` 并对 `(pullRequestId, reviewerLogin)` 去重
  - 缓存到数据库，后续按人/仓库快速聚合

### 5.3 Commit（所有分支 + 去 merge + 去重）

对每个可访问仓库：

1. 列出分支 `refs/heads/*`（GraphQL `repository.refs(refPrefix: "refs/heads/")`）
2. 用分支 tip `committedDate` 过滤：tip < yearStart（UTC）直接跳过该分支
3. 对剩余分支：
   - `ref(name).target... on Commit { history(since, until) { nodes { oid committedDate parents { totalCount } author { user { login } } } } }`
4. 规则：
   - `parents.totalCount > 1` 视为 merge commit，丢弃
   - 其余按 `oid` 做 Set 去重后计数/落库（同一 SHA 在多个分支只记一次）
   - 记录 `oid/committedDate/author.user.login` 以及变更统计（additions/deletions/changedFiles）

## 6. 技术栈（定稿）

- Web：Next.js（App Router）+ React + TypeScript
- UI：Tailwind CSS + shadcn/ui（可选）+ ECharts
- 认证：Auth.js/NextAuth（GitHub OAuth）
- GitHub API：Octokit（REST + GraphQL）+ throttling/retry
- 异步任务：BullMQ + Redis
- 数据库：PostgreSQL + Prisma
- AI：豆包（火山方舟 Ark）OpenAI 兼容接口
- 部署：Docker Compose（web + worker + postgres + redis）

## 7. 关键后端接口（建议）

- `GET /api/org-cache/status`：查看组织年度缓存状态/进度
- `GET /api/org-cache/me`：按“我可访问的仓库”汇总我的 PR/Review/Commit
- `POST /api/org-cache/sync`：手动触发一次年度缓存同步（可选）
- `POST /api/ai/annual-report`：基于统计生成年度报告（只基于统计）

## 8. AI 点评输出规范（只发送统计）

输入：`InsightMetrics`（纯统计指标）

输出：结构化 JSON（便于渲染与缓存）

```json
{
  "summary": "…",
  "highlights": ["…"],
  "risks": ["…"],
  "actions": ["…"],
  "confidence": 0.0
}
```

校验：服务端用 schema 校验；不合法则重试一次；仍失败则降级模板文案。

## 9. 配置（环境变量）

### GitHub OAuth

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`

### 数据库/队列

- `DATABASE_URL`（Postgres）
- `REDIS_URL`
- `ORG_SYNC_GITHUB_TOKEN`（服务账号 token，用于 worker 启动时同步缓存）
- `ORG_LOGIN`（可选，默认 `zjutjh`）
- `ORG_CACHE_YEAR`（可选，默认按 Asia/Shanghai 取当前年）

### 豆包（火山方舟 Ark）

- `ARK_API_KEY`
- `ARK_BASE_URL`（默认：`https://ark.cn-beijing.volces.com/api/v3`）
- `ARK_ENDPOINT_ID`（`ep-...`，作为 model 传入）
- `AI_TIMEOUT_MS`（可选）
- `AI_MAX_RETRIES`（可选，默认 2）
