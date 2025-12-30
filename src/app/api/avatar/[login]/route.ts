import { NextResponse } from "next/server";

export const runtime = "nodejs";

function isValidGithubLogin(login: string): boolean {
  // GitHub username: alphanumeric or hyphen, cannot start/end with hyphen, max 39
  // https://github.com/shinnn/github-username-regex (common rules)
  return /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(login);
}

export async function GET(req: Request, ctx: { params: Promise<{ login: string }> }) {
  const { login } = await ctx.params;

  if (!isValidGithubLogin(login)) {
    return NextResponse.json({ error: "invalid_login" }, { status: 400 });
  }

  const url = new URL(req.url);
  const sizeRaw = url.searchParams.get("size") ?? "160";
  const size = Math.max(16, Math.min(512, Number(sizeRaw)));

  // Use github.com/{login}.png which redirects to avatars.githubusercontent.com.
  // We proxy it so the browser sees it as same-origin, avoiding canvas tainting
  // when exporting the share card via html-to-image.
  const upstream = `https://github.com/${encodeURIComponent(login)}.png?size=${Number.isFinite(size) ? size : 160}`;

  const res = await fetch(upstream, {
    redirect: "follow",
    // Some CDNs behave better with a real UA.
    headers: {
      "user-agent": "OrgContrib/1.0 (+https://org.phlin.cn)",
      accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    },
    // Let Next handle caching via headers below.
    cache: "no-store",
  });

  if (!res.ok) {
    return NextResponse.json({ error: "avatar_fetch_failed", status: res.status }, { status: 502 });
  }

  const contentType = res.headers.get("content-type") ?? "image/png";
  const arrayBuffer = await res.arrayBuffer();

  return new NextResponse(arrayBuffer, {
    status: 200,
    headers: {
      "content-type": contentType,
      // Cache on CDN/browser to reduce upstream calls.
      "cache-control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
