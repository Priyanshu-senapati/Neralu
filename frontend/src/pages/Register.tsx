import { Check, Pencil, Volume2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { lazy, Suspense, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../api'
import { Wordmark } from '../components/Brand'
import { AnimatedNumber, DrawnCheck } from '../components/Motion'
import { Reveal, RevealLines } from '../components/Reveal'
import { FlowButton } from '@/components/ui/flow-button'
import { EXAMPLE_HEAT, personalThreshold, previewRisk } from '../heat'
import { reducedMotion } from '../motion'
import { useTheme } from '../theme'
import type { ElderDetail } from '../types'

const ShaderAnimation = lazy(() => import('@/components/ui/shader-animation').then((m) => ({ default: m.ShaderAnimation })))
const HEAT_RINGS: [string, string, string] = ['#e8743b', '#f2b84b', '#5fa38a']
const RING_CENTER: [number, number] = [-0.4, -0.35]

const CODE_WORDS = ['mallige', 'sampige', 'sevanthige', 'tulasi', 'maavu', 'bevu', 'kaveri', 'chandra', 'nakshatra', 'gulabi']
const LANGUAGES: [string, string][] = [['kn', 'Kannada'], ['hi', 'Hindi'], ['en', 'English'], ['ta', 'Tamil'], ['te', 'Telugu'], ['ur', 'Urdu']]
const ROOFS: [string, string][] = [['sheet', 'Sheet'], ['tile', 'Tile'], ['concrete', 'Concrete'], ['top_floor', 'Top floor']]

const cap = (w: string) => w[0].toUpperCase() + w.slice(1)

interface Form {
  name: string; age: string; phone: string; language: string; lives_alone: boolean | null
  roof_type: string; has_fan: boolean | null; heat_sensitive_meds: boolean | null
  hearing_difficulty: boolean | null; cognitive_flag: boolean | null; neighbour_phone: string
  family_name: string; family_phone: string; code_word: string; address: string; consent: boolean
}

const EMPTY: Form = {
  name: '', age: '', phone: '', language: 'kn', lives_alone: null, roof_type: '', has_fan: null,
  heat_sensitive_meds: null, hearing_difficulty: null, cognitive_flag: null, neighbour_phone: '',
  family_name: '', family_phone: '', code_word: '', address: '', consent: false,
}

const STEPS = [
  { key: 'who', title: 'Who should Neralu check on?', short: 'The person' },
  { key: 'home', title: 'Their home and health', short: 'Home and health' },
  { key: 'you', title: 'You, the family contact', short: 'Family contact' },
  { key: 'code', title: 'Choose a family code word', short: 'Code word' },
  { key: 'review', title: 'Check and give consent', short: 'Review and consent' },
] as const

const LANG_NAME: Record<string, string> = Object.fromEntries(LANGUAGES)
const ROOF_NAME: Record<string, string> = Object.fromEntries(ROOFS)

function stepMissing(f: Form, step: number): string[] {
  const m: (string | false)[] =
    step === 0 ? [!f.name.trim() && 'name', !f.age && 'age', !f.phone.trim() && 'their phone number', !f.address.trim() && 'home address']
      : step === 1 ? [f.lives_alone === null && 'lives alone', !f.roof_type && 'roof', f.has_fan === null && 'fan or cooler',
        f.heat_sensitive_meds === null && 'medicines', f.hearing_difficulty === null && 'hearing', f.cognitive_flag === null && 'memory']
        : step === 2 ? [!f.family_name.trim() && 'your name', !f.family_phone.trim() && 'your phone']
          : step === 3 ? [!f.code_word && 'a code word']
            : [!f.consent && 'consent']
  return m.filter(Boolean) as string[]
}

const regNo = (id: number) => `NRL-W47-${String(id).padStart(5, '0')}`
const EASE = [0.23, 1, 0.32, 1] as const

export default function Register() {
  const [f, setF] = useState<Form>(EMPTY)
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<ElderDetail | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }))
  const missing = stepMissing(f, step)
  const first = f.name.trim().split(' ')[0] || 'them'
  const [furthest, setFurthest] = useState(0)

  const go = (n: number) => {
    setDir(n > step ? 1 : -1)
    setStep(n)
    setFurthest((m) => Math.max(m, n))
    setError(null)
    requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }))
  }

  const play = (w: string) => {
    audio.current?.pause()
    audio.current = new Audio(`/audio/${f.language}/code_${w}.mp3`)
    audio.current.play().catch(() => {})
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (missing.length) return
    if (step < STEPS.length - 1) {
      go(step + 1)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const body = { ...f, age: Number(f.age), neighbour_phone: f.neighbour_phone.trim() || null }
      setDone(await api.register(body))
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        const detail = (err.body as { detail?: { msg?: string; loc?: string[] }[] | string })?.detail
        const d0 = Array.isArray(detail) ? detail[0] : null
        setError(d0 ? `${d0.loc?.at(-1)?.replace('_', ' ')}: ${d0.msg?.replace('Value error, ', '')}` : String(detail))
      } else {
        setError('Could not register. Check your connection and try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  const risk = previewRisk({
    age: f.age ? Number(f.age) : null,
    lives_alone: f.lives_alone,
    roof_type: f.roof_type,
    heat_sensitive_meds: f.heat_sensitive_meds,
    has_fan: f.has_fan,
    cognitive_flag: f.cognitive_flag,
    hearing_difficulty: f.hearing_difficulty,
  })

  if (done) return <Confirmation done={done} onAnother={() => { setF(EMPTY); setDone(null); setStep(0); setFurthest(0) }} />

  const still = reducedMotion()
  const slide = {
    initial: (d: number) => (still ? { opacity: 1 } : { opacity: 0, x: 28 * d }),
    animate: { opacity: 1, x: 0, transition: { duration: 0.42, ease: EASE } },
    exit: (d: number) => (still ? { opacity: 1 } : { opacity: 0, x: -20 * d, transition: { duration: 0.2, ease: 'easeIn' as const } }),
  }

  return (
    <Shell
      side={
        <SidePanel
          step={step}
          furthest={furthest}
          onStep={(n) => n <= furthest && go(n)}
          name={f.name.trim()}
          score={risk.score}
          factors={risk.factors}
          answered={f.age !== '' || f.lives_alone !== null || f.roof_type !== ''}
        />
      }
    >
      <MobileProgress step={step} score={risk.score} answered={f.age !== ''} />
      <form onSubmit={submit} className="flex flex-1 flex-col">
        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.div key={step} custom={dir} variants={slide} initial="initial" animate="animate" exit="exit" className="flex-1">
            <p className="text-sm text-muted">
              Step <span className="num">{step + 1}</span> of <span className="num">{STEPS.length}</span>
            </p>
            <h1 ref={heading} tabIndex={-1} className="display mt-2 text-[2.1rem] font-medium leading-[1.08] outline-none sm:text-[2.5rem]">
              {STEPS[step].title}
            </h1>

            <div className="mt-6 space-y-6">
              {step === 0 && (
                <>
                  <Lead>An older person who may struggle in a heatwave, often someone who lives alone.</Lead>
                  <Text label="Their name" value={f.name} onChange={(v) => set('name', v)} autoComplete="off" />
                  <Text label="Age" value={f.age} onChange={(v) => set('age', v.replace(/\D/g, '').slice(0, 3))} inputMode="numeric" />
                  <Text label="Their phone number" value={f.phone} onChange={(v) => set('phone', v)} inputMode="tel" hint="Any phone works, including a basic keypad phone" />
                  <Choice label="Language for calls" value={f.language} options={LANGUAGES} onChange={(v) => set('language', v)} />
                  <Text label="Home address" value={f.address} onChange={(v) => set('address', v)} hint="Kept private: shown only to the volunteer who accepts a case" />
                </>
              )}
              {step === 1 && (
                <>
                  <Lead>These set {first}'s personal heat threshold, so Neralu calls before a city-wide alert would.</Lead>
                  <div className="divide-y divide-line rounded-[8px] border border-line bg-surface">
                    <YesNo label="Lives alone" value={f.lives_alone} onChange={(v) => set('lives_alone', v)} />
                    <div className="px-4 py-3.5">
                      <Choice label="Roof" value={f.roof_type} options={ROOFS} onChange={(v) => set('roof_type', v)} />
                    </div>
                    <YesNo label="Has a working fan or cooler" value={f.has_fan} onChange={(v) => set('has_fan', v)} />
                    <YesNo label="Takes medicines that make heat riskier" value={f.heat_sensitive_meds} onChange={(v) => set('heat_sensitive_meds', v)} hint="For example water pills or blood pressure medicines" />
                    <YesNo label="Difficulty hearing" value={f.hearing_difficulty} onChange={(v) => set('hearing_difficulty', v)} />
                    <YesNo label="Memory difficulty" value={f.cognitive_flag} onChange={(v) => set('cognitive_flag', v)} hint="If yes, a caregiver is the main contact" />
                  </div>
                  <Text label="A neighbour's phone (optional)" value={f.neighbour_phone} onChange={(v) => set('neighbour_phone', v)} inputMode="tel" hint="If a check is needed, a neighbour is asked first: usually the fastest help" />
                </>
              )}
              {step === 2 && (
                <>
                  <Lead>You are told when {first} needs a follow-up and when someone has checked in person.</Lead>
                  <Text label="Your name and relation" value={f.family_name} onChange={(v) => set('family_name', v)} hint="For example: Suresh (son)" />
                  <Text label="Your phone" value={f.family_phone} onChange={(v) => set('family_phone', v)} inputMode="tel" />
                </>
              )}
              {step === 3 && (
                <>
                  <Lead>
                    Every Neralu call starts with this word, so {first} knows it is genuine and not a scam. Pick one {first} will
                    remember, and play it to hear how it sounds on the call.
                  </Lead>
                  <div role="radiogroup" aria-label="Code word" className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                    {CODE_WORDS.map((w, i) => {
                      const on = f.code_word === w
                      return (
                        <motion.div
                          key={w}
                          initial={still ? false : { opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0, transition: { delay: i * 0.035, duration: 0.35, ease: EASE } }}
                          className={`group relative flex items-center overflow-hidden rounded-[8px] border transition-colors duration-200 ${on ? 'border-brand bg-brand-tint' : 'border-line bg-surface hover:border-line-strong'}`}
                        >
                          <button type="button" role="radio" aria-checked={on} onClick={() => set('code_word', w)} className="press flex min-h-14 flex-1 items-center gap-2 px-3.5 text-left text-base font-semibold">
                            <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-colors ${on ? 'border-brand bg-brand text-brand-ink' : 'border-line-strong'}`}>
                              {on && <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />}
                            </span>
                            <span className={on ? 'oled text-brand' : ''}>{cap(w)}</span>
                          </button>
                          <button type="button" onClick={() => play(w)} className="grid min-h-14 w-12 place-items-center border-l border-line text-muted transition-colors hover:text-ink" aria-label={`Play ${w}`}>
                            <Volume2 className="h-4.5 w-4.5" aria-hidden="true" />
                          </button>
                        </motion.div>
                      )
                    })}
                  </div>
                </>
              )}
              {step === 4 && (
                <>
                  <dl className="divide-y divide-line overflow-hidden rounded-[8px] border border-line bg-surface text-sm">
                    <Row label="Name" value={`${f.name}, ${f.age}`} edit={() => go(0)} />
                    <Row label="Phone" value={f.phone} edit={() => go(0)} />
                    <Row label="Language" value={LANG_NAME[f.language]} edit={() => go(0)} />
                    <Row label="Address" value={f.address} edit={() => go(0)} />
                    <Row label="Home" value={[f.lives_alone ? 'Lives alone' : 'Lives with others', `${ROOF_NAME[f.roof_type]} roof`, f.has_fan ? 'has a fan' : 'no working fan'].join(' · ')} edit={() => go(1)} />
                    <Row label="Health" value={[f.heat_sensitive_meds && 'heat-sensitive medicines', f.hearing_difficulty && 'hearing difficulty', f.cognitive_flag && 'memory difficulty'].filter(Boolean).join(' · ') || 'Nothing noted'} edit={() => go(1)} />
                    <Row label="Neighbour" value={f.neighbour_phone || 'None on file'} edit={() => go(1)} />
                    <Row label="Family contact" value={`${f.family_name} · ${f.family_phone}`} edit={() => go(2)} />
                    <Row label="Code word" value={cap(f.code_word)} edit={() => go(3)} />
                  </dl>
                  <label className={`flex gap-3 rounded-[8px] border px-4 py-3.5 text-sm transition-colors ${f.consent ? 'border-brand bg-brand-tint' : 'border-line bg-surface'}`}>
                    <input type="checkbox" checked={f.consent} onChange={(e) => set('consent', e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--brand)]" />
                    <span>
                      I have {first}'s permission. Neralu stores only what is needed to check on them, shows the address only to
                      the volunteer who accepts a case, and never shares it.
                    </span>
                  </label>
                </>
              )}
            </div>
          </motion.div>
        </AnimatePresence>

        <div className="mt-8 border-t border-line pt-5">
          {error && <p role="alert" className="mb-3 rounded-[6px] bg-alert-bg px-3 py-2 text-sm text-alert">{error}</p>}
          <AnimatePresence initial={false}>
            {missing.length > 0 && (
              <motion.p
                key="missing"
                initial={still ? false : { opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-3 overflow-hidden text-xs text-muted"
              >
                Still needed: {missing.join(', ')}
              </motion.p>
            )}
          </AnimatePresence>
          <div className="flex items-center gap-3">
            {step > 0 && (
              <button type="button" onClick={() => go(step - 1)} className="press min-h-12 rounded-full border border-line-strong px-5 text-sm font-semibold text-muted hover:text-ink">
                Back
              </button>
            )}
            <FlowButton type="submit" disabled={busy || missing.length > 0} className="ml-auto">
              {step < STEPS.length - 1 ? `Continue to ${STEPS[step + 1].short.toLowerCase()}` : busy ? 'Registering…' : `Register ${first}`}
            </FlowButton>
          </div>
        </div>
      </form>
    </Shell>
  )
}

/* ---------- Layout ---------- */

function Shell({ side, children }: { side: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-paper text-ink lg:grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      {side}
      <main className="flex min-h-dvh flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-10 lg:px-16 lg:py-14">
        <div className="mb-8 flex items-center justify-between lg:hidden">
          <Link to="/" aria-label="About Neralu">
            <Wordmark size="sm" />
          </Link>
          <span className="text-sm text-muted">Ward 47 · demo</span>
        </div>
        <div className="mx-auto flex w-full max-w-[34rem] flex-1 flex-col">{children}</div>
      </main>
    </div>
  )
}

/** Desktop: brand, steps and the live heat-risk preview, over a faint heat shader. */
function SidePanel({ step, furthest, onStep, name, score, factors, answered }: {
  step: number; furthest: number; onStep: (n: number) => void; name: string; score: number; factors: [string, number][]; answered: boolean
}) {
  const theme = useTheme()
  const threshold = personalThreshold(score)
  const called = threshold <= EXAMPLE_HEAT
  const who = name.split(' ')[0] || 'They'
  return (
    <aside className="relative isolate hidden overflow-y-auto overflow-x-hidden border-r border-line bg-sunken lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:px-12 lg:py-10">
      <Suspense fallback={null}>
        <ShaderAnimation className="absolute inset-0 -z-10 opacity-70" background={theme === 'light' ? '#efede6' : '#070908'} colors={HEAT_RINGS} intensity={0.22} speed={0.35} center={RING_CENTER} />
      </Suspense>
      <Link to="/" aria-label="About Neralu" className="self-start">
        <Wordmark />
      </Link>
      <Reveal className="mt-8">
        <p className="display text-[1.9rem] font-medium leading-[1.1]">
          <RevealLines>
            <span>Register someone</span>
            <span className="oled italic text-brand">for heat checks.</span>
          </RevealLines>
        </p>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">Two minutes, five steps. On hot days Neralu phones them and makes sure someone knows they are safe.</p>
      </Reveal>

      <ol className="mt-7 space-y-0.5" aria-label="Steps">
        {STEPS.map((s, i) => {
          const state = i < step ? 'done' : i === step ? 'now' : i <= furthest ? 'seen' : 'todo'
          const can = i <= furthest && i !== step
          return (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => onStep(i)}
                disabled={!can}
                aria-current={i === step ? 'step' : undefined}
                className="group flex w-full items-center gap-3 rounded-[6px] px-2 py-1.5 text-left text-sm disabled:cursor-default enabled:hover:bg-surface/60"
              >
                <span
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs transition-colors duration-300 ${
                    state === 'done' ? 'border-brand bg-brand text-brand-ink' : state === 'now' ? 'border-brand text-brand' : 'border-line-strong text-muted'
                  }`}
                >
                  {state === 'done' ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" /> : <span className="num">{i + 1}</span>}
                </span>
                <span className={state === 'now' ? 'font-semibold text-ink' : state === 'todo' ? 'text-muted' : 'text-ink/85'}>{s.short}</span>
                {i === step && <motion.span layoutId="step-marker" className="ml-auto h-1.5 w-1.5 rounded-full bg-brand" />}
              </button>
            </li>
          )
        })}
      </ol>

      <div className="mt-auto shrink-0 rounded-[10px] border border-line bg-surface/80 p-5 [margin-top:max(1.5rem,auto)]">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted">Heat-risk preview</span>
          <span className="rounded-[3px] border border-line-strong px-1.5 font-mono text-[0.625rem] uppercase tracking-[0.08em] text-muted">preview</span>
        </div>
        <div className="mt-2 flex items-baseline gap-3">
          <AnimatedNumber value={score} className={`num text-[2.6rem] font-medium leading-none tracking-[-0.03em] ${score >= 60 ? 'oled text-heat' : score >= 35 ? 'text-watch' : ''}`} />
          <span className="text-sm text-muted">of 100</span>
        </div>
        <ul className="mt-3 flex min-h-[1.75rem] flex-wrap gap-1.5" aria-label="Risk factors">
          <AnimatePresence initial={false}>
            {factors.map(([label, pts]) => (
              <motion.li
                key={label.startsWith('Age') ? 'age' : label}
                layout
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{ duration: 0.25, ease: EASE }}
                className="rounded-full border border-line-strong px-2.5 py-0.5 text-xs"
              >
                {label} <span className="num text-muted">+{pts}</span>
              </motion.li>
            ))}
          </AnimatePresence>
          {!answered && <li className="text-xs text-muted">Answers appear here as you fill the form.</li>}
        </ul>
        <div className="mt-4 border-t border-line pt-3 text-sm">
          Personal threshold <span className="num font-semibold">{threshold.toFixed(1)}°C</span>
          <p className={`mt-0.5 ${called ? 'text-heat' : 'text-muted'}`}>
            {called ? `${who} would get a call on a ${EXAMPLE_HEAT}°C afternoon.` : `${who} would not be called yet at ${EXAMPLE_HEAT}°C.`}
          </p>
        </div>
      </div>
    </aside>
  )
}

/** Phone: a compact progress line with the live score. */
function MobileProgress({ step, score, answered }: { step: number; score: number; answered: boolean }) {
  return (
    <div className="mb-6 lg:hidden">
      <div className="flex gap-1" aria-hidden="true">
        {STEPS.map((s, i) => (
          <span key={s.key} className="relative h-1 flex-1 overflow-hidden rounded-full bg-line">
            <motion.span className="absolute inset-0 origin-left rounded-full bg-brand" initial={false} animate={{ scaleX: i <= step ? 1 : 0 }} transition={{ duration: 0.45, ease: EASE }} />
          </span>
        ))}
      </div>
      {answered && (
        <p className="mt-2 text-xs text-muted">
          Heat-risk preview <span className={`num font-semibold ${score >= 60 ? 'text-heat' : 'text-ink'}`}>{score}</span> · threshold{' '}
          <span className="num">{personalThreshold(score).toFixed(1)}°C</span>
        </p>
      )}
    </div>
  )
}

/* ---------- Confirmation ---------- */

function Confirmation({ done, onAnother }: { done: ElderDetail; onAnother: () => void }) {
  const dn = done.name.split(' ')[0]
  const still = reducedMotion()
  const item = (i: number) => (still ? {} : { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0, transition: { delay: 0.25 + i * 0.12, duration: 0.5, ease: EASE } } })
  return (
    <div className="min-h-dvh bg-paper text-ink">
      <div className="mx-auto max-w-2xl px-5 pb-16 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-8 sm:pt-14">
        <div className="mb-10 flex items-center justify-between">
          <Link to="/" aria-label="About Neralu">
            <Wordmark size="sm" />
          </Link>
          <span className="text-sm text-muted">Ward 47 · demo ward, Bengaluru</span>
        </div>
        <DrawnCheck className="mb-4 h-12 w-12 text-ok" />
        <p className="text-sm text-muted">Registration complete</p>
        <h1 className="display mt-1 text-[2.2rem] font-medium leading-[1.08] sm:text-[2.7rem]">
          <RevealLines>
            <span>{done.name} is on the</span>
            <span className="oled italic text-brand">Ward 47 heat register.</span>
          </RevealLines>
        </h1>

        <motion.div {...item(0)} className="mt-8 overflow-hidden rounded-[10px] border border-line bg-surface">
          <div className="flex items-baseline justify-between border-b border-line px-5 py-3.5">
            <span className="text-sm text-muted">Registration number</span>
            <span className="num text-base font-semibold">{regNo(done.id)}</span>
          </div>
          <div className="grid grid-cols-2 divide-x divide-line">
            <div className="px-5 py-4">
              <div className="text-xs text-muted">Heat-risk score</div>
              <AnimatedNumber value={done.risk_score} from={0} className={`num text-[1.9rem] leading-tight ${done.risk_score >= 60 ? 'oled text-heat' : ''}`} />
            </div>
            <div className="px-5 py-4">
              <div className="text-xs text-muted">Personal threshold</div>
              <div className="num text-[1.9rem] leading-tight">{done.threshold_c.toFixed(1)}°C</div>
            </div>
          </div>
        </motion.div>
        <p className="mt-2 text-xs text-muted">Thresholds are starting values to be calibrated in a pilot.</p>

        <motion.div {...item(1)} className="mt-6 rounded-[10px] border border-brand bg-brand-tint px-5 py-4">
          <div className="text-sm font-semibold">Tell {dn} the code word today</div>
          <div className="oled mt-1 text-[2.4rem] font-semibold leading-tight text-brand">{cap(done.code_word)}</div>
          <p className="mt-1 text-sm text-ink/80">Every Neralu call starts with it. A call without it is not from Neralu.</p>
        </motion.div>

        <motion.h2 {...item(2)} className="display mt-10 text-[1.6rem] font-medium">What happens next</motion.h2>
        <ol className="mt-4">
          {[
            ['On hot days, Neralu phones', <>When the heat index passes <span className="num">{done.threshold_c.toFixed(1)}°C</span>, {dn}'s personal threshold, Neralu calls in {LANG_NAME[done.language] ?? 'their language'} at 11:00, and again at 15:00 on very hot days. Any phone works.</>],
            ['A few keypad questions', <>Water, dizziness, a hot room, the fan, what day it is, and whether they need help. Fixed rules decide, not AI.</>],
            ['If something is wrong, a person goes', <>If {dn} needs help or does not answer twice, {done.has_neighbour ? 'the neighbour and then ' : ''}a volunteer nearby is asked to check in person, and you are told.</>],
            ['Neralu never asks for money', <>No money, OTP, Aadhaar or bank details, ever. Report any call that asks.</>],
          ].map(([title, body], i, all) => (
            <motion.li key={i} {...item(3 + i)} className="relative grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3 pb-6 last:pb-0">
              {i < all.length - 1 && <span className="absolute bottom-0 left-[0.85rem] top-9 w-px bg-line-strong" aria-hidden="true" />}
              <span className="display text-[1.6rem] leading-none text-brand">{i + 1}</span>
              <div>
                <div className="font-semibold">{title}</div>
                <div className="mt-1 text-sm leading-relaxed text-ink/80">{body}</div>
              </div>
            </motion.li>
          ))}
        </ol>

        <div className="mt-10 border-t border-line pt-6">
          <FlowButton variant="secondary" onClick={onAnother}>
            Register another person
          </FlowButton>
        </div>
      </div>
    </div>
  )
}

/* ---------- Fields ---------- */

function Lead({ children }: { children: React.ReactNode }) {
  return <p className="text-[1.0625rem] leading-relaxed text-ink/80">{children}</p>
}

function Row({ label, value, edit }: { label: string; value: string; edit: () => void }) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)_auto] items-baseline gap-x-3 px-4 py-2.5">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words">{value}</dd>
      <button type="button" onClick={edit} className="inline-flex items-center gap-1 text-xs text-muted hover:text-brand" aria-label={`Edit ${label.toLowerCase()}`}>
        <Pencil className="h-3 w-3" aria-hidden="true" />
        Edit
      </button>
    </div>
  )
}

function Text({ label, value, onChange, inputMode, hint, autoComplete }: { label: string; value: string; onChange: (v: string) => void; inputMode?: 'numeric' | 'tel'; hint?: string; autoComplete?: string }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={inputMode}
        autoComplete={autoComplete}
        className="mt-2 w-full rounded-[8px] border border-line-strong bg-surface px-4 py-3 text-base text-ink transition-[border-color,box-shadow] duration-200 placeholder:text-muted focus:border-brand focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--brand)_25%,transparent)] focus:outline-none"
      />
      {hint && <span className="mt-1.5 block text-xs text-muted">{hint}</span>}
    </label>
  )
}

function Choice({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <div>
      <div className="text-sm font-semibold" id={`choice-${label}`}>{label}</div>
      <div role="radiogroup" aria-labelledby={`choice-${label}`} className="mt-2 flex flex-wrap gap-2">
        {options.map(([k, l]) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={value === k}
            onClick={() => onChange(k)}
            className={`press min-h-11 rounded-full border px-4 py-2 text-sm transition-colors duration-200 ${value === k ? 'border-brand bg-brand font-semibold text-brand-ink' : 'border-line-strong bg-surface hover:border-ink/40'}`}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Yes / No as a two-way toggle whose highlight slides to the chosen side. */
function YesNo({ label, value, onChange, hint }: { label: string; value: boolean | null; onChange: (v: boolean) => void; hint?: string }) {
  const id = `yesno-${label}`
  return (
    <div className="px-4 py-3.5">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm" id={id}>{label}</span>
        <div role="radiogroup" aria-labelledby={id} className="relative grid shrink-0 grid-cols-2 rounded-full border border-line-strong p-0.5">
          {([[true, 'Yes'], [false, 'No']] as const).map(([v, l]) => (
            <button key={l} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)} className={`relative z-[1] min-h-10 w-16 rounded-full text-sm transition-colors duration-200 ${value === v ? 'font-semibold text-brand-ink' : 'text-muted hover:text-ink'}`}>
              {value === v && <motion.span layoutId={`${id}-pill`} className="absolute inset-0 -z-[1] rounded-full bg-brand" transition={{ duration: 0.3, ease: EASE }} />}
              {l}
            </button>
          ))}
        </div>
      </div>
      {hint && <span className="mt-1.5 block text-xs text-muted">{hint}</span>}
    </div>
  )
}
