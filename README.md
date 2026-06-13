# Cohesive

Local-first desktop workspace for Code, Writing, and Mind.

## Stack

- Tauri 2
- React + TypeScript + Vite
- SQLite metadata + Markdown file storage
- CodeMirror 6 for Writing

## Development

```bash
npm install
npm run tauri dev
```

## Architecture

- `src/core/` — cross-domain types and services
- `src/components/` — domain UI surfaces
- `src-tauri/` — SQLite, file storage, shell runner, DeepSeek provider
