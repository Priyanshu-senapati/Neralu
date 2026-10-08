/**
 * Personal heat threshold, mirroring backend/app/risk.py personal_threshold_c: 40 °C minus the
 * vulnerability score in tens (rounded half up), one degree lower when the night stays at 26 °C+.
 * Used for "what if" views on the story page; the console uses the server's threshold_c.
 */
export const personalThreshold = (score: number, warmNight = false) =>
  40 - Math.floor(score / 10 + 0.5) - (warmNight ? 1 : 0)

/** The story page's example afternoon: 35 °C at 35 % humidity (heat index 35.8 °C), night 25 °C. */
export const EXAMPLE_HEAT = 35.8
