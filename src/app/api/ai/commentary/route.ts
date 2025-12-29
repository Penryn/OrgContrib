import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { aiCommentarySchema, buildInsightMetrics, fallbackCommentary, generateAiCommentary } from "@/lib/ai/commentary";
import { prisma } from "@/lib/db";
import { githubGraphql } from "@/lib/github";
import { computeYearToDateSnapshot } from "@/lib/snapshot";
import { formatShanghaiDate } from "@/lib/time";

export const runtime = "nodejs";

const ORG_LOGIN = "zjutjh";

type ApiResponse = {
  source: "ai" | "fallback";
  commentary: ReturnType<typeof fallbackCommentary>;
  error?: string;
};

type ViewerLoginQuery = { viewer: { login: string } };

export async function POST() {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const viewer = await githubGraphql<ViewerLoginQuery>({
    token: session.accessToken,
    query: "query { viewer { login } }",
  });

  const todayKey = formatShanghaiDate(new Date().toISOString());

  if (process.env.DATABASE_URL) {
    try {
      const cached = await prisma.aiCommentaryCache.findUnique({
        where: {
          userLogin_org_date: {
            userLogin: viewer.viewer.login,
            org: ORG_LOGIN,
            date: todayKey,
          },
        },
        select: {
          source: true,
          commentary: true,
        },
      });

      if (cached) {
        const parsed = aiCommentarySchema.safeParse(cached.commentary);
        if (parsed.success) {
          const payload: ApiResponse = { source: cached.source === "ai" ? "ai" : "fallback", commentary: parsed.data };
          return NextResponse.json(payload);
        }
      }
    } catch {
      // If DB is unavailable or migration not applied yet, fall back to live generation.
    }
  }

  const snapshot = await computeYearToDateSnapshot({ token: session.accessToken });
  const metrics = buildInsightMetrics(snapshot);

  try {
    const commentary = await generateAiCommentary(metrics);
    if (process.env.DATABASE_URL) {
      try {
        await prisma.aiCommentaryCache.upsert({
          where: {
            userLogin_org_date: {
              userLogin: viewer.viewer.login,
              org: ORG_LOGIN,
              date: todayKey,
            },
          },
          update: {
            source: "ai",
            commentary,
            metrics,
            error: null,
          },
          create: {
            userLogin: viewer.viewer.login,
            org: ORG_LOGIN,
            date: todayKey,
            source: "ai",
            commentary,
            metrics,
          },
        });
      } catch {
        // ignore cache write errors
      }
    }
    const payload: ApiResponse = { source: "ai", commentary };
    return NextResponse.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const commentary = fallbackCommentary(metrics);

    if (process.env.DATABASE_URL) {
      try {
        await prisma.aiCommentaryCache.upsert({
          where: {
            userLogin_org_date: {
              userLogin: viewer.viewer.login,
              org: ORG_LOGIN,
              date: todayKey,
            },
          },
          update: {
            source: "fallback",
            commentary,
            metrics,
            error: message,
          },
          create: {
            userLogin: viewer.viewer.login,
            org: ORG_LOGIN,
            date: todayKey,
            source: "fallback",
            commentary,
            metrics,
            error: message,
          },
        });
      } catch {
        // ignore cache write errors
      }
    }

    const payload: ApiResponse = {
      source: "fallback",
      commentary,
      error: message,
    };
    return NextResponse.json(payload);
  }
}
