export function formatTodoTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ");
}

export function summarizeTodos(count: number): string {
  if (count === 0) return "No todos";
  if (count === 1) return "1 todo";
  return `${count} todos`;
}
