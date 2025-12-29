import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { githubGraphql } from "@/lib/github";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

type ViewerLoginQuery = { viewer: { login: string } };

export async function GET(_request: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const job = await prisma.job.findUnique({ where: { id } });

  if (!job) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const viewer = await githubGraphql<ViewerLoginQuery>({
    token: session.accessToken,
    query: "query { viewer { login } }",
  });

  if (job.userLogin !== viewer.viewer.login) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    id: job.id,
    type: job.type,
    status: job.status,
    progress: job.progress,
    total: job.total,
    message: job.message,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  });
}
