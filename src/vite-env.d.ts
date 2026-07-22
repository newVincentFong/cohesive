/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_COHESIVE_DEMO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
