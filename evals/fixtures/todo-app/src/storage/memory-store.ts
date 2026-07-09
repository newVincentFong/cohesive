import type { TodoItem } from "../models/todo.js";

export class MemoryStore {
  private items: TodoItem[] = [];

  list(): TodoItem[] {
    return [...this.items];
  }

  add(title: string): TodoItem {
    const item: TodoItem = {
      id: String(this.items.length + 1),
      title,
      completed: false,
    };
    this.items.push(item);
    return item;
  }

  clear(): void {
    this.items = [];
  }
}
