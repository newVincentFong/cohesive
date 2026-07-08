export const BUDGET = {
  readFileMaxChars: 12_000,
  grepMaxResults: 100,
  globMaxResults: 200,
  shellOutputMaxChars: 8_000,
  displaySummaryMaxLen: 400,
  traceSummaryMaxLen: 500,
} as const;

export function truncateFileContent(
  content: string,
  maxChars: number = BUDGET.readFileMaxChars,
): string {
  if (content.length <= maxChars) {
    return content;
  }
  const headSize = Math.floor(maxChars * 0.6);
  const tailSize = maxChars - headSize - 80;
  const head = content.slice(0, headSize);
  const tail = content.slice(content.length - tailSize);
  return `${head}\n\n... [truncated ${content.length - maxChars} chars] ...\n\n${tail}`;
}

export function summarizeForDisplay(
  content: string,
  maxLen: number = BUDGET.displaySummaryMaxLen,
): string {
  const oneLine = content.replace(/\s+/g, " ").trim();
  if (oneLine.length <= maxLen) {
    return oneLine;
  }
  return `${oneLine.slice(0, maxLen)}…`;
}

export function countLines(content: string): number {
  if (!content) return 0;
  return content.split("\n").length;
}

export function addLineNumbers(content: string, startLine = 1): string {
  const lines = content.split("\n");
  return lines
    .map((line, index) => {
      const lineNumber = startLine + index;
      return `${String(lineNumber).padStart(6, " ")}|${line}`;
    })
    .join("\n");
}

export function truncateLines<T>(items: T[], maxItems: number): { items: T[]; truncated: number } {
  if (items.length <= maxItems) {
    return { items, truncated: 0 };
  }
  return { items: items.slice(0, maxItems), truncated: items.length - maxItems };
}

export function truncateText(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, maxChars)}\n... [truncated ${value.length - maxChars} chars] ...`;
}
