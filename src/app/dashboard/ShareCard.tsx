"use client";

import { useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";

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
  ranking?: {
    percentile: number;
    rank: number;
    totalUsers: number;
  } | null;
  onClose: () => void;
};

export function ShareCard({ org, year, userLogin, totals, summary, ranking, onClose }: ShareCardProps) {
  const date = useMemo(() => new Date().toLocaleDateString("zh-CN"), []);
  const cardRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [hideButtons, setHideButtons] = useState(false);

  const handleSaveImage = async () => {
    if (!cardRef.current) return;

    setSaving(true);
    setHideButtons(true);
    
    try {
      // Wait for state update to take effect
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const canvas = await html2canvas(cardRef.current, {
        scale: 2,
        backgroundColor: "#18181b", // zinc-900
        logging: false,
        useCORS: true,
        allowTaint: true,
        windowWidth: 375,
        windowHeight: 667,
      });

      // Download image
      const link = document.createElement("a");
      link.download = `${org}-${year}-${userLogin}-contribution.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (error) {
      console.error("Failed to save image:", error);
      alert("保存图片失败，请重试");
    } finally {
      setHideButtons(false);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="share-card-wrapper flex flex-col gap-4">
        {/* Action Bar */}
        {!hideButtons && (
          <div className="action-bar flex justify-end gap-2">
            <button
              onClick={handleSaveImage}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-zinc-900 shadow-lg hover:bg-zinc-50 disabled:opacity-60 transition-colors"
            >
              {saving ? (
                <>
                  <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  保存中...
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                  </svg>
                  保存图片
                </>
              )}
            </button>
          </div>
        )}

        {/* Share Card */}
        <div
          ref={cardRef}
          className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-zinc-900 to-zinc-800 text-white shadow-2xl"
          style={{ width: "375px", minHeight: "667px" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header Pattern - Simplified for better rendering */}
          <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-gradient-to-br from-white/10 to-transparent" />
          <div className="absolute -left-16 -bottom-16 h-48 w-48 rounded-full bg-gradient-to-tr from-blue-500/20 to-transparent" />

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

            {/* Ranking Badge */}
            {ranking && ranking.rank > 0 ? (
              <div className="mt-6 rounded-xl bg-gradient-to-r from-amber-500/20 to-orange-500/20 p-4 ring-1 ring-amber-500/30">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-amber-200">贡献者排名</div>
                    <div className="mt-1 text-2xl font-bold text-amber-50">
                      Top {ranking.percentile}%
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-amber-200">排名</div>
                    <div className="mt-1 text-xl font-semibold text-amber-50">
                      #{ranking.rank} / {ranking.totalUsers}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Stats Grid */}
            <div className="mt-6 grid grid-cols-2 gap-4">
              <div className="rounded-xl bg-white/5 p-4 ring-1 ring-white/10">
                <div className="text-xs text-zinc-400">PRs Created</div>
                <div className="mt-1 text-2xl font-semibold">{totals.prs}</div>
              </div>
              <div className="rounded-xl bg-white/5 p-4 ring-1 ring-white/10">
                <div className="text-xs text-zinc-400">PRs Reviewed</div>
                <div className="mt-1 text-2xl font-semibold">{totals.reviewedPrs}</div>
              </div>
              <div className="rounded-xl bg-white/5 p-4 ring-1 ring-white/10">
                <div className="text-xs text-zinc-400">Commits</div>
                <div className="mt-1 text-2xl font-semibold">{totals.commits}</div>
              </div>
              <div className="rounded-xl bg-white/5 p-4 ring-1 ring-white/10">
                <div className="text-xs text-zinc-400">Repos</div>
                <div className="mt-1 text-2xl font-semibold">{totals.accessibleRepos}</div>
              </div>
            </div>

            {/* AI Summary */}
            <div className="mt-6">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-zinc-400">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                AI Summary
              </div>
              <div className="relative rounded-xl bg-gradient-to-br from-white/10 to-white/5 p-5 text-sm leading-relaxed text-zinc-200 ring-1 ring-white/10">
                <span className="absolute -left-1 -top-2 text-4xl text-white/10">&ldquo;</span>
                {summary}
                <span className="absolute -bottom-4 -right-1 text-4xl text-white/10">&rdquo;</span>
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
          {!hideButtons && (
            <button
              onClick={onClose}
              className="close-button absolute right-4 top-4 rounded-full bg-black/20 p-1 text-white/50 hover:bg-black/40 hover:text-white transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
