import { readFile } from "node:fs/promises";
import path from "node:path";

export default async function SpecPage() {
  const specPath = path.join(process.cwd(), "docs", "PROJECT_SPEC.md");
  const spec = await readFile(specPath, "utf8");

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto w-full max-w-4xl px-6 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">PROJECT_SPEC</h1>
        <p className="mt-2 text-sm text-zinc-600">
          这是仓库内的需求与口径文档（原文：docs/PROJECT_SPEC.md）。
        </p>
        <pre className="mt-6 overflow-x-auto rounded-xl border border-zinc-200 bg-white p-6 text-sm leading-6">
          {spec}
        </pre>
      </div>
    </main>
  );
}
