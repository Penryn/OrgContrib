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
    <main className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto w-full max-w-5xl px-6 py-12">
        <header className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">今年贡献（zjutjh）</h1>
              <p className="mt-1 text-sm text-zinc-600">先同步今年组织数据，再按人/仓库查看与生成年度报告。</p>
            </div>
            <div className="flex items-center gap-4 text-sm">
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
        </header>

        <div className="mt-8">
          <OrgCacheDashboard />
        </div>
      </div>
    </main>
  );
}
