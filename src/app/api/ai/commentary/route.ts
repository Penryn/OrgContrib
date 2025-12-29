import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { buildInsightMetrics, fallbackCommentary, generateAiCommentary } from "@/lib/ai/commentary";
import { computeYearToDateSnapshot } from "@/lib/snapshot";

export const runtime = "nodejs";

type ApiResponse = {
  source: "ai" | "fallback";
  commentary: ReturnType<typeof fallbackCommentary>;
  error?: string;
};

export async function POST() {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const snapshot = await computeYearToDateSnapshot({ token: session.accessToken });
  const metrics = buildInsightMetrics(snapshot);

  try {
    const commentary = await generateAiCommentary(metrics);
    const payload: ApiResponse = { source: "ai", commentary };
    return NextResponse.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const payload: ApiResponse = {
      source: "fallback",
      commentary: fallbackCommentary(metrics),
      error: message,
    };
    return NextResponse.json(payload);
  }
}
