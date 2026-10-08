import { useSyncExternalStore } from 'react'

/*
 * Theme: OLED dark by default; light on request (a weak projector washes out dark screens).
 * The choice is remembered per browser. Canvas-drawn things (map dots, 3D, shader) read colours
 * through token() and re-render when the theme changes via useTheme().
 */
export type Theme = 'dark' | 'light'
const KEY = 'neralu-theme'
const listeners = new Set<() => void>()

export function getTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}

export function setTheme(t: Theme) {
  if (t === 'light') document.documentElement.dataset.theme = 'light'
  else delete document.documentElement.dataset.theme
  try {
    localStorage.setItem(KEY, t)
  } catch {
    /* private mode: the choice just isn't remembered */
  }
  listeners.forEach((l) => l())
}

/** Apply the remembered theme before first paint (called from main.tsx). */
export function initTheme() {
  try {
    if (localStorage.getItem(KEY) === 'light') document.documentElement.dataset.theme = 'light'
  } catch {
    /* ignore */
  }
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    getTheme,
    () => 'dark',
  )
}

/** The current value of a CSS colour token, e.g. token('--ok'). */
export function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}
