// Appearance preference: follow the system, or force light/dark. A device
// preference, so it lives in localStorage (guarded) and is applied to <html>.
export type ThemeChoice = 'system' | 'light' | 'dark'

const KEY = 'kantolab.theme'

export function getTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement
  if (choice === 'system') delete root.dataset.theme
  else root.dataset.theme = choice
}

export function setTheme(choice: ThemeChoice): void {
  try {
    localStorage.setItem(KEY, choice)
  } catch {
    // Blocked storage: applies to this visit only.
  }
  applyTheme(choice)
}
