import crypto from "node:crypto";

import { z } from "zod";

export const aiCommentarySchema = z.object({
  summary: z.string().min(1),
  highlights: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  actions: z.array(z.string()).min(1),
  confidence: z.number().min(0).max(1),
});

export type AiCommentary = z.infer<typeof aiCommentarySchema>;

export const annualReportMetricsSchema = z.object({
  org: z.string().min(1),
  year: z.number().int(),
  timezone: z.literal("Asia/Shanghai"),
  from: z.string().min(1),
  to: z.string().min(1),
  totals: z.object({
    prs: z.number().int().min(0),
    reviewedPrs: z.number().int().min(0),
    commits: z.number().int().min(0),
    prAdditions: z.number().int().min(0).nullable(),
    prDeletions: z.number().int().min(0).nullable(),
    commitAdditions: z.number().int().min(0).nullable(),
    commitDeletions: z.number().int().min(0).nullable(),
    contributingRepos: z.number().int().min(0),
    activeDays: z.number().int().min(0),
  }),
  repos: z.object({
    top1Share: z.number().min(0).max(1).nullable(),
    top3Share: z.number().min(0).max(1).nullable(),
  }),
  mix: z.object({
    reviewToPrRatio: z.number().min(0).nullable(),
  }),
  notes: z.object({
    commitScope: z.string().min(1),
    prScope: z.string().min(1),
  }),
});

export type AnnualReportMetrics = z.infer<typeof annualReportMetricsSchema>;

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
        max_tokens: 950,
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

export async function generateAiAnnualReport(metrics: AnnualReportMetrics): Promise<AiCommentary> {
  const cacheKey = sha256(JSON.stringify(metrics));
  const cached = inMemoryCache.get(cacheKey);
  if (cached) return cached;

  const timeoutMs = Number(process.env.AI_TIMEOUT_MS ?? 15000);
  const maxRetries = Math.max(0, Number(process.env.AI_MAX_RETRIES ?? 2));

  const system: ChatMessage = {
    role: "system",
    content:
      "你是一个活泼、靠谱的年度总结小助手 ✨。" +
      "你只根据用户提供的 metrics 里的数字与字段来写年度回顾，绝对不要猜、不要脑补。" +
      "语气要轻松活泼，像朋友之间聊天那样～多用点 emoji 表情增加趣味性 🎉。" +
      "夸人的时候要具体、真诚；给建议的时候要温和、接地气，别搞那些大道理和模板话术。" +
      "你看不到代码与上下文：不要评价代码质量/技术水平；也不要输出任何仓库名、PR 标题、commit message 或你编出来的例子。" +
      "如果 metrics 里某个字段是 null 或缺失，就当作\"无法判断\"，不要硬推结论。" +
      "输出必须是严格 JSON（不要 Markdown、不要代码块、不要多余文字），字段固定为：" +
      "summary(string), highlights(string[]), risks(string[]), actions(string[]), confidence(number 0~1)。" +
      "summary 2~4 句，要有点小俏皮、轻松的感觉，可以适当用 emoji；highlights 2~4 条（每条尽量带上数字和 emoji）；" +
      "risks 1~3 条（说成\"小提醒/注意点\"，语气温和点）；actions 3~5 条（具体、可执行、尽量可量化：频率/周期/数量，也可以加 emoji）。" +
      "confidence 依据数据完整度与一致性给分：数据越完整越高，信息越缺越低。"
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

export function fallbackAnnualReport(metrics: AnnualReportMetrics): AiCommentary {
  const total = metrics.totals.prs + metrics.totals.reviewedPrs + metrics.totals.commits;

  const highlights: string[] = [];
  if (metrics.totals.prs > 0) highlights.push(`🎯 今年产出了 ${metrics.totals.prs} 个 PR，保持了不错的协作输出节奏呢！`);
  if (metrics.totals.reviewedPrs > 0) highlights.push(`👀 Review 了 ${metrics.totals.reviewedPrs} 个 PR，协作参与度很赞哦～`);
  if (metrics.totals.commits > 0) highlights.push(`💻 提交了 ${metrics.totals.commits} 次 Commit，持续推动项目落地！`);
  if (metrics.totals.contributingRepos > 0) highlights.push(`📦 覆盖了 ${metrics.totals.contributingRepos} 个仓库，协作广度不错！`);

  const risks: string[] = [];
  if (total === 0) risks.push("今年暂无贡献记录哦～可能需要先完成一次年度同步，或确认一下统计口径与权限范围");
  if (metrics.repos.top1Share !== null && metrics.repos.top1Share >= 0.85) {
    risks.push("贡献有点集中在单个仓库啦，在保持主阵地投入的同时，适度扩展到相关仓库会更好哦");
  }
  if (metrics.mix.reviewToPrRatio !== null && metrics.mix.reviewToPrRatio < 0.3 && metrics.totals.prs > 0) {
    risks.push("Review 参与度偏低了点，建议在保持产出的同时，每周固定做一次小而快的 review～");
  }

  const actions: string[] = [];
  if (total === 0) {
    actions.push("从 1 个仓库开始：先完成一个小而闭环的 PR（文档/脚本/修复都可以）🚀");
    actions.push("设定节奏：例如每两周 1 个可合并 PR，并在周末做一次复盘 ✍️");
    actions.push("把常见问题沉淀为模板/脚手架，降低后续改动成本 💡");
  } else {
    actions.push("保持稳定节奏：把年度目标拆成月目标（例如每月 2~4 个 PR）📅");
    if (metrics.totals.reviewedPrs === 0) {
      actions.push("从 1 次 review 开始：优先挑小 PR，在 24~48 小时内给到可执行反馈 ⏰");
    } else {
      actions.push("继续做可复用的 review：把高频问题沉淀为 checklist/模板，提升团队效率 ✨");
    }
    actions.push("提升影响力：选 1~2 次贡献做复盘，总结可复用的规范/自动化脚本 📝");
    actions.push("提高可维护性：对关键模块补充最小验证（README 步骤/脚本/测试三选一）🔧");
    actions.push("扩大协作面：在相邻仓库做一次小改动或协助修复，形成跨仓库影响力 🌟");
  }

  return {
    summary:
      `这是基于统计指标生成的 ${metrics.year} 年度贡献报告（范围：${metrics.org}，${metrics.timezone}）🎉 ` +
      (total > 0 ? "整体看你保持了持续的产出节奏，继续加油！💪" : "目前统计显示贡献为 0，建议先确认同步状态与权限范围～"),
    highlights,
    risks,
    actions,
    confidence: total > 0 ? 0.55 : 0.35,
  };
}
