import { useSyncExternalStore } from 'react'
import { H_END, H_START } from './orbitPhysics'
import { reducedMotion } from '../../motion'

/*
 * One heat value drives the story page: the sun, the households, the counter and the haze all
 * read the same heat index H. It is a plain mutable value with subscribers, so canvases read it
 * every frame without React; components that show something derived (a count) re-render only
 * when that derived value changes.
 */

type Listener = () => void

const state = {
  /** Heat index of the example afternoon, °C. Scrolling the hero moves it 31 → 38. */
  H: reducedMotion() ? H_END : H_START,
  /** True once the reader has scrolled past the hero: the haze settles to a slow drift. */
  settled: false,
}
const listeners = new Set<Listener>()

export const heat = {
  get H() {
    return state.H
  },
  get settled() {
    return state.settled
  },
  set(H: number) {
    if (H === state.H) return
    state.H = H
    listeners.forEach((l) => l())
  },
  settle(settled: boolean) {
    state.settled = settled
  },
  subscribe(l: Listener) {
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  },
}

/** The shared heat value. Read heat.H in a frame loop; subscribe for changes. */
export const useScrollHeat = () => heat

/** A value derived from H (a count, a rounded label): re-renders only when it changes. */
export function useHeatValue<T extends string | number | boolean>(derive: (H: number) => T): T {
  return useSyncExternalStore(heat.subscribe, () => derive(state.H), () => derive(state.H))
}
