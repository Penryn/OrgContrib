"use client";

import { useCallback, useState } from "react";

type AiCommentary = {
  summary: string;
  highlights: string[];
  risks: string[];
  actions: string[];
  confidence: number;
};

type ApiResponse = {
  source: "ai" | "fallback";
  commentary: AiCommentary;
  error?: string;
};

export function AiCommentaryPanel() {
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<ApiResponse | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setResponse(null);

    try {
      const res = await fetch("/api/ai/commentary", { method: "POST" });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
      }

      const json = (await res.json()) as ApiResponse;
      setResponse(json);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setResponse({
        source: "fallback",
        commentary: {
          summary: "生成失败（客户端）",
          highlights: [],
          risks: [message],
          actions: ["稍后重试"],
          confidence: 0,
        },
        error: message,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <section className="rounded-xl border border-zinc-200 bg-white">
      <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
        <div>
          <h2 className="text-sm font-medium text-zinc-900">AI 点评（只基于统计）</h2>
          <p className="mt-1 text-xs text-zinc-500">不发送仓库名/PR 文本/链接/代码</p>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={loading}
          className="inline-flex h-9 items-center justify-center rounded-md bg-zinc-900 px-3 text-sm font-medium text-white disabled:opacity-60"
        >
          {loading ? "生成中…" : "生成点评"}
        </button>
      </div>

      <div className="px-6 py-4">
        {!response ? (
          <p className="text-sm text-zinc-500">点击“生成点评”后展示结果。</p>
        ) : (
          <div className="flex flex-col gap-4 text-sm">
            {response.source === "fallback" && response.error ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
                AI 调用失败，已降级为模板文案：{response.error}
              </div>
            ) : null}

            <div>
              <div className="text-xs font-medium text-zinc-500">总结</div>
              <div className="mt-1 text-zinc-900">{response.commentary.summary}</div>
            </div>

            {response.commentary.highlights.length ? (
              <div>
                <div className="text-xs font-medium text-zinc-500">亮点</div>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-zinc-900">
                  {response.commentary.highlights.map((t, idx) => (
                    <li key={idx}>{t}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {response.commentary.risks.length ? (
              <div>
                <div className="text-xs font-medium text-zinc-500">风险/注意</div>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-zinc-900">
                  {response.commentary.risks.map((t, idx) => (
                    <li key={idx}>{t}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {response.commentary.actions.length ? (
              <div>
                <div className="text-xs font-medium text-zinc-500">建议行动</div>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-zinc-900">
                  {response.commentary.actions.map((t, idx) => (
                    <li key={idx}>{t}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="text-xs text-zinc-500">置信度：{response.commentary.confidence}</div>
          </div>
        )}
      </div>
    </section>
  );
}
