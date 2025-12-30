import { useMemo } from "react";

type ShareCardProps = {
  org: string;
  year: number;
  userLogin: string;
  totals: {
    prs: number;
    reviewedPrs: number;
    commits: number;
    accessibleRepos: number;
  };
  summary: string;
  onClose: () => void;
};

export function ShareCard({ org, year, userLogin, totals, summary, onClose }: ShareCardProps) {
  const date = useMemo(() => new Date().toLocaleDateString("zh-CN"), []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-full max-w-md overflow-hidden rounded-2xl bg-gradient-to-br from-zinc-900 to-zinc-800 text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Pattern */}
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/5 blur-3xl" />
        <div className="absolute -left-16 -bottom-16 h-48 w-48 rounded-full bg-blue-500/10 blur-3xl" />

        <div className="relative p-8">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Annual Report</div>
              <h2 className="mt-1 text-2xl font-bold tracking-tight">{year} 年度贡献报告</h2>
              <div className="mt-1 text-sm text-zinc-400">@{org}</div>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-xl font-bold">
              {userLogin.slice(0, 1).toUpperCase()}
            </div>
          </div>

          {/* Stats Grid */}
          <div className="mt-8 grid grid-cols-2 gap-4">
            <div className="rounded-xl bg-white/5 p-4 backdrop-blur-sm">
              <div className="text-xs text-zinc-400">PRs Created</div>
              <div className="mt-1 text-2xl font-semibold">{totals.prs}</div>
            </div>
            <div className="rounded-xl bg-white/5 p-4 backdrop-blur-sm">
              <div className="text-xs text-zinc-400">PRs Reviewed</div>
              <div className="mt-1 text-2xl font-semibold">{totals.reviewedPrs}</div>
            </div>
            <div className="rounded-xl bg-white/5 p-4 backdrop-blur-sm">
              <div className="text-xs text-zinc-400">Commits</div>
              <div className="mt-1 text-2xl font-semibold">{totals.commits}</div>
            </div>
            <div className="rounded-xl bg-white/5 p-4 backdrop-blur-sm">
              <div className="text-xs text-zinc-400">Repos</div>
              <div className="mt-1 text-2xl font-semibold">{totals.accessibleRepos}</div>
            </div>
          </div>

          {/* AI Summary */}
          <div className="mt-8">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-zinc-400">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
              AI Summary
            </div>
            <div className="relative rounded-xl bg-gradient-to-br from-white/10 to-white/5 p-5 text-sm leading-relaxed text-zinc-200">
              <span className="absolute -left-1 -top-2 text-4xl text-white/10">“</span>
              {summary}
              <span className="absolute -bottom-4 -right-1 text-4xl text-white/10">”</span>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 flex items-center justify-between border-t border-white/10 pt-6">
            <div className="flex flex-col">
              <span className="text-xs font-medium text-white">OrgContrib</span>
              <span className="text-[10px] text-zinc-500">Generated on {date}</span>
            </div>
            <div className="text-right">
              <div className="text-xs font-medium text-zinc-300">@{userLogin}</div>
            </div>
          </div>
        </div>

        {/* Close Button (Visible only on screen) */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full bg-black/20 p-1 text-white/50 hover:bg-black/40 hover:text-white"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    </div>
  );
}
