import { joinPath } from "./path";

export const DATA_LAYOUT = {
  databaseFile: "cohesive.db",
  writingDocumentsDir: "writing/documents",
  writingAssetsDir: "writing/assets",
  codeWorkspacesDir: "code/workspaces",
  mindExportsDir: "mind/exports",
} as const;

export function writingDocumentPath(documentId: string): string {
  return joinPath(DATA_LAYOUT.writingDocumentsDir, `${documentId}.md`);
}

export function writingAssetPath(assetId: string): string {
  return joinPath(DATA_LAYOUT.writingAssetsDir, assetId);
}

export function codeWorkspacePath(projectId: string): string {
  return joinPath(DATA_LAYOUT.codeWorkspacesDir, `${projectId}.json`);
}
