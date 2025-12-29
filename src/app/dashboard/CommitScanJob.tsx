"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type JobStatus = "queued" | "running" | "completed" | "failed";

type JobResponse = {
  id: string;
  type: string;
  status: JobStatus;
  progress: number;
  total?: number | null;
  message?: string | null;
  createdAt: string;
  updatedAt: string;
};

export function CommitScanJobPanel() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [job, setJob] = useState<JobResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const poll = useCallback(
    async (jobId: string) => {
      const res = await fetch(`/api/jobs/${jobId}`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      const json = (await res.json()) as JobResponse;
      setJob(json);

      if (json.status === "completed" || json.status === "failed") {
        stop();
        if (json.status === "completed") {
          router.refresh();
        }
      }
    },
    [router, stop],
  );

  const start = useCallback(async () => {
    setLoading(true);
    setError(null);
    setJob(null);
    stop();

    try {
      const res = await fetch("/api/jobs/commit-scan", { method: "POST" });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      }

      const { jobId } = (await res.json()) as { jobId: string };
      await poll(jobId);

      timerRef.current = window.setInterval(() => {
        poll(jobId).catch((err) => {
          setJob({
            id: jobId,
            type: "commit_scan",
            status: "failed",
            progress: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            message: err instanceof Error ? err.message : String(err),
          });
          stop();
        });
      }, 800);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [poll, stop]);

  useEffect(() => () => stop(), [stop]);

  return (
    <section className="rounded-xl border border-zinc-200 bg-white">
      <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
        <div>
          <h2 className="text-sm font-medium text-zinc-900">Commit 扫描任务（全分支）</h2>
          <p className="mt-1 text-xs text-zinc-500">
            统计今年 commits：扫描可访问的 zjutjh/* 仓库所有分支，按 SHA 去重并排除 merge commits。
          </p>
        </div>
        <button
          type="button"
          onClick={start}
          disabled={loading}
          className="inline-flex h-9 items-center justify-center rounded-md bg-zinc-900 px-3 text-sm font-medium text-white disabled:opacity-60"
        >
          {loading ? "启动中…" : "启动扫描"}
        </button>
      </div>

      <div className="px-6 py-4 text-sm">
        {error ? (
          <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-900">
            启动失败：{error}
          </div>
        ) : null}

        {!job ? (
          <div className="space-y-2 text-zinc-600">
            <p className="text-zinc-500">需要 Postgres / Redis / worker 才能看到进度。</p>
            <pre className="overflow-x-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs leading-5">
              {`docker compose up -d\n` +
                `npm run db:migrate\n` +
                `npm run worker`}
            </pre>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div>
              <span className="text-zinc-500">状态：</span>
              <span className="font-medium text-zinc-900">{job.status}</span>
            </div>
            <div>
              <span className="text-zinc-500">进度：</span>
              <span className="font-medium text-zinc-900">{job.progress}%</span>
            </div>
            {job.status === "completed" ? (
              <div className="text-xs text-zinc-500">已完成：页面已刷新（如未更新可手动刷新）。</div>
            ) : null}
            {job.message ? <div className="text-xs text-zinc-500">message: {job.message}</div> : null}
          </div>
        )}
      </div>
    </section>
  );
}
