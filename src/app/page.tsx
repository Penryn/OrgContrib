import Link from "next/link";
import { auth, signIn, signOut } from "@/auth";

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </svg>
  );
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z" />
    </svg>
  );
}

export default async function Home() {
  const session = await auth();

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-zinc-50 px-6 py-12 text-zinc-900 sm:px-12">
      {/* Subtle Background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-[20%] -top-[20%] h-[600px] w-[600px] rounded-full bg-orange-100/40 blur-[120px]" />
        <div className="absolute -bottom-[20%] -right-[20%] h-[600px] w-[600px] rounded-full bg-red-100/40 blur-[120px]" />
        <div className="absolute left-1/2 top-1/2 h-[800px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/60 blur-[100px]" />
      </div>

      <div className="relative z-10 flex w-full max-w-2xl flex-col items-center gap-10 text-center">
        {/* Header Section */}
        <header className="flex flex-col items-center gap-6 animate-fadeIn">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-orange-200/60 bg-white/80 px-4 py-1.5 text-xs font-semibold text-orange-700 shadow-sm backdrop-blur-sm">
            <SparklesIcon className="h-3.5 w-3.5" />
            <span>2025 Annual Report</span>
          </div>
          
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl">
            <span className="block text-zinc-900">回顾你的</span>
            <span className="block bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
              2025 精弘之旅
            </span>
          </h1>
          
          <p className="max-w-lg text-lg leading-relaxed text-zinc-600">
            每一行代码都值得被铭记，每一次协作都充满意义。<br className="hidden sm:block" />
            感谢你这一年为 <span className="font-semibold text-zinc-900">zjutjh</span> 社区付出的辛勤与智慧。
          </p>
        </header>

        {/* Main Action Card */}
        <div className="w-full max-w-sm animate-fadeIn [animation-delay:200ms]">
          {session ? (
            <div className="group relative overflow-hidden rounded-2xl border border-zinc-200 bg-white p-8 shadow-xl transition-all hover:shadow-2xl hover:-translate-y-0.5">
              <div className="relative flex flex-col items-center gap-6">
                <div className="flex flex-col items-center gap-3">
                  <div className="h-20 w-20 overflow-hidden rounded-full border-4 border-orange-50 shadow-sm">
                    {session.user?.image ? (
                      <img src={session.user.image} alt="Avatar" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-orange-50 text-2xl font-bold text-orange-600">
                        {session.user?.name?.[0] ?? "U"}
                      </div>
                    )}
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-medium text-zinc-500">欢迎回来</div>
                    <div className="text-xl font-bold text-zinc-900">
                      {session.user?.name ?? session.user?.email ?? "Contributor"}
                    </div>
                  </div>
                </div>

                <div className="flex w-full flex-col gap-3">
                  <Link
                    href="/dashboard"
                    className="group/btn relative flex h-11 w-full items-center justify-center overflow-hidden rounded-lg bg-zinc-900 text-sm font-medium text-white shadow-md transition-all hover:bg-zinc-800 hover:shadow-lg"
                  >
                    <span className="relative z-10 flex items-center gap-2">
                      查看我的年度报告
                      <svg className="h-4 w-4 transition-transform group-hover/btn:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </span>
                  </Link>

                  <form
                    action={async () => {
                      "use server";
                      await signOut({ redirectTo: "/" });
                    }}
                    className="w-full"
                  >
                    <button
                      type="submit"
                      className="flex h-11 w-full items-center justify-center rounded-lg border border-zinc-200 bg-transparent text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-zinc-900"
                    >
                      退出登录
                    </button>
                  </form>
                </div>
              </div>
            </div>
          ) : (
            <div className="group relative overflow-hidden rounded-2xl border border-zinc-200 bg-white p-8 shadow-xl transition-all hover:shadow-2xl hover:-translate-y-0.5">
              <div className="relative flex flex-col items-center gap-6 text-center">
                <div className="rounded-2xl bg-orange-50 p-4 ring-1 ring-orange-100">
                  <ChartIcon className="h-8 w-8 text-orange-600" />
                </div>
                
                <div>
                  <h3 className="text-lg font-bold text-zinc-900">开启你的年度回顾</h3>
                  <p className="mt-2 text-sm text-zinc-500 leading-relaxed">
                    登录以获取你在 zjutjh 组织的贡献数据分析
                  </p>
                </div>

                <form
                  className="w-full"
                  action={async () => {
                    "use server";
                    await signIn("github", { redirectTo: "/dashboard" });
                  }}
                >
                  <button
                    type="submit"
                    className="group/btn relative flex h-11 w-full items-center justify-center overflow-hidden rounded-lg bg-[#24292F] text-sm font-medium text-white shadow-md transition-all hover:bg-[#24292F]/90 hover:shadow-lg"
                  >
                    <span className="relative z-10 flex items-center gap-2">
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                      </svg>
                      使用 GitHub 继续
                    </span>
                  </button>
                </form>
                
                <p className="text-xs text-zinc-400">
                  我们将读取你的公开及私有仓库贡献数据用于生成报告
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Message */}
        <div className="animate-fadeIn text-center [animation-delay:400ms]">
          <p className="text-sm font-medium text-zinc-400">
            Made for the Open Source Community
          </p>
        </div>
      </div>
    </main>
  );
}
