# zjutjh 组织贡献看板（今年）

- 目标：先把组织 `zjutjh/*` 今年的 PR / Review / Commit 记录缓存到数据库，再按“用户自身仓库权限”从缓存快速汇总个人贡献，并生成年度报告。
- 同步任务：后台 worker 启动时会用 `ORG_SYNC_GITHUB_TOKEN`（可访问组织全部仓库的账号）同步一次全量缓存。
- 统计口径：Commit 统计 `refs/heads/*` 下所有分支，按 `SHA(oid)` 去重，并排除 merge commits（`parents > 1`）。
- AI 年度报告：接入豆包（火山方舟 Ark），默认**只发送统计**，不发送仓库名/PR 标题/commit message/链接/代码。

需求与口径：`docs/PROJECT_SPEC.md`。

## Docker 一键部署（Web + Worker + Postgres + Redis）

1) 准备环境变量

```bash
cp .env.example .env
```

至少需要配置：
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `NEXTAUTH_SECRET`
- `ORG_SYNC_GITHUB_TOKEN`

2) 启动

```bash
docker compose -f docker-compose.deploy.yml up -d --build
```

3) 打开

- `http://localhost:3000`

> 说明：`docker-compose.deploy.yml` 会自动执行 Prisma migrations（`prisma migrate deploy`），并启动 worker 用于“组织年度缓存”同步任务。

## 本地开发

### 1) 环境变量

```bash
cp .env.example .env
```

- Prisma CLI（`migrate/generate`）默认读取 `.env`。
- Next.js 也会读取 `.env`；如需本机覆盖，可再创建 `.env.local`（优先级更高）。

至少需要配置：
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `NEXTAUTH_SECRET`
- `DATABASE_URL`
- `REDIS_URL`

可选（AI）：
- `ARK_API_KEY`
- `ARK_ENDPOINT_ID`（ep-...）

#### 创建 GitHub OAuth App（Create an OAuth App）

1. 打开 `https://github.com/settings/developers` → `OAuth Apps` → `New OAuth App`
2. 填写信息（本地开发示例）：
   - `Application name`: 任意（例如 `zjutjh-contrib-dashboard`）
   - `Homepage URL`: `http://localhost:3000`
   - `Authorization callback URL`: `http://localhost:3000/api/auth/callback/github`
3. 点击 `Register application` 后，在应用详情页：
   - 复制 `Client ID` → 写入 `.env` 的 `GITHUB_CLIENT_ID`
   - 点击 `Generate a new client secret` → 复制 `Client Secret` → 写入 `.env` 的 `GITHUB_CLIENT_SECRET`
4. 如需部署到线上：把 `Homepage URL` / `Authorization callback URL` 改成你的域名，并同步更新 `.env` 的 `NEXTAUTH_URL`。

### 2) 启动依赖（Postgres + Redis）

```bash
docker compose up -d
```

### 3) 初始化数据库（Prisma）

```bash
npm run db:migrate
```

### 4) 启动 worker（队列消费，用于 Commit 全分支扫描）

```bash
npm run worker
```

### 5) 启动 Web

```bash
npm run dev
```

打开 `http://localhost:3000`，用 GitHub 登录后进入 `/dashboard`。
worker 启动后会自动触发一次年度缓存同步；如需手动触发可调用 `POST /api/org-cache/sync`。

## 目录结构（核心）

- `docs/PROJECT_SPEC.md`：需求与口径
- `src/auth.ts`：NextAuth（GitHub OAuth）
- `src/app/dashboard/OrgCacheDashboard.tsx`：Dashboard（同步状态 + 个人贡献 + 年度报告）
- `src/app/api/org-cache/*`：组织年度缓存相关 API
- `src/app/api/ai/annual-report`：年度报告（只基于统计）
- `src/worker/index.ts`：BullMQ worker（org-year-sync / commit-scan）
- `prisma/schema.prisma`：数据模型（OrgYearCache / PullRequestRecord / PullRequestReviewRecord / CommitRecord / AiAnnualReportCache）
- `docker-compose.yml`：Postgres + Redis
- `docker-compose.deploy.yml`：一键部署（Web + Worker + Postgres + Redis）
