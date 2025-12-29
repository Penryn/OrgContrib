const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

export function getShanghaiYear(now: Date): number {
  const local = new Date(now.getTime() + SHANGHAI_OFFSET_MS);
  return local.getUTCFullYear();
}

export function getShanghaiYearStartUtc(now: Date): Date {
  const year = getShanghaiYear(now);
  const utcYearStartMs = Date.UTC(year, 0, 1, 0, 0, 0);
  return new Date(utcYearStartMs - SHANGHAI_OFFSET_MS);
}

export function getWeekStartShanghaiKey(isoDateTime: string): string {
  const date = new Date(isoDateTime);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ISO datetime: ${isoDateTime}`);
  }

  const local = new Date(date.getTime() + SHANGHAI_OFFSET_MS);
  const localDay = local.getUTCDay(); // 0=Sun..6=Sat (but in "shifted" local time)
  const diffToMonday = (localDay + 6) % 7; // Monday -> 0

  const localMidnightUtcMs = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
    0,
    0,
    0,
  );

  const mondayLocalMidnightUtcMs = localMidnightUtcMs - diffToMonday * 24 * 60 * 60 * 1000;
  return new Date(mondayLocalMidnightUtcMs).toISOString().slice(0, 10);
}

export function listShanghaiWeekStartKeys(fromUtc: Date, toUtc: Date): string[] {
  const fromKey = getWeekStartShanghaiKey(fromUtc.toISOString());
  const toKey = getWeekStartShanghaiKey(toUtc.toISOString());

  const keys: string[] = [];
  let cursor = new Date(`${fromKey}T00:00:00.000Z`);
  const end = new Date(`${toKey}T00:00:00.000Z`);

  while (cursor.getTime() <= end.getTime()) {
    keys.push(cursor.toISOString().slice(0, 10));
    cursor = new Date(cursor.getTime() + 7 * 24 * 60 * 60 * 1000);
  }

  return keys;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatShanghaiDate(isoDateTime: string): string {
  const date = new Date(isoDateTime);
  if (Number.isNaN(date.getTime())) return isoDateTime;

  const local = new Date(date.getTime() + SHANGHAI_OFFSET_MS);
  const yyyy = local.getUTCFullYear();
  const mm = pad2(local.getUTCMonth() + 1);
  const dd = pad2(local.getUTCDate());
  return `${yyyy}-${mm}-${dd}`;
}
