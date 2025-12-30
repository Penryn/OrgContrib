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
  const message = err instanceof Error ? err.message : String(err);
  return message.toLowerCase().includes("fetch failed");
}
