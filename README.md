# zjutjh 个人贡献看板（今年）

- 目标：让任何 GitHub 用户（不要求是组织成员）查看自己在 `zjutjh/*` 仓库的今年贡献（按 `Asia/Shanghai`），包含其可访问的公开与私有仓库。
- 指标（MVP）：PR 数、Review 过的 PR 数（按 PR 去重）；Commit（全分支、去重 SHA、排除 merge）通过异步扫描任务生成。
- AI 点评：接入豆包（火山方舟 Ark），**只发送统计**，不发送仓库名/PR 文本/链接/代码。

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

2) 启动

```bash
docker compose -f docker-compose.deploy.yml up -d --build
```

3) 打开

- `http://localhost:3000`

> 说明：`docker-compose.deploy.yml` 会自动执行 Prisma migrations（`prisma migrate deploy`），并启动 worker 用于 Commit 扫描任务。

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

## 目录结构（核心）

- `docs/PROJECT_SPEC.md`：需求与口径
- `src/auth.ts`：NextAuth（GitHub OAuth）
- `src/lib/snapshot.ts`：今年 PR/Review 统计（GraphQL contributionsCollection）
- `src/lib/ai/commentary.ts`：豆包点评（只基于统计）
- `src/worker/index.ts`：BullMQ worker（Commit 全分支扫描）
- `prisma/schema.prisma`：Job/Snapshot 数据模型
- `docker-compose.yml`：Postgres + Redis
- `docker-compose.deploy.yml`：一键部署（Web + Worker + Postgres + Redis）
