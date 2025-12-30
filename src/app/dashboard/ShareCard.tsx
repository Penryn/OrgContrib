"use client";

import { useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";

const CARD_WIDTH_PX = 450;
const CARD_HEIGHT_PX = 800; // 9:16

function formatTopPercent(percentile?: number | null): string {
  const value = typeof percentile === "number" ? percentile : Number.NaN;
  if (!Number.isFinite(value)) return "--";
  const rounded = Math.max(1, Math.min(100, Math.round(value)));
  return String(rounded);
}

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
  const [showAvatar, setShowAvatar] = useState(true);
  const avatarUrl = useMemo(() => `/api/avatar/${encodeURIComponent(userLogin)}?size=160`, [userLogin]);

  const handleSaveImage = async () => {
    if (!cardRef.current) return;

    setSaving(true);
    setHideButtons(true);
    
    try {
      // Wait for state update to take effect
      await new Promise((resolve) => setTimeout(resolve, 100));

      const el = cardRef.current;
      if (!el) {
        throw new Error("Card element not available (maybe closed during export)");
      }
      
      const dataUrl = await toPng(el, {
        pixelRatio: 2,
        width: CARD_WIDTH_PX,
        height: CARD_HEIGHT_PX,
      });

      // Download image
      const link = document.createElement("a");
      link.download = `${org}-${year}-${userLogin}-contribution.png`;
      link.href = dataUrl;
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
      <div className="share-card-wrapper flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
        {/* Action Bar */}
        {!hideButtons && (
          <div className="action-bar flex justify-end gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                void handleSaveImage();
              }}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-red-900 shadow-lg hover:bg-red-50 disabled:opacity-60 transition-colors"
            >
              {saving ? (
                <>
                  <svg className="h-4 w-4 animate-spin text-red-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  保存中...
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-600">
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
          className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-red-900 via-red-800 to-orange-900 text-white shadow-2xl"
          style={{ width: `${CARD_WIDTH_PX}px`, height: `${CARD_HEIGHT_PX}px` }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header Pattern - Festive decorative elements */}
          <div
            className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-gradient-to-br from-yellow-500/20 to-transparent"
          />
          <div
            className="absolute -left-16 -bottom-16 h-48 w-48 rounded-full bg-gradient-to-tr from-orange-500/20 to-transparent"
          />
          <div
            className="absolute right-10 top-20 h-32 w-32 rounded-full bg-gradient-to-br from-white/10 to-transparent"
          />

          <div className="relative flex h-full flex-col p-8">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs font-bold text-orange-200 uppercase tracking-wider">Annual Report</div>
                <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-white">{year} 年度贡献报告</h2>
                <div className="mt-1 text-sm font-medium text-orange-100">@{org}</div>
              </div>
              {showAvatar ? (
                <img
                  src={avatarUrl}
                  alt={`${userLogin} avatar`}
                  className="h-12 w-12 rounded-full shadow-lg ring-2 ring-white/30"
                  onError={() => setShowAvatar(false)}
                  referrerPolicy="no-referrer"
                />
              ) : null}
            </div>

            {/* Ranking Badge (keep layout consistent even if ranking is missing) */}
            <div className="relative mt-5 overflow-hidden rounded-xl bg-white/10 p-6 shadow-lg ring-1 ring-white/20 backdrop-blur-sm">
              <div className="relative flex items-start justify-between gap-6">
                <div>
                  <div className="text-sm font-bold text-orange-100">贡献者排名</div>
                  <div className="mt-2 text-2xl font-extrabold tracking-tight text-white">
                    Top {formatTopPercent(ranking?.percentile)}%
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-sm font-bold text-orange-100">排名</div>
                  <div className="mt-2 text-2xl font-extrabold tracking-tight text-white">
                    {ranking?.rank && ranking.rank > 0 ? ranking.rank : "--"}{" "}
                    <span className="text-lg text-white/60">/ {ranking?.totalUsers && ranking.totalUsers > 0 ? ranking.totalUsers : "--"}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="mt-5 grid grid-cols-2 gap-4">
              <div
                className="rounded-xl bg-white/5 p-4 shadow-md ring-1 ring-white/10"
              >
                <div className="text-xs font-bold text-orange-200">PRs Created</div>
                <div className="mt-1 text-2xl font-extrabold text-white">{totals.prs}</div>
              </div>
              <div
                className="rounded-xl bg-white/5 p-4 shadow-md ring-1 ring-white/10"
              >
                <div className="text-xs font-bold text-orange-200">PRs Reviewed</div>
                <div className="mt-1 text-2xl font-extrabold text-white">{totals.reviewedPrs}</div>
              </div>
              <div
                className="rounded-xl bg-white/5 p-4 shadow-md ring-1 ring-white/10"
              >
                <div className="text-xs font-bold text-orange-200">Commits</div>
                <div className="mt-1 text-2xl font-extrabold text-white">{totals.commits}</div>
              </div>
              <div
                className="rounded-xl bg-white/5 p-4 shadow-md ring-1 ring-white/10"
              >
                <div className="text-xs font-bold text-orange-200">Repos</div>
                <div className="mt-1 text-2xl font-extrabold text-white">{totals.accessibleRepos}</div>
              </div>
            </div>

            {/* AI Summary */}
            <div className="mt-5 flex flex-1 flex-col">
              <div className="mb-2 flex items-center gap-2 text-xs font-bold text-orange-200">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-orange-400" />
                AI Summary
              </div>
              <div
                className="relative flex flex-1 flex-col justify-center rounded-xl bg-white/10 px-8 py-6 text-left text-base font-medium leading-relaxed text-orange-50 shadow-lg ring-1 ring-white/20 backdrop-blur-sm"
              >
                <span
                  className={`pointer-events-none select-none absolute left-4 top-2 text-5xl ${
                    "text-white/20"
                  }`}
                >
                  &ldquo;
                </span>
                {summary}
                <span
                  className={`pointer-events-none select-none absolute bottom-[-10px] right-4 text-5xl ${
                    "text-white/20"
                  }`}
                >
                  &rdquo;
                </span>
              </div>
            </div>

            {/* Footer */}
            <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-6">
              <div className="flex flex-col">
                <span className="text-xs font-bold text-orange-200">OrgContrib</span>
                <span className="text-[10px] text-white/40">
                  Generated on {date}
                </span>
              </div>
              <div className="text-right">
                <div className="text-xs font-bold text-orange-200">@{userLogin}</div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
