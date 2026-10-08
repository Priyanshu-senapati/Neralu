/**
 * Personal heat threshold, mirroring backend/app/risk.py personal_threshold_c: 40 °C minus the
 * vulnerability score in tens (rounded half up), one degree lower when the night stays at 26 °C+.
 * Used for "what if" views on the story page; the console uses the server's threshold_c.
 */
export const personalThreshold = (score: number, warmNight = false) =>
  40 - Math.floor(score / 10 + 0.5) - (warmNight ? 1 : 0)

/** The story page's example afternoon: 35 °C at 35 % humidity (heat index 35.8 °C), night 25 °C. */
export const EXAMPLE_HEAT = 35.8

export interface RiskInput {
  age: number | null
  lives_alone: boolean | null
  roof_type: string
  heat_sensitive_meds: boolean | null
  has_fan: boolean | null
  cognitive_flag: boolean | null
  hearing_difficulty: boolean | null
}

/**
 * Preview of backend/app/risk.py vulnerability_score, for the registration form's live panel.
 * Unanswered questions add nothing. The server computes the real score on submit.
 */
export function previewRisk(f: RiskInput): { score: number; factors: [string, number][] } {
  const factors: [string, number][] = []
  if (f.age !== null) {
    if (f.age >= 80) factors.push([`Age ${f.age}`, 30])
    else if (f.age >= 70) factors.push([`Age ${f.age}`, 20])
    else if (f.age >= 60) factors.push([`Age ${f.age}`, 10])
  }
  if (f.lives_alone) factors.push(['Lives alone', 20])
  if (f.roof_type === 'sheet') factors.push(['Sheet roof', 15])
  else if (f.roof_type === 'top_floor') factors.push(['Top floor', 8])
  if (f.heat_sensitive_meds) factors.push(['Heat-sensitive medicines', 15])
  if (f.has_fan === false) factors.push(['No fan', 10])
  if (f.cognitive_flag) factors.push(['Memory difficulty', 10])
  if (f.hearing_difficulty) factors.push(['Hearing difficulty', 5])
  return { score: Math.min(100, factors.reduce((s, [, p]) => s + p, 0)), factors }
}
