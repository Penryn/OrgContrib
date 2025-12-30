import Link from "next/link";

import { auth, signIn, signOut } from "@/auth";

export default async function Home() {
  const session = await auth();

  return (
    <main className="min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-amber-50 text-zinc-900">
      {/* Decorative elements */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-20 -top-20 h-64 w-64 rounded-full bg-gradient-to-br from-red-200/40 to-orange-200/40 blur-3xl" />
        <div className="absolute -bottom-20 -right-20 h-64 w-64 rounded-full bg-gradient-to-br from-amber-200/40 to-yellow-200/40 blur-3xl" />
      </div>

      <div className="relative mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 py-16">
        <header className="flex flex-col gap-3">
          <h1 className="bg-gradient-to-r from-red-600 via-orange-600 to-amber-600 bg-clip-text text-3xl font-bold tracking-tight text-transparent">
            🎉 zjutjh 组织贡献看板（今年）
          </h1>
          <p className="text-base leading-7 text-zinc-700">
            先同步今年 <span className="font-semibold text-red-600">zjutjh/*</span> 仓库的 PR 与 Commit 记录（按 Asia/Shanghai），然后按人/仓库快速查看贡献并生成年度报告。
          </p>
        </header>

        {session ? (
          <section className="overflow-hidden rounded-xl border border-orange-200 bg-gradient-to-br from-white to-orange-50/50 p-6 shadow-lg ring-1 ring-orange-100">
            <div className="text-sm font-medium text-orange-600">已登录 ✨</div>
            <div className="mt-1 text-lg font-semibold text-zinc-900">
              {session.user?.name ?? session.user?.email ?? "GitHub 用户"}
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/dashboard"
                className="inline-flex h-10 items-center justify-center rounded-lg bg-gradient-to-r from-red-600 to-orange-600 px-4 text-sm font-medium text-white shadow-md transition-all hover:from-red-700 hover:to-orange-700 hover:shadow-lg hover:-translate-y-0.5"
              >
                进入看板 →
              </Link>

              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <button
                  type="submit"
                  className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-orange-200 bg-white px-4 text-sm font-medium text-orange-700 transition-all hover:bg-orange-50 hover:border-orange-300"
                >
                  退出登录
                </button>
              </form>
            </div>
          </section>
        ) : (
          <section className="overflow-hidden rounded-xl border border-orange-200 bg-gradient-to-br from-white to-orange-50/50 p-6 shadow-lg ring-1 ring-orange-100">
            <div className="text-sm font-medium text-orange-600">未登录</div>
            <form
              className="mt-4"
              action={async () => {
                "use server";
                await signIn("github", { redirectTo: "/dashboard" });
              }}
            >
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center rounded-lg bg-gradient-to-r from-red-600 to-orange-600 px-4 text-sm font-medium text-white shadow-md transition-all hover:from-red-700 hover:to-orange-700 hover:shadow-lg hover:-translate-y-0.5"
              >
                🚀 使用 GitHub 登录
              </button>
            </form>
            <p className="mt-3 text-sm text-zinc-600">
              我们会使用你的授权来读取你可访问的 <span className="font-semibold text-red-600">zjutjh</span> 组织仓库数据（含私有仓库）。
            </p>
          </section>
        )}

        <footer className="text-sm text-zinc-500" />
      </div>
    </main>
  );
}
