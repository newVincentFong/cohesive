import type {
  AddMemoryInput,
  MemoryItem,
  MemoryQuery,
  MemoryScope,
  MemoryStore,
  UpdateMemoryInput,
} from "./memory-store";
import { invoke } from "@/core/platform/tauri";

export class SqliteMemoryStore implements MemoryStore {
  constructor(private readonly domain: AddMemoryInput["domain"]) {}

  async add(input: AddMemoryInput): Promise<MemoryItem> {
    return invoke<MemoryItem>("memory_add", {
      input: { ...input, domain: this.domain },
    });
  }

  async search(query: MemoryQuery): Promise<MemoryItem[]> {
    return invoke<MemoryItem[]>("memory_search", {
      query: { ...query, domain: this.domain },
    });
  }

  async list(scope: MemoryScope): Promise<MemoryItem[]> {
    return invoke<MemoryItem[]>("memory_list", {
      scope: { ...scope, domain: this.domain },
    });
  }

  async update(id: string, patch: UpdateMemoryInput): Promise<MemoryItem> {
    return invoke<MemoryItem>("memory_update", { id, patch });
  }

  async delete(id: string): Promise<void> {
    await invoke("memory_delete", { id });
  }
}

export class NullMemoryStore implements MemoryStore {
  async add(input: AddMemoryInput): Promise<MemoryItem> {
    const now = new Date().toISOString();
    return {
      id: crypto.randomUUID(),
      domain: input.domain,
      layer: input.layer,
      sessionId: input.sessionId,
      content: input.content,
      metadata: input.metadata,
      createdAt: now,
      updatedAt: now,
    };
  }

  async search(): Promise<MemoryItem[]> {
    return [];
  }

  async list(): Promise<MemoryItem[]> {
    return [];
  }

  async update(id: string, patch: UpdateMemoryInput): Promise<MemoryItem> {
    const now = new Date().toISOString();
    return {
      id,
      domain: "mind",
      layer: patch.layer ?? "session_context",
      content: patch.content ?? "",
      metadata: patch.metadata,
      createdAt: now,
      updatedAt: now,
    };
  }

  async delete(): Promise<void> {}
}

export class VectorMemoryStore implements MemoryStore {
  constructor(private readonly inner: MemoryStore) {}

  add(input: AddMemoryInput): Promise<MemoryItem> {
    return this.inner.add(input);
  }

  search(query: MemoryQuery): Promise<MemoryItem[]> {
    return this.inner.search(query);
  }

  list(scope: MemoryScope): Promise<MemoryItem[]> {
    return this.inner.list(scope);
  }

  update(id: string, patch: UpdateMemoryInput): Promise<MemoryItem> {
    return this.inner.update(id, patch);
  }

  delete(id: string): Promise<void> {
    return this.inner.delete(id);
  }
}

export class HybridMemoryStore implements MemoryStore {
  constructor(
    private readonly sqlite: MemoryStore,
    private readonly vector: MemoryStore,
  ) {}

  async add(input: AddMemoryInput): Promise<MemoryItem> {
    const item = await this.sqlite.add(input);
    await this.vector.add(input);
    return item;
  }

  async search(query: MemoryQuery): Promise<MemoryItem[]> {
    const [sqliteResults, vectorResults] = await Promise.all([
      this.sqlite.search(query),
      this.vector.search(query),
    ]);
    const merged = new Map<string, MemoryItem>();
    for (const item of [...sqliteResults, ...vectorResults]) {
      merged.set(item.id, item);
    }
    return Array.from(merged.values()).slice(0, query.limit ?? 20);
  }

  async list(scope: MemoryScope): Promise<MemoryItem[]> {
    return this.sqlite.list(scope);
  }

  async update(id: string, patch: UpdateMemoryInput): Promise<MemoryItem> {
    const item = await this.sqlite.update(id, patch);
    await this.vector.update(id, patch);
    return item;
  }

  async delete(id: string): Promise<void> {
    await Promise.all([this.sqlite.delete(id), this.vector.delete(id)]);
  }
}
