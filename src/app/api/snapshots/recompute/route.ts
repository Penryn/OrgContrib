import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { computeYearToDateSnapshot } from "@/lib/snapshot";

export const runtime = "nodejs";

export async function POST() {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const snapshot = await computeYearToDateSnapshot({ token: session.accessToken });
  return NextResponse.json({ jobId: null, snapshot });
}
