import type { NextRequest } from "next/server";

import { handlers } from "@/auth";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ nextauth: string[] }> };

export async function GET(request: NextRequest, context: RouteContext) {
  void context;
  return handlers.GET(request);
}

export async function POST(request: NextRequest, context: RouteContext) {
  void context;
  return handlers.POST(request);
}
