export function formatRelativeTime(date: string | Date): string {
  const value = typeof date === "string" ? new Date(date) : date;
  const diffMs = Date.now() - value.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) {
    return "just now";
  }

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return `${diffMin}m ago`;
  }

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) {
    return `${diffHr}h ago`;
  }

  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) {
    return `${diffDay}d ago`;
  }

  return value.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatFullDateTime(date: string | Date): string {
  const value = typeof date === "string" ? new Date(date) : date;
  return value.toLocaleString();
}
