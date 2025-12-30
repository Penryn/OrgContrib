export function formatError(err: unknown, maxDepth = 3): string {
  if (maxDepth <= 0) return "(error depth exceeded)";

  if (err instanceof Error) {
    const name = err.name || "Error";
    const message = err.message || "";
    const cause = (err as { cause?: unknown }).cause;

    if (cause) {
      return `${name}: ${message} (cause: ${formatError(cause, maxDepth - 1)})`;
    }

    return `${name}: ${message}`;
  }

  if (typeof err === "string") return err;

  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

export function includesFetchFailedMessage(err: unknown): boolean {
  const matches = (value: string): boolean => {
    const m = value.toLowerCase();
    if (m.includes("fetch failed")) return true;
    if (m.includes("connect time")) return true;
    if (m.includes("timed out")) return true;
    if (m.includes("timeout")) return true;
    if (m.includes("econnrefused")) return true;
    if (m.includes("enotfound")) return true;
    if (m.includes("eai_again")) return true;
    return false;
  };

  const visit = (value: unknown, depth: number): boolean => {
    if (depth <= 0) return false;
    if (value instanceof Error) {
      if (matches(value.message ?? "")) return true;
      const cause = (value as { cause?: unknown }).cause;
      return cause ? visit(cause, depth - 1) : false;
    }
    if (typeof value === "string") return matches(value);
    return false;
  };

  return visit(err, 6);
}
