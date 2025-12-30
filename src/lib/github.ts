export type GitHubGraphqlErrorItem = {
  message: string;
  path?: Array<string | number>;
  extensions?: Record<string, unknown>;
};

export class GitHubApiError extends Error {
  readonly status?: number;
  readonly errors?: GitHubGraphqlErrorItem[];

  constructor(message: string, opts?: { status?: number; errors?: GitHubGraphqlErrorItem[] }) {
    super(message);
    this.name = "GitHubApiError";
    this.status = opts?.status;
    this.errors = opts?.errors;
  }
}

export async function githubGraphql<TData>(args: {
  token: string;
  query: string;
  variables?: Record<string, unknown>;
}): Promise<TData> {
  let res: Response;
  try {
    res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      cache: "no-store",
      headers: {
        Authorization: `bearer ${args.token}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.github+json",
      },
      body: JSON.stringify({ query: args.query, variables: args.variables ?? {} }),
    });
  } catch (err) {
    throw new Error("GitHub GraphQL request failed (https://api.github.com/graphql).", {
      cause: err as unknown,
    });
  }

  const text = await res.text();
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new GitHubApiError(`GitHub GraphQL returned invalid JSON (HTTP ${res.status}).`, {
      status: res.status,
    });
  }

  const body = payload as {
    data?: TData;
    errors?: GitHubGraphqlErrorItem[];
    message?: string;
  };

  if (!res.ok) {
    throw new GitHubApiError(body.message ?? `GitHub GraphQL HTTP ${res.status}.`, {
      status: res.status,
      errors: body.errors,
    });
  }

  if (body.errors?.length) {
    throw new GitHubApiError(body.errors[0]?.message ?? "GitHub GraphQL error.", {
      status: res.status,
      errors: body.errors,
    });
  }

  if (!body.data) {
    throw new GitHubApiError("GitHub GraphQL response missing data.", { status: res.status });
  }

  return body.data;
}
