import { includesFetchFailedMessage } from "./errors";

export type RestRepo = {
  name: string;
  full_name: string;
  owner: { login: string };
  archived: boolean;
  disabled: boolean;
};

async function githubRestJson<T>(args: { token: string; url: string }): Promise<T> {
  let res: Response | undefined;
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      res = await fetch(args.url, {
        headers: {
          Authorization: `bearer ${args.token}`,
          Accept: "application/vnd.github+json",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(15000), // 15s timeout
      });
      break;
    } catch (err) {
      lastError = err;
      const isNetworkError = includesFetchFailedMessage(err);
      if (attempt < 3 && isNetworkError) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
        continue;
      }
      throw new Error(`GitHub REST request failed (${args.url}).`, {
        cause: err as unknown,
      });
    }
  }

  if (!res) {
    throw new Error(`GitHub REST request failed (${args.url}).`, { cause: lastError });
  }

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GitHub REST HTTP ${res.status}: ${text.slice(0, 500)}`);
  }

  return JSON.parse(text) as T;
}

export async function listAccessibleOrgRepoFullNames(args: { token: string; org: string }): Promise<string[]> {
  const repos: string[] = [];

  for (let page = 1; page <= 1000; page += 1) {
    const url = new URL("https://api.github.com/user/repos");
    url.searchParams.set("visibility", "all");
    url.searchParams.set("affiliation", "collaborator,organization_member,owner");
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(page));

    const batch = await githubRestJson<RestRepo[]>({ token: args.token, url: url.toString() });

    for (const repo of batch) {
      if (repo.owner.login !== args.org) continue;
      if (repo.disabled) continue;
      repos.push(repo.full_name);
    }

    if (batch.length < 100) break;
  }

  return Array.from(new Set(repos)).sort((a, b) => a.localeCompare(b));
}

