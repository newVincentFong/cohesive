export function joinPath(...segments: string[]): string {
  return segments.filter(Boolean).join("/");
}
