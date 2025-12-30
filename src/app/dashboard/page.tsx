import Link from "next/link";
import { redirect } from "next/navigation";

import { OrgCacheDashboard } from "./OrgCacheDashboard";

import { auth, signOut } from "@/auth";

export const dynamic = "force-dynamic";

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

  return (
    <main className="min-h-screen bg-zinc-50/50 text-zinc-900">
      <div className="w-full border-b border-zinc-200 bg-white px-6 py-4 shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-white">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36.5-8 3C6.77 2.16 5.16 1.5 3.5 1.5c-1.66 0-3.27.66-4.5 1.5-2.64-2.5-5.36-3.5-8-3C-8.65 2.85-8.65 5.35-8.65 6.5c-.73 1.02-1.08 2.25-1 3.5 0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
                <path d="M9 18c-4.51 2-5-2-7-2" />
              </svg>
            </div>
            <h1 className="text-lg font-semibold tracking-tight">OrgContrib</h1>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-zinc-500">@{session.user?.name ?? "user"}</span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <button type="submit" className="text-zinc-600 hover:text-zinc-900">
                退出
              </button>
            </form>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-5xl px-6 py-8">
        <header className="mb-8">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900">今年贡献概览</h2>
          <p className="mt-2 text-zinc-500">
            同步组织数据，查看个人贡献统计，并生成 AI 年度总结报告。
          </p>
        </header>


        <div className="mt-8">
          <OrgCacheDashboard />
        </div>
      </div>
    </main>
  );
}
