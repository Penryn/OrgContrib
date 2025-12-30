import Link from "next/link";

import { auth, signIn, signOut } from "@/auth";

export default async function Home() {
  const session = await auth();

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 py-16">
        <header className="flex flex-col gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">zjutjh 组织贡献看板（今年）</h1>
          <p className="text-base leading-7 text-zinc-600">
            先同步今年 <span className="font-medium text-zinc-900">zjutjh/*</span> 仓库的 PR 与 Commit 记录（按 Asia/Shanghai），然后按人/仓库快速查看贡献并生成年度报告。
          </p>
        </header>

        {session ? (
          <section className="rounded-xl border border-zinc-200 bg-white p-6">
            <div className="text-sm text-zinc-500">已登录</div>
            <div className="mt-1 text-lg font-medium">
              {session.user?.name ?? session.user?.email ?? "GitHub 用户"}
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/dashboard"
                className="inline-flex h-10 items-center justify-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800"
              >
                进入看板
              </Link>

              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <button
                  type="submit"
                  className="inline-flex h-10 w-full items-center justify-center rounded-md border border-zinc-200 bg-white px-4 text-sm font-medium hover:bg-zinc-50"
                >
                  退出登录
                </button>
              </form>
            </div>
          </section>
        ) : (
          <section className="rounded-xl border border-zinc-200 bg-white p-6">
            <div className="text-sm text-zinc-500">未登录</div>
            <form
              className="mt-4"
              action={async () => {
                "use server";
                await signIn("github", { redirectTo: "/dashboard" });
              }}
            >
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800"
              >
                使用 GitHub 登录
              </button>
            </form>
            <p className="mt-3 text-sm text-zinc-500">
              我们会使用你的授权来读取你可访问的 <span className="font-medium">zjutjh</span> 组织仓库数据（含私有仓库）。
            </p>
          </section>
        )}

        <footer className="text-sm text-zinc-500" />
      </div>
    </main>
  );
}
