"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type CacheStatus = "not_started" | "queued" | "running" | "completed" | "failed";

type OrgCacheStatusResponse = {
  org: string;
  year: number;
  timezone: string;
  from: string;
  to: string;
  computedAt: string | null;
  status: CacheStatus;
  progress: number;
  totalRepos: number | null;
  message: string | null;
  jobId: string | null;
  totals: Record<string, unknown>;
  updatedAt: string | null;
};

type MeContribResponse = {
  org: string;
  year: number;
  viewer: { login: string };
  scope: { accessibleRepos: number };
  totals: { prs: number; reviewedPrs: number; commits: number };
  byRepo: Array<{ repo: string; prs: number; reviewedPrs: number; commits: number; total: number }>;
  recent: {
    prs: Array<{
      repo: string;
      number: number;
      title: string;
      url: string;
      state: string;
      createdAt: string;
      mergedAt: string | null;
    }>;
    reviews: Array<{
      repo: string;
      number: number;
      title: string;
      url: string;
      reviewedAt: string;
    }>;
    commits: Array<{
      repo: string;
      oid: string;
      messageHeadline: string;
      url: string;
      committedDate: string;
    }>;
    limit: number;
  };
};

type AiReport = {
  summary: string;
  highlights: string[];
  risks: string[];
  actions: string[];
  confidence: number;
};

type AnnualReportResponse = {
  source: "ai" | "fallback";
  report: AiReport;
  error?: string;
};

function StatusBadge(props: { status: CacheStatus }) {
  const style = (() => {
    switch (props.status) {
      case "completed":
        return "border-emerald-200 bg-emerald-50 text-emerald-900";
      case "running":
        return "border-blue-200 bg-blue-50 text-blue-900";
      case "queued":
        return "border-amber-200 bg-amber-50 text-amber-900";
      case "failed":
        return "border-rose-200 bg-rose-50 text-rose-900";
      case "not_started":
      default:
        return "border-zinc-200 bg-zinc-50 text-zinc-700";
    }
  })();

  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${style}`}>{props.status}</span>;
}

function StatCard(props: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5">
      <div className="text-sm text-zinc-500">{props.label}</div>
      <div className="mt-2 text-3xl font-semibold tracking-tight">{props.value}</div>
      {props.hint ? <div className="mt-2 text-xs text-zinc-500">{props.hint}</div> : null}
    </div>
  );
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export function OrgCacheDashboard() {
  const [status, setStatus] = useState<OrgCacheStatusResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [me, setMe] = useState<MeContribResponse | null>(null);
  const [meLoading, setMeLoading] = useState(false);
  const [meError, setMeError] = useState<string | null>(null);

  const [reportLoading, setReportLoading] = useState(false);
  const [reportResponse, setReportResponse] = useState<AnnualReportResponse | null>(null);

  const pollTimer = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimer.current !== null) {
      window.clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      setStatusError(null);
      const json = await fetchJson<OrgCacheStatusResponse>("/api/org-cache/status");
      setStatus(json);
      return json;
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  }, []);

  const loadMe = useCallback(async () => {
    setMeLoading(true);
    setMeError(null);
    setReportResponse(null);
    try {
      const json = await fetchJson<MeContribResponse>("/api/org-cache/me");
      setMe(json);
    } catch (err) {
      setMe(null);
      setMeError(err instanceof Error ? err.message : String(err));
    } finally {
      setMeLoading(false);
    }
  }, []);

  const runReport = useCallback(async () => {
    setReportLoading(true);
    setReportResponse(null);

    try {
      const json = await fetchJson<AnnualReportResponse>("/api/ai/annual-report", { method: "POST" });
      setReportResponse(json);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setReportResponse({
        source: "fallback",
        report: {
          summary: "生成失败（客户端）",
          highlights: [],
          risks: [message],
          actions: ["稍后重试"],
          confidence: 0,
        },
        error: message,
      });
    } finally {
      setReportLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus()
      .then((s) => {
        if (s.status === "queued" || s.status === "running") {
          pollTimer.current = window.setInterval(() => {
            loadStatus()
              .then((next) => {
                if (next.status === "completed" || next.status === "failed") {
                  stopPolling();
                }
                if (next.status === "completed") {
                  loadMe().catch(() => {
                    // ignore
                  });
                }
              })
              .catch(() => {
                // ignore polling errors
              });
          }, 1200);
          return;
        }

        if (s.status === "completed") {
          loadMe().catch(() => {
            // ignore
          });
        }
      })
      .catch(() => {
        // ignore
      });

    return () => stopPolling();
  }, [loadMe, loadStatus, stopPolling]);

  const ready = status?.status === "completed";

  const title = useMemo(() => {
    if (!status) return "组织年度缓存（PR + Review + Commit）";
    return `组织年度缓存（${status.year}）`;
  }, [status]);

  return (
    <div className="flex flex-col gap-10">
      <section className="rounded-xl border border-zinc-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-zinc-200 px-6 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-medium text-zinc-900">{title}</h2>
              {status ? <StatusBadge status={status.status} /> : null}
            </div>
            <p className="mt-1 text-xs text-zinc-500">服务启动时会自动同步一次（全仓库、全分支去重），完成后用户按自身仓库权限读取缓存汇总。</p>
          </div>
        </div>

        <div className="px-6 py-4 text-sm">
          {statusError ? (
            <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-900">状态加载失败：{statusError}</div>
          ) : null}

          {!status ? (
            <div className="text-zinc-500">加载状态中…</div>
          ) : (
            <div className="flex flex-col gap-2 text-zinc-700">
              <div>
                <span className="text-zinc-500">org：</span>
                <span className="font-medium text-zinc-900">{status.org}</span>
                <span className="ml-2 text-zinc-500">year：</span>
                <span className="font-medium text-zinc-900">{status.year}</span>
              </div>
              <div>
                <span className="text-zinc-500">progress：</span>
                <span className="font-medium text-zinc-900">{status.progress}%</span>
                {typeof status.totalRepos === "number" ? <span className="ml-2 text-zinc-500">repos: {status.totalRepos}</span> : null}
              </div>
              {status.computedAt ? <div className="text-xs text-zinc-500">computedAt: {status.computedAt}</div> : null}
              {status.message ? <div className="text-xs text-zinc-500">message: {status.message}</div> : null}
            </div>
          )}
        </div>
      </section>

      {!ready ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500">
          {status?.status === "running" || status?.status === "queued"
            ? "年度缓存同步中：完成后会自动展示你的贡献数据。"
            : "年度缓存未就绪：请检查 worker 日志/数据库连接。"}
        </section>
      ) : (
        <section className="flex flex-col gap-10">
          <section className="rounded-xl border border-zinc-200 bg-white">
            <div className="border-b border-zinc-200 px-6 py-4">
              <h2 className="text-sm font-medium text-zinc-900">我的贡献（按你有权限的仓库过滤）</h2>
              <p className="mt-1 text-xs text-zinc-500">PR / Review / Commit 同时加载；加载中不展示仓库明细。</p>
            </div>

            <div className="px-6 py-4 text-sm">
              {meLoading ? (
                <div className="text-zinc-500">加载 PR + Review + Commit 中…</div>
              ) : meError ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-900">加载失败：{meError}</div>
              ) : !me ? (
                <div className="text-zinc-500">暂无数据。</div>
              ) : (
                <div className="flex flex-col gap-10">
                  <section className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                    <StatCard label="PR 数" value={String(me.totals.prs)} hint={`viewer: ${me.viewer.login}`} />
                    <StatCard label="Review 他人 PR 数" value={String(me.totals.reviewedPrs)} />
                    <StatCard label="Commits（全分支去重）" value={String(me.totals.commits)} />
                    <StatCard label="可访问仓库数" value={String(me.scope.accessibleRepos)} />
                  </section>

                  <section className="rounded-xl border border-zinc-200 bg-white">
                    <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
                      <h3 className="text-sm font-medium text-zinc-900">按仓库汇总（只显示有贡献的仓库）</h3>
                      <div className="text-xs text-zinc-500">repo: {me.byRepo.length}</div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="text-left text-xs text-zinc-500">
                          <tr>
                            <th className="px-6 py-3">仓库</th>
                            <th className="px-6 py-3">PR</th>
                            <th className="px-6 py-3">Review</th>
                            <th className="px-6 py-3">Commit</th>
                            <th className="px-6 py-3">总计</th>
                          </tr>
                        </thead>
                        <tbody>
                          {me.byRepo.slice(0, 60).map((row) => (
                            <tr key={row.repo} className="border-t border-zinc-100">
                              <td className="px-6 py-3 font-medium text-zinc-900">{row.repo}</td>
                              <td className="px-6 py-3 text-zinc-700">{row.prs}</td>
                              <td className="px-6 py-3 text-zinc-700">{row.reviewedPrs}</td>
                              <td className="px-6 py-3 text-zinc-700">{row.commits}</td>
                              <td className="px-6 py-3 text-zinc-700">{row.total}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                    <div className="rounded-xl border border-zinc-200 bg-white">
                      <div className="border-b border-zinc-200 px-6 py-4">
                        <h3 className="text-sm font-medium text-zinc-900">最近 PR（Top {me.recent.limit}）</h3>
                      </div>
                      <div className="max-h-[420px] overflow-auto px-6 py-4 text-sm">
                        {me.recent.prs.length ? (
                          <ul className="space-y-2">
                            {me.recent.prs.map((pr) => (
                              <li key={`${pr.repo}#${pr.number}`} className="flex flex-col gap-1">
                                <a className="truncate font-medium text-zinc-900 underline" href={pr.url} target="_blank" rel="noreferrer">
                                  {pr.repo}#{pr.number} {pr.title}
                                </a>
                                <div className="text-xs text-zinc-500">
                                  {pr.state} · {pr.createdAt.slice(0, 10)}
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="text-zinc-500">无</div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl border border-zinc-200 bg-white">
                      <div className="border-b border-zinc-200 px-6 py-4">
                        <h3 className="text-sm font-medium text-zinc-900">最近 Review（Top {me.recent.limit}）</h3>
                      </div>
                      <div className="max-h-[420px] overflow-auto px-6 py-4 text-sm">
                        {me.recent.reviews.length ? (
                          <ul className="space-y-2">
                            {me.recent.reviews.map((r) => (
                              <li key={`${r.repo}#${r.number}@${r.reviewedAt}`} className="flex flex-col gap-1">
                                <a className="truncate font-medium text-zinc-900 underline" href={r.url} target="_blank" rel="noreferrer">
                                  {r.repo}#{r.number} {r.title}
                                </a>
                                <div className="text-xs text-zinc-500">{r.reviewedAt.slice(0, 10)}</div>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="text-zinc-500">无</div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl border border-zinc-200 bg-white">
                      <div className="border-b border-zinc-200 px-6 py-4">
                        <h3 className="text-sm font-medium text-zinc-900">最近 Commit（Top {me.recent.limit}）</h3>
                      </div>
                      <div className="max-h-[420px] overflow-auto px-6 py-4 text-sm">
                        {me.recent.commits.length ? (
                          <ul className="space-y-2">
                            {me.recent.commits.map((c) => (
                              <li key={`${c.repo}@${c.oid}`} className="flex flex-col gap-1">
                                <a className="truncate font-medium text-zinc-900 underline" href={c.url} target="_blank" rel="noreferrer">
                                  {c.repo}@{c.oid.slice(0, 7)} {c.messageHeadline}
                                </a>
                                <div className="text-xs text-zinc-500">{c.committedDate.slice(0, 10)}</div>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="text-zinc-500">无</div>
                        )}
                      </div>
                    </div>
                  </section>

                  <section className="rounded-xl border border-zinc-200 bg-white">
                    <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
                      <div>
                        <h3 className="text-sm font-medium text-zinc-900">AI 年度报告（只基于统计）</h3>
                        <p className="mt-1 text-xs text-zinc-500">默认不发送仓库名/PR 标题/commit message/链接/代码</p>
                      </div>
                      <button
                        type="button"
                        onClick={runReport}
                        disabled={reportLoading}
                        className="inline-flex h-9 items-center justify-center rounded-md bg-zinc-900 px-3 text-sm font-medium text-white disabled:opacity-60"
                      >
                        {reportLoading ? "生成中…" : "生成报告"}
                      </button>
                    </div>

                    <div className="px-6 py-4">
                      {!reportResponse ? (
                        <p className="text-sm text-zinc-500">点击“生成报告”后展示结果。</p>
                      ) : (
                        <div className="flex flex-col gap-4 text-sm">
                          {reportResponse.source === "fallback" && reportResponse.error ? (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
                              AI 调用失败，已降级为模板文案：{reportResponse.error}
                            </div>
                          ) : null}

                          <div>
                            <div className="text-xs font-medium text-zinc-500">总结</div>
                            <div className="mt-1 text-zinc-900">{reportResponse.report.summary}</div>
                          </div>

                          {reportResponse.report.highlights.length ? (
                            <div>
                              <div className="text-xs font-medium text-zinc-500">亮点</div>
                              <ul className="mt-1 list-disc space-y-1 pl-5 text-zinc-900">
                                {reportResponse.report.highlights.map((t, idx) => (
                                  <li key={idx}>{t}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}

                          {reportResponse.report.risks.length ? (
                            <div>
                              <div className="text-xs font-medium text-zinc-500">风险/注意</div>
                              <ul className="mt-1 list-disc space-y-1 pl-5 text-zinc-900">
                                {reportResponse.report.risks.map((t, idx) => (
                                  <li key={idx}>{t}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}

                          {reportResponse.report.actions.length ? (
                            <div>
                              <div className="text-xs font-medium text-zinc-500">建议行动</div>
                              <ul className="mt-1 list-disc space-y-1 pl-5 text-zinc-900">
                                {reportResponse.report.actions.map((t, idx) => (
                                  <li key={idx}>{t}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}

                          <div className="text-xs text-zinc-500">置信度：{reportResponse.report.confidence}</div>
                        </div>
                      )}
                    </div>
                  </section>
                </div>
              )}
            </div>
          </section>
        </section>
      )}
    </div>
  );
}

