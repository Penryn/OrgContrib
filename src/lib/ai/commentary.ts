import crypto from "node:crypto";

import { z } from "zod";

import type { YearToDateSnapshot } from "@/lib/snapshot";

export const aiCommentarySchema = z.object({
  summary: z.string().min(1),
  highlights: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  actions: z.array(z.string()).min(1),
  confidence: z.number().min(0).max(1),
});

export type AiCommentary = z.infer<typeof aiCommentarySchema>;

export type InsightMetrics = {
  org: string;
  timezone: "Asia/Shanghai";
  from: string;
  to: string;
  totals: {
    prs: number;
    reviewedPrs: number;
    commits: number | null;
    commitsStatus: YearToDateSnapshot["totals"]["commitsStatus"];
  };
  weeks: {
    totalWeeks: number;
    activeWeeks: number;
    peakWeeklyActivities: number;
  };
  repos: {
    contributingRepos: number;
    top1Share: number | null;
    top3Share: number | null;
  };
  mix: {
    reviewToPrRatio: number | null;
  };
};

export function buildInsightMetrics(snapshot: YearToDateSnapshot): InsightMetrics {
  const totalWeeks = snapshot.byWeek.length;
  const weeklyActivities = snapshot.byWeek.map((w) => w.prs + w.reviewedPrs);
  const activeWeeks = weeklyActivities.filter((n) => n > 0).length;
  const peakWeeklyActivities = weeklyActivities.reduce((max, n) => (n > max ? n : max), 0);

  const repoActivities = snapshot.byRepo.map((r) => r.prs + r.reviewedPrs);
  const contributingRepos = repoActivities.filter((n) => n > 0).length;
  const totalRepoActivities = repoActivities.reduce((sum, n) => sum + n, 0);

  const sortedRepoActivities = [...repoActivities].sort((a, b) => b - a);
  const top1Share =
    totalRepoActivities > 0 ? Number((sortedRepoActivities[0]! / totalRepoActivities).toFixed(4)) : null;
  const top3Sum = sortedRepoActivities.slice(0, 3).reduce((sum, n) => sum + n, 0);
  const top3Share = totalRepoActivities > 0 ? Number((top3Sum / totalRepoActivities).toFixed(4)) : null;

  const reviewToPrRatio =
    snapshot.totals.prs > 0 ? Number((snapshot.totals.reviewedPrs / snapshot.totals.prs).toFixed(4)) : null;

  return {
    org: snapshot.org,
    timezone: snapshot.timezone,
    from: snapshot.from,
    to: snapshot.to,
    totals: {
      prs: snapshot.totals.prs,
      reviewedPrs: snapshot.totals.reviewedPrs,
      commits: snapshot.totals.commits,
      commitsStatus: snapshot.totals.commitsStatus,
    },
    weeks: {
      totalWeeks,
      activeWeeks,
      peakWeeklyActivities,
    },
    repos: {
      contributingRepos,
      top1Share,
      top3Share,
    },
    mix: {
      reviewToPrRatio,
    },
  };
}

type ChatMessage = { role: "system" | "user"; content: string };

const inMemoryCache = new Map<string, AiCommentary>();

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function parseJsonFromModelContent(content: string): unknown {
  let candidate = content.trim();

  if (candidate.startsWith("```")) {
    const firstNewline = candidate.indexOf("\n");
    if (firstNewline !== -1) {
      candidate = candidate.slice(firstNewline + 1);
    }

    const lastFence = candidate.lastIndexOf("```");
    if (lastFence !== -1) {
      candidate = candidate.slice(0, lastFence);
    }

    candidate = candidate.trim();
  }

  try {
    return JSON.parse(candidate);
  } catch {
    // fallthrough
  }

  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(candidate.slice(start, end + 1));
  }

  throw new Error("Ark API: failed to parse JSON from model output.");
}

async function arkChatJson(args: { messages: ChatMessage[]; timeoutMs: number }): Promise<unknown> {
  const apiKey = process.env.ARK_API_KEY;
  const baseUrl = process.env.ARK_BASE_URL ?? "https://ark.cn-beijing.volces.com/api/v3";
  const model = process.env.ARK_ENDPOINT_ID;

  if (!apiKey) throw new Error("Missing env: ARK_API_KEY");
  if (!model) throw new Error("Missing env: ARK_ENDPOINT_ID (ep-...)");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), args.timeoutMs);

  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.45,
        max_tokens: 900,
        messages: args.messages,
      }),
      signal: controller.signal,
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Ark API HTTP ${res.status}: ${text.slice(0, 500)}`);
    }

    const json = JSON.parse(text) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new Error("Ark API: missing choices[0].message.content");

    return parseJsonFromModelContent(content);
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateAiCommentary(metrics: InsightMetrics): Promise<AiCommentary> {
  const cacheKey = sha256(JSON.stringify(metrics));
  const cached = inMemoryCache.get(cacheKey);
  if (cached) return cached;

  const timeoutMs = Number(process.env.AI_TIMEOUT_MS ?? 15000);
  const maxRetries = Math.max(0, Number(process.env.AI_MAX_RETRIES ?? 2));

  const system: ChatMessage = {
    role: "system",
    content:
      "你是一位友好、务实的工程成长教练。你只能依据用户提供的统计指标给出总结与建议。" +
      "语气要积极、鼓励、自然，尽量避免模板化的措辞；先肯定再给建议，避免居高临下或否定式表达。" +
      "你不得编造不存在的事实，不得评价具体代码质量（因为你没有代码内容）。" +
      "如果 metrics.totals.commitsStatus 不是 'completed'，必须明确说明 commit 统计未完成，不要对 commit 做结论。" +
      "输出必须是严格 JSON，字段为：summary(string), highlights(string[]), risks(string[]), actions(string[]), confidence(number 0~1)。" +
      "内容用中文，行动建议 3~5 条，尽量具体可执行，可包含小目标与可量化的下一步。",
  };

  const user: ChatMessage = {
    role: "user",
    content: JSON.stringify({ metrics }),
  };

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const raw = await arkChatJson({ messages: [system, user], timeoutMs });
      const parsed = aiCommentarySchema.safeParse(raw);
      if (!parsed.success) {
        throw new Error(`AI JSON schema mismatch: ${parsed.error.message}`);
      }

      inMemoryCache.set(cacheKey, parsed.data);
      return parsed.data;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export function fallbackCommentary(metrics: InsightMetrics): AiCommentary {
  const actions: string[] = [];
  const commitsKnown = metrics.totals.commitsStatus === "completed" && metrics.totals.commits !== null;

  if (metrics.totals.prs === 0 && metrics.totals.reviewedPrs === 0) {
    actions.push("先选 1~2 个仓库，从小改动开始建立每周稳定的 PR 节奏（例如每周 1 个）");
  } else {
    actions.push("保持 PR 拆分粒度稳定：控制单个 PR 的变更范围，便于 review 与回滚");
    actions.push("每周固定时间做一次 review：扩大覆盖面，并尽量在 24~48 小时内完成关键 review");
  }

  if (metrics.mix.reviewToPrRatio !== null && metrics.mix.reviewToPrRatio >= 2) {
    actions.push("你在 review 上投入很足：可以尝试把其中 1~2 个高频问题沉淀为小 PR（文档/脚本/修复）");
  } else if (metrics.mix.reviewToPrRatio !== null && metrics.mix.reviewToPrRatio <= 0.5) {
    actions.push("在保持 PR 输出的同时，多做一些轻量 review（优先挑小 PR），提升协作影响力");
  } else {
    actions.push("继续保持 PR 与 review 的平衡：争取每周都有可见的协作产出");
  }

  actions.push("为关键改动补充最小验证：README 步骤/脚本/测试三选一，让产出更可复用");

  return {
    summary:
      `今年你在 ${metrics.org} 的协作上已经有了清晰的痕迹（点评仅基于统计，未包含代码与 PR 文本）。` +
      (commitsKnown ? ` 当前已统计到 commits：${metrics.totals.commits}。` : " Commit 统计尚未完成时，会暂不纳入结论。"),
    highlights: [
      `PR 数：${metrics.totals.prs}`,
      `Review 过的 PR 数：${metrics.totals.reviewedPrs}`,
      `活跃周数：${metrics.weeks.activeWeeks}/${metrics.weeks.totalWeeks}`,
    ],
    risks: metrics.repos.top1Share
      ? [`贡献集中度偏高风险（Top1 占比约 ${Math.round(metrics.repos.top1Share * 100)}%）`]
      : [],
    actions,
    confidence: 0.35,
  };
}
