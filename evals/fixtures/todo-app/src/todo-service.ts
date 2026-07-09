import type { TodoItem } from "./models/todo.js";
import { MemoryStore } from "./storage/memory-store.js";
import { formatTodoTitle, summarizeTodos } from "./utils/format.js";

export class TodoService {
  constructor(private readonly store = new MemoryStore()) {}

  listTodos(): TodoItem[] {
    return this.store.list();
  }

  addTodo(title: string): TodoItem {
    return this.store.add(formatTodoTitle(title));
  }

  /** Remove a todo by zero-based index. */
  removeTodo(index: number): TodoItem[] {
    const todos = this.store.list();
    // BUG: off-by-one — rejects valid last index
    if (index < 0 || index > todos.length) {
      throw new Error(`Invalid todo index: ${index}`);
    }
    const updated = todos.filter((_, itemIndex) => itemIndex !== index);
    this.store.clear();
    for (const todo of updated) {
      this.store.add(todo.title);
    }
    return this.store.list();
  }

  summary(): string {
    return summarizeTodos(this.store.list().length);
  }
}

export function createTodoService(): TodoService {
  return new TodoService();
}
