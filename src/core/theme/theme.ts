export type ThemeMode = "light" | "dark";

const STORAGE_KEY = "cohesive.theme";

export function getStoredTheme(): ThemeMode | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === "light" || value === "dark") {
      return value;
    }
  } catch {
    // ignore
  }
  return null;
}

export function getDefaultTheme(): ThemeMode {
  return getStoredTheme() ?? "light";
}

export function applyTheme(theme: ThemeMode): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function persistTheme(theme: ThemeMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // ignore
  }
}

export function initTheme(): ThemeMode {
  const theme = getDefaultTheme();
  applyTheme(theme);
  return theme;
}
