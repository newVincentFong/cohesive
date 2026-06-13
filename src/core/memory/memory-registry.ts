import type { Domain } from "../session/session.types";
import {
  HybridMemoryStore,
  NullMemoryStore,
  SqliteMemoryStore,
  VectorMemoryStore,
} from "./memory-store.impl";
import type { MemoryStore } from "./memory-store";

export type MemoryStoreKind = "sqlite" | "null" | "vector" | "hybrid";

export function createMemoryStore(
  domain: Domain,
  kind: MemoryStoreKind = "sqlite",
): MemoryStore {
  switch (kind) {
    case "null":
      return new NullMemoryStore();
    case "vector":
      return new VectorMemoryStore(new SqliteMemoryStore(domain));
    case "hybrid":
      return new HybridMemoryStore(
        new SqliteMemoryStore(domain),
        new VectorMemoryStore(new NullMemoryStore()),
      );
    case "sqlite":
    default:
      return new SqliteMemoryStore(domain);
  }
}

const domainStores = new Map<Domain, MemoryStore>();

export function getDomainMemoryStore(
  domain: Domain,
  kind: MemoryStoreKind = "sqlite",
): MemoryStore {
  const existing = domainStores.get(domain);
  if (existing) return existing;

  const store = createMemoryStore(domain, kind);
  domainStores.set(domain, store);
  return store;
}

export function resetDomainMemoryStores(): void {
  domainStores.clear();
}
