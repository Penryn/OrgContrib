import Link from "next/link";
import { redirect } from "next/navigation";

import { AiCommentaryPanel } from "./AiCommentary";
import { CommitScanJobPanel } from "./CommitScanJob";

import { auth, signOut } from "@/auth";
import type { YearToDateSnapshot } from "@/lib/snapshot";
import { computeYearToDateSnapshot } from "@/lib/snapshot";
import { formatShanghaiDate } from "@/lib/time";

export const dynamic = "force-dynamic";

function StatCard(props: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5">
      <div className="text-sm text-zinc-500">{props.label}</div>
      <div className="mt-2 text-3xl font-semibold tracking-tight">{props.value}</div>
      {props.hint ? <div className="mt-2 text-xs text-zinc-500">{props.hint}</div> : null}
    </div>
  );
}

function SnapshotView(props: { snapshot: YearToDateSnapshot }) {
  const commitHint = (() => {
    const repoErrors = props.snapshot.totals.commitsRepoErrors;
    const attemptedRepos = props.snapshot.totals.commitsAttemptedRepos;

    switch (props.snapshot.totals.commitsStatus) {
      case "not_started":
        return "尚未执行扫描，点击下方「启动扫描」生成 Commit 统计";
      case "queued":
        return "已进入队列，等待 worker 消费";
      case "running":
        return "扫描中…完成后会刷新页面";
      case "failed":
        return "扫描失败，可在下方重新启动";
      case "completed":
        if (typeof repoErrors === "number" && repoErrors > 0) {
          const suffix = typeof attemptedRepos === "number" ? `（${repoErrors}/${attemptedRepos} 仓库失败）` : `（${repoErrors} 仓库失败）`;
          return `已完成（部分仓库扫描失败，结果可能低估）${suffix}`;
        }
        return "已完成（按 committedDate / 全分支去重 / 排除 merge commits）";
      default:
        return undefined;
    }
  })();

  return (
    <div className="flex flex-col gap-10">
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="PR 数" value={String(props.snapshot.totals.prs)} />
        <StatCard label="Review 过的 PR 数" value={String(props.snapshot.totals.reviewedPrs)} />
        <StatCard
          label="Commits（全分支）"
          value={props.snapshot.totals.commits === null ? "—" : String(props.snapshot.totals.commits)}
          hint={commitHint}
        />
      </section>

      <CommitScanJobPanel />

      <section className="rounded-xl border border-zinc-200 bg-white">
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
          <h2 className="text-sm font-medium text-zinc-900">按仓库汇总（Top）</h2>
          <div className="text-xs text-zinc-500">repo: {props.snapshot.byRepo.length}</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-zinc-500">
              <tr>
                <th className="px-6 py-3">仓库</th>
                <th className="px-6 py-3">PR</th>
                <th className="px-6 py-3">Reviewed PR</th>
                <th className="px-6 py-3">Commits</th>
              </tr>
            </thead>
            <tbody>
              {props.snapshot.byRepo.slice(0, 30).map((row) => (
                <tr key={row.repo} className="border-t border-zinc-100">
                  <td className="px-6 py-3 font-medium text-zinc-900">{row.repo}</td>
                  <td className="px-6 py-3 text-zinc-700">{row.prs}</td>
                  <td className="px-6 py-3 text-zinc-700">{row.reviewedPrs}</td>
                  <td className="px-6 py-3 text-zinc-500">{row.commits ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <AiCommentaryPanel />
    </div>
  );
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/");

  if (!session.accessToken) {
    return (
      <main className="min-h-screen bg-zinc-50 text-zinc-900">
        <div className="mx-auto w-full max-w-3xl px-6 py-12">
          <h1 className="text-2xl font-semibold tracking-tight">今年贡献（zjutjh）</h1>
          <p className="mt-3 text-sm text-zinc-600">当前会话缺少 GitHub Access Token，请重新登录。</p>
          <div className="mt-6">
            <Link className="underline" href="/">
              返回首页
            </Link>
          </div>
        </div>
      </main>
    );
  }

  let snapshot: YearToDateSnapshot;
  try {
    snapshot = await computeYearToDateSnapshot({ token: session.accessToken });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return (
      <main className="min-h-screen bg-zinc-50 text-zinc-900">
        <div className="mx-auto w-full max-w-3xl px-6 py-12">
          <h1 className="text-2xl font-semibold tracking-tight">今年贡献（zjutjh）</h1>
          <p className="mt-3 text-sm text-zinc-600">拉取 GitHub 数据失败：</p>
          <pre className="mt-3 overflow-x-auto rounded-lg border border-zinc-200 bg-white p-4 text-xs leading-5">
            {message}
          </pre>
          <div className="mt-6 flex gap-4 text-sm">
            <Link className="underline" href="/">
              返回首页
            </Link>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <button type="submit" className="underline">
                退出登录
              </button>
            </form>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto w-full max-w-5xl px-6 py-12">
        <header className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">今年贡献（zjutjh）</h1>
              <p className="mt-1 text-sm text-zinc-600">
                viewer: <span className="font-medium text-zinc-900">{snapshot.viewer.login}</span> · range: {formatShanghaiDate(snapshot.from)} ~ {formatShanghaiDate(snapshot.to)}
              </p>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <Link className="underline" href="/spec">
                口径文档
              </Link>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <button type="submit" className="underline">
                  退出
                </button>
              </form>
            </div>
          </div>
          <p className="text-xs text-zinc-500">computedAt: {snapshot.computedAt}</p>
        </header>

        <div className="mt-8">
          <SnapshotView snapshot={snapshot} />
        </div>
      </div>
    </main>
  );
}
