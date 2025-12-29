# zjutjh 个人贡献看板（今年）- 项目需求与实现规格

## 1. 背景与目标

做一个**每个人都可以查看自己**在 GitHub 组织 `zjutjh` 下仓库的代码贡献情况的 Web 应用，即使该用户**不是组织成员**也可以使用（前提：对私有仓库必须由用户本人授权且拥有访问权限）。

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
  - 口径：今年内“review 过的 PR 数量”（按 `pullRequest.id` 去重，不按 review 次数）

### 2.2 不在 MVP 范围

- Issue 贡献与 Issue/PR 评论统计
- 组织内排行榜/对比（仅“只看自己”）
- 基于代码内容的 AI 代码质量点评（本期只发送统计）

## 3. 权限与隐私

### 3.1 私有仓库访问边界

- 私有仓库数据只能来自**用户自己的 GitHub OAuth 授权**，且仅统计该用户 Token **可访问**的 `zjutjh/*` 仓库。

### 3.2 AI 数据边界（豆包）

- AI 点评只发送**统计/聚合指标**（纯数字 + 少量枚举），**不发送**仓库名、PR 标题/描述、链接、代码、diff、文件名等任何可能暴露私有信息的内容。

## 4. 交互与页面（MVP）

- 登录：GitHub OAuth 登录
- Dashboard（默认 org=`zjutjh`，默认今年）
  - 总览卡片：Commits / PRs / Reviewed PRs
  - 趋势图：按周聚合（今年每周）
  - Top Repos：按贡献量排序（支持切换指标）
  - 仓库明细表：每仓库三项指标
  - Commit 扫描进度：异步任务进度条（仓库/分支级进度）
  - AI 点评：展示一段中文总结 + 3-5 条建议（仅基于统计）

## 5. 数据来源与计算口径

### 5.1 仓库清单（含私有）

以“用户视角”拉取最稳：

- GitHub REST：`GET /user/repos?visibility=all&affiliation=collaborator,organization_member,owner&per_page=100&page=n`
- 过滤：`repo.owner.login === "zjutjh"`

### 5.2 PR / Review（推荐 GraphQL）

- GraphQL：`viewer.contributionsCollection(organizationID, from, to)`
  - PR：遍历 `pullRequestContributions` 得到 PR 列表并计数/按仓库聚合/按周聚合
  - Review：遍历 `pullRequestReviewContributions`，对 `pullRequest.id` 去重得到“review 过的 PR 数”

### 5.3 Commit（所有分支 + 去 merge）

对每个可访问仓库：

1. 列出分支 `refs/heads/*`（GraphQL `repository.refs(refPrefix: "refs/heads/")`）
2. 用分支 tip `committedDate` 过滤：tip < yearStart（UTC）直接跳过该分支
3. 对剩余分支：
   - `ref(name).target... on Commit { history(since, until, author:{id/emails}) { nodes { oid committedDate parents { totalCount } } } }`
4. 规则：
   - `parents.totalCount > 1` 视为 merge commit，丢弃
   - 其余按 `oid` 做 Set 去重后计数
   - 以 `committedDate` 做周聚合（按 Asia/Shanghai 分桶）

> 注意：作者匹配优先使用 `emails`（来自 `GET /user/emails` 的已验证邮箱）；避免仅用 userId 导致漏统计。

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

- `POST /api/snapshots/recompute`：触发今年快照计算（返回 jobId）
- `GET /api/jobs/:id`：查询任务进度/状态
- `GET /api/snapshots/current`：获取今年快照（若无则返回需要 recompute）
- `POST /api/ai/commentary`：对当前快照生成 AI 点评（只基于统计）

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

### 豆包（火山方舟 Ark）

- `ARK_API_KEY`
- `ARK_BASE_URL`（默认：`https://ark.cn-beijing.volces.com/api/v3`）
- `ARK_ENDPOINT_ID`（`ep-...`，作为 model 传入）
- `AI_TIMEOUT_MS`（可选）
- `AI_MAX_RETRIES`（可选，默认 2）
