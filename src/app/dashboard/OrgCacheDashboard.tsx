"use client";

import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import { ShareCard } from "./ShareCard";

// Lazy load chart components for better performance
const ContributionTrendChart = lazy(() => 
  import("./charts/ContributionTrendChart").then(mod => ({ default: mod.ContributionTrendChart }))
);
const RepoContributionChart = lazy(() => 
  import("./charts/RepoContributionChart").then(mod => ({ default: mod.RepoContributionChart }))
);
const ContributionTypeChart = lazy(() => 
  import("./charts/ContributionTypeChart").then(mod => ({ default: mod.ContributionTypeChart }))
);

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
  byWeek?: Array<{ week: string; prs: number; reviews: number; commits: number }>;
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

type RankingResponse = {
  login: string;
  rank: number;
  totalUsers: number;
  percentile: number;
  totalRank: { rank: number; total: number };
  prRank: { rank: number; total: number };
  reviewRank: { rank: number; total: number };
  commitRank: { rank: number; total: number };
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

const Icons = {
  PR: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-500">
      <circle cx="18" cy="18" r="3"></circle>
      <circle cx="6" cy="6" r="3"></circle>
      <path d="M13 6h3a2 2 0 0 1 2 2v7"></path>
      <line x1="6" y1="9" x2="6" y2="21"></line>
    </svg>
  ),
  Review: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-orange-500">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path>
      <circle cx="12" cy="12" r="3"></circle>
    </svg>
  ),
  Commit: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500">
      <circle cx="12" cy="12" r="3"></circle>
      <line x1="3" y1="12" x2="9" y2="12"></line>
      <line x1="15" y1="12" x2="21" y2="12"></line>
    </svg>
  ),
  Repo: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
    </svg>
  ),
  Check: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  ),
  Loader: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin text-blue-500">
      <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
    </svg>
  ),
};

function StatusBadge(props: { status: CacheStatus }) {
  const config = (() => {
    switch (props.status) {
      case "completed":
        return { color: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "已完成" };
      case "running":
        return { color: "bg-blue-50 text-blue-700 border-blue-200", label: "同步中" };
      case "queued":
        return { color: "bg-amber-50 text-amber-700 border-amber-200", label: "排队中" };
      case "failed":
        return { color: "bg-rose-50 text-rose-700 border-rose-200", label: "失败" };
      case "not_started":
      default:
        return { color: "bg-zinc-50 text-zinc-700 border-zinc-200", label: "未开始" };
    }
  })();

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${config.color}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${props.status === "running" ? "animate-pulse bg-current" : "bg-current"}`} />
      {config.label}
    </span>
  );
}

function StatCard(props: { label: string; value: string; hint?: string; icon?: React.ReactNode }) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-zinc-200 bg-white p-5 transition-all hover:border-zinc-300 hover:shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm font-medium text-zinc-500">{props.label}</div>
          <div className="mt-2 text-3xl font-bold tracking-tight text-zinc-900">{props.value}</div>
        </div>
        {props.icon && <div className="rounded-lg bg-zinc-50 p-2 ring-1 ring-zinc-100">{props.icon}</div>}
      </div>
      {props.hint ? <div className="mt-3 text-xs text-zinc-400">{props.hint}</div> : null}
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

  const [ranking, setRanking] = useState<RankingResponse | null>(null);
  const [rankingLoading, setRankingLoading] = useState(false);

  const [reportLoading, setReportLoading] = useState(false);
  const [reportResponse, setReportResponse] = useState<AnnualReportResponse | null>(null);
  const [showShareCard, setShowShareCard] = useState(false);

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

  const loadRanking = useCallback(async () => {
    setRankingLoading(true);
    try {
      const json = await fetchJson<RankingResponse>("/api/org-cache/ranking");
      setRanking(json);
    } catch (err) {
      console.error("Failed to load ranking:", err);
      setRanking(null);
    } finally {
      setRankingLoading(false);
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
                  loadMe().then(() => {
                    loadRanking().catch(() => {
                      // ignore
                    });
                  }).catch(() => {
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
          loadMe().then(() => {
            loadRanking().catch(() => {
              // ignore
            });
          }).catch(() => {
            // ignore
          });
        }
      })
      .catch(() => {
        // ignore
      });

    return () => stopPolling();
  }, [loadMe, loadStatus, stopPolling, loadRanking]);

  const ready = status?.status === "completed";

  const title = useMemo(() => {
    if (!status) return "组织年度缓存（PR + Review + Commit）";
    return `组织年度缓存（${status.year}）`;
  }, [status]);

  return (
    <div className="flex flex-col gap-8">
      <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-zinc-200 bg-zinc-50/50 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="font-semibold text-zinc-900">{title}</h2>
              {status ? <StatusBadge status={status.status} /> : null}
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              服务启动时自动同步（全仓库、全分支去重），完成后可查看个人贡献。
            </p>
          </div>
        </div>

        <div className="px-6 py-5 text-sm">
          {statusError ? (
            <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-rose-900">
              <div className="font-medium">状态加载失败</div>
              <div className="mt-1 text-xs opacity-90">{statusError}</div>
            </div>
          ) : null}

          {!status ? (
            <div className="flex items-center gap-2 text-zinc-500">
              <Icons.Loader />
              <span>加载状态中…</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Organization</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-semibold text-zinc-900">{status.org}</span>
                  <span className="text-sm text-zinc-500">{status.year}</span>
                </div>
              </div>
              
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Sync Progress</span>
                <div className="flex items-center gap-3">
                  <div className="h-2 w-full max-w-[120px] overflow-hidden rounded-full bg-zinc-100">
                    <div 
                      className="h-full bg-zinc-900 transition-all duration-500 ease-out" 
                      style={{ width: `${status.progress}%` }} 
                    />
                  </div>
                  <span className="font-medium text-zinc-900">{status.progress}%</span>
                </div>
                {typeof status.totalRepos === "number" ? (
                  <span className="text-xs text-zinc-400">Scanned {status.totalRepos} repositories</span>
                ) : null}
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Last Update</span>
                <div className="text-sm text-zinc-900">
                  {status.computedAt ? new Date(status.computedAt).toLocaleString("zh-CN") : "Pending..."}
                </div>
                {status.message ? <div className="truncate text-xs text-zinc-400" title={status.message}>{status.message}</div> : null}
              </div>
            </div>
          )}
        </div>
      </section>

      {!ready ? (
        <section className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 py-12 text-center">
          <div className="rounded-full bg-zinc-100 p-3">
            <Icons.Loader />
          </div>
          <h3 className="mt-4 text-sm font-medium text-zinc-900">
            {status?.status === "running" || status?.status === "queued" ? "正在同步数据..." : "等待服务就绪"}
          </h3>
          <p className="mt-1 text-xs text-zinc-500">
            {status?.status === "running" || status?.status === "queued" 
              ? "完成后会自动展示你的贡献数据，请稍候。" 
              : "请检查 worker 日志或数据库连接状态。"}
          </p>
        </section>
      ) : (
        <section className="flex flex-col gap-8">
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-900">我的贡献</h2>
              <span className="text-xs text-zinc-500">基于你有权限访问的仓库</span>
            </div>

            <div className="text-sm">
              {meLoading ? (
                <div className="flex items-center gap-2 text-zinc-500 py-8">
                  <Icons.Loader />
                  <span>正在加载贡献数据...</span>
                </div>
              ) : meError ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-rose-900">加载失败：{meError}</div>
              ) : !me ? (
                <div className="text-zinc-500 py-8">暂无数据。</div>
              ) : (
                <div className="flex flex-col gap-8">
                  <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <StatCard 
                      label="PR Created" 
                      value={String(me.totals.prs)} 
                      hint={`Author: ${me.viewer.login}`}
                      icon={<Icons.PR />}
                    />
                    <StatCard 
                      label="PR Reviewed" 
                      value={String(me.totals.reviewedPrs)} 
                      hint="Code Review"
                      icon={<Icons.Review />}
                    />
                    <StatCard 
                      label="Commits" 
                      value={String(me.totals.commits)} 
                      hint="Default Branch Only"
                      icon={<Icons.Commit />}
                    />
                    <StatCard 
                      label="Repositories" 
                      value={String(me.scope.accessibleRepos)} 
                      hint="Accessible Scope"
                      icon={<Icons.Repo />}
                    />
                  </section>

                  {/* Ranking Section */}
                  {ranking && ranking.rank > 0 ? (
                    <section className="overflow-hidden rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 shadow-sm">
                      <div className="border-b border-amber-200 px-6 py-4">
                        <h3 className="font-semibold text-amber-900">🏆 贡献者排名</h3>
                      </div>
                      <div className="px-6 py-6">
                        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                          <div className="rounded-xl bg-white/60 p-6 shadow-sm ring-1 ring-amber-100">
                            <div className="text-center">
                              <div className="text-sm font-medium text-amber-600 uppercase tracking-wider">总排名</div>
                              <div className="mt-3 text-5xl font-bold text-amber-900">Top {ranking.percentile}%</div>
                              <div className="mt-2 text-sm text-amber-700">
                                第 {ranking.rank} 名 / 共 {ranking.totalUsers} 人
                              </div>
                              <div className="mt-4 h-2 overflow-hidden rounded-full bg-amber-100">
                                <div
                                  className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-500"
                                  style={{ width: `${100 - ranking.percentile}%` }}
                                />
                              </div>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 gap-3">
                            <div className="rounded-xl bg-white/60 p-4 shadow-sm ring-1 ring-purple-100">
                              <div className="flex items-center justify-between">
                                <div className="text-xs font-medium text-purple-600 uppercase tracking-wider">PR 排名</div>
                                <Icons.PR />
                              </div>
                              <div className="mt-2 text-2xl font-bold text-purple-900">
                                #{ranking.prRank.rank}
                              </div>
                            </div>
                            <div className="rounded-xl bg-white/60 p-4 shadow-sm ring-1 ring-orange-100">
                              <div className="flex items-center justify-between">
                                <div className="text-xs font-medium text-orange-600 uppercase tracking-wider">Review 排名</div>
                                <Icons.Review />
                              </div>
                              <div className="mt-2 text-2xl font-bold text-orange-900">
                                #{ranking.reviewRank.rank}
                              </div>
                            </div>
                            <div className="rounded-xl bg-white/60 p-4 shadow-sm ring-1 ring-blue-100">
                              <div className="flex items-center justify-between">
                                <div className="text-xs font-medium text-blue-600 uppercase tracking-wider">Commit 排名</div>
                                <Icons.Commit />
                              </div>
                              <div className="mt-2 text-2xl font-bold text-blue-900">
                                #{ranking.commitRank.rank}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </section>
                  ) : rankingLoading ? (
                    <section className="flex items-center justify-center rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
                      <Icons.Loader />
                      <span className="ml-2 text-sm text-zinc-500">正在加载排名数据...</span>
                    </section>
                  ) : null}

                  {/* Charts Section */}
                  <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    <div className="lg:col-span-2">
                      <Suspense fallback={
                        <div className="flex items-center justify-center rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
                          <Icons.Loader />
                          <span className="ml-2 text-sm text-zinc-500">加载图表中...</span>
                        </div>
                      }>
                        {me.byWeek && me.byWeek.length > 0 ? (
                          <ContributionTrendChart data={me.byWeek} />
                        ) : null}
                      </Suspense>
                    </div>
                    <div className="grid grid-cols-1 gap-6">
                      <Suspense fallback={
                        <div className="flex items-center justify-center rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
                          <Icons.Loader />
                        </div>
                      }>
                        <ContributionTypeChart 
                          data={{
                            prs: me.totals.prs,
                            reviews: me.totals.reviewedPrs,
                            commits: me.totals.commits,
                          }}
                        />
                      </Suspense>
                    </div>
                  </section>

                  <section className="grid grid-cols-1 gap-6">
                    <Suspense fallback={
                      <div className="flex items-center justify-center rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
                        <Icons.Loader />
                        <span className="ml-2 text-sm text-zinc-500">加载图表中...</span>
                      </div>
                    }>
                      {me.byRepo && me.byRepo.length > 0 ? (
                        <RepoContributionChart data={me.byRepo} maxRepos={10} />
                      ) : null}
                    </Suspense>
                  </section>

                  <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
                    <section className="col-span-1 flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm lg:col-span-2">
                      <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-6 py-4">
                        <h3 className="font-medium text-zinc-900">仓库贡献明细</h3>
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                          {me.byRepo.length} Repos
                        </span>
                      </div>
                      <div className="flex-1 overflow-auto min-h-[500px]">
                        <table className="w-full text-sm">
                          <thead className="sticky top-0 bg-zinc-50 text-left text-xs font-medium text-zinc-500">
                            <tr>
                              <th className="px-6 py-3">Repository</th>
                              <th className="px-6 py-3 text-right">PRs</th>
                              <th className="px-6 py-3 text-right">Reviews</th>
                              <th className="px-6 py-3 text-right">Commits</th>
                              <th className="px-6 py-3 text-right">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-100">
                            {me.byRepo.slice(0, 60).map((row) => (
                              <tr key={row.repo} className="group hover:bg-zinc-50/50">
                                <td className="px-6 py-3 font-medium text-zinc-900 group-hover:text-blue-600 transition-colors">
                                  {row.repo}
                                </td>
                                <td className="px-6 py-3 text-right text-zinc-600">{row.prs}</td>
                                <td className="px-6 py-3 text-right text-zinc-600">{row.reviewedPrs}</td>
                                <td className="px-6 py-3 text-right text-zinc-600">{row.commits}</td>
                                <td className="px-6 py-3 text-right font-medium text-zinc-900">{row.total}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>

                    <section className="flex flex-col gap-4">
                      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm">
                        <div className="border-b border-zinc-200 px-6 py-4">
                          <h3 className="font-medium text-zinc-900">最近 PR</h3>
                        </div>
                        <div className="max-h-[300px] overflow-auto px-2 py-2">
                          {me.recent.prs.length ? (
                            <ul className="space-y-1">
                              {me.recent.prs.map((pr) => (
                                <li key={`${pr.repo}#${pr.number}`} className="group flex flex-col gap-1 rounded-lg p-3 hover:bg-zinc-50">
                                  <a className="truncate text-sm font-medium text-zinc-900 group-hover:text-blue-600 group-hover:underline" href={pr.url} target="_blank" rel="noreferrer">
                                    {pr.title}
                                  </a>
                                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                                    <span className="font-mono">{pr.repo}#{pr.number}</span>
                                    <span>·</span>
                                    <span>{pr.state}</span>
                                    <span>·</span>
                                    <span>{pr.createdAt.slice(0, 10)}</span>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="p-4 text-center text-zinc-500">无数据</div>
                          )}
                        </div>
                      </div>

                      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm">
                        <div className="border-b border-zinc-200 px-6 py-4">
                          <h3 className="font-medium text-zinc-900">最近 Review</h3>
                        </div>
                        <div className="max-h-[300px] overflow-auto px-2 py-2">
                          {me.recent.reviews.length ? (
                            <ul className="space-y-1">
                              {me.recent.reviews.map((r) => (
                                <li key={`${r.repo}#${r.number}@${r.reviewedAt}`} className="group flex flex-col gap-1 rounded-lg p-3 hover:bg-zinc-50">
                                  <a className="truncate text-sm font-medium text-zinc-900 group-hover:text-blue-600 group-hover:underline" href={r.url} target="_blank" rel="noreferrer">
                                    {r.title}
                                  </a>
                                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                                    <span className="font-mono">{r.repo}#{r.number}</span>
                                    <span>·</span>
                                    <span>{r.reviewedAt.slice(0, 10)}</span>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="p-4 text-center text-zinc-500">无数据</div>
                          )}
                        </div>
                      </div>
                    </section>
                  </div>

                  <section className="overflow-hidden rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/50 to-white shadow-sm">
                    <div className="flex items-center justify-between border-b border-indigo-100 px-6 py-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-indigo-950">AI 年度报告</h3>
                          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-600">BETA</span>
                        </div>
                        <p className="mt-1 text-xs text-indigo-600/80">基于统计数据生成，不包含代码内容</p>
                      </div>
                      <div className="flex gap-3">
                        {reportResponse ? (
                          <button
                            type="button"
                            onClick={() => setShowShareCard(true)}
                            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-white px-4 text-sm font-medium text-indigo-700 shadow-sm hover:bg-indigo-50 transition-colors"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                            分享卡片
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={runReport}
                          disabled={reportLoading}
                          className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60 transition-colors"
                        >
                          {reportLoading ? (
                            <>
                              <Icons.Loader />
                              <span>生成中…</span>
                            </>
                          ) : (
                            <>
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                              <span>生成报告</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="px-6 py-6">
                      {!reportResponse ? (
                        <div className="flex flex-col items-center justify-center py-8 text-center text-indigo-400/60">
                          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mb-4 opacity-50"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                          <p className="text-sm">点击右上角“生成报告”获取你的年度总结</p>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-6 text-sm">
                          {reportResponse.source === "fallback" && reportResponse.error ? (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
                              <div className="font-medium">AI 服务暂时不可用</div>
                              <div className="mt-1 text-xs opacity-90">{reportResponse.error}</div>
                            </div>
                          ) : null}

                          <div className="rounded-xl bg-white/60 p-6 shadow-sm ring-1 ring-indigo-100">
                            <div className="mb-3 flex items-center gap-2 text-xs font-medium text-indigo-500 uppercase tracking-wider">
                              <Icons.Check />
                              Summary
                            </div>
                            <div className="text-base leading-relaxed text-zinc-800">{reportResponse.report.summary}</div>
                          </div>

                          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                            {reportResponse.report.highlights.length ? (
                              <div className="rounded-xl bg-emerald-50/50 p-5 ring-1 ring-emerald-100">
                                <div className="mb-3 text-xs font-medium text-emerald-600 uppercase tracking-wider">Highlights</div>
                                <ul className="space-y-2">
                                  {reportResponse.report.highlights.map((t, idx) => (
                                    <li key={idx} className="flex items-start gap-2 text-zinc-700">
                                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                                      <span>{t}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}

                            {reportResponse.report.risks.length ? (
                              <div className="rounded-xl bg-amber-50/50 p-5 ring-1 ring-amber-100">
                                <div className="mb-3 text-xs font-medium text-amber-600 uppercase tracking-wider">Attention</div>
                                <ul className="space-y-2">
                                  {reportResponse.report.risks.map((t, idx) => (
                                    <li key={idx} className="flex items-start gap-2 text-zinc-700">
                                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                                      <span>{t}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}

                            {reportResponse.report.actions.length ? (
                              <div className="rounded-xl bg-blue-50/50 p-5 ring-1 ring-blue-100">
                                <div className="mb-3 text-xs font-medium text-blue-600 uppercase tracking-wider">Suggestions</div>
                                <ul className="space-y-2">
                                  {reportResponse.report.actions.map((t, idx) => (
                                    <li key={idx} className="flex items-start gap-2 text-zinc-700">
                                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" />
                                      <span>{t}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}
                          </div>

                          <div className="text-right text-xs text-indigo-400">
                            AI Confidence: {reportResponse.report.confidence}
                          </div>
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

      {showShareCard && status && me && reportResponse ? (
        <ShareCard
          org={status.org}
          year={status.year}
          userLogin={me.viewer.login}
          totals={{
            ...me.totals,
            accessibleRepos: me.scope.accessibleRepos,
          }}
          summary={reportResponse.report.summary}
          ranking={ranking ? {
            percentile: ranking.percentile,
            rank: ranking.rank,
            totalUsers: ranking.totalUsers,
          } : null}
          onClose={() => setShowShareCard(false)}
        />
      ) : null}
    </div>
  );
}

