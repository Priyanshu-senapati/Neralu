import { useRef, useState } from 'react'
import { api, ApiError } from '../api'
import { Wordmark } from '../components/Brand'
import { AnimatedNumber, DrawnCheck } from '../components/Motion'
import type { ElderDetail } from '../types'

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
  { key: 'who', title: 'Who should Neralu check on?' },
  { key: 'home', title: 'Their home and health' },
  { key: 'you', title: 'You, the family contact' },
  { key: 'code', title: 'Choose a family code word' },
  { key: 'review', title: 'Check and give consent' },
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

export default function Register() {
  const [f, setF] = useState<Form>(EMPTY)
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<ElderDetail | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }))
  const missing = stepMissing(f, step)
  const first = f.name.trim().split(' ')[0] || 'them'

  const go = (n: number) => {
    setStep(n)
    setError(null)
    requestAnimationFrame(() => heading.current?.focus())
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

  if (done) return <Confirmation done={done} onAnother={() => { setF(EMPTY); setDone(null); setStep(0) }} />

  return (
    <Page>
      <p className="text-sm text-muted">Heat welfare register · family registration</p>
      <Progress step={step} />
      <h1 ref={heading} tabIndex={-1} className="display mt-4 text-[1.6rem] font-medium leading-tight outline-none">{STEPS[step].title}</h1>

      <form onSubmit={submit} className="mt-3 space-y-5">
        {step === 0 && (
          <Section>
            <p className="text-sm text-muted">An older person who may struggle in a heatwave, often someone who lives alone.</p>
            <Text label="Their name" value={f.name} onChange={(v) => set('name', v)} />
            <Text label="Age" value={f.age} onChange={(v) => set('age', v.replace(/\D/g, '').slice(0, 3))} inputMode="numeric" />
            <Text label="Their phone number" value={f.phone} onChange={(v) => set('phone', v)} inputMode="tel" hint="Any phone works, including a basic keypad phone" />
            <Choice label="Language for calls" value={f.language} options={LANGUAGES} onChange={(v) => set('language', v)} />
            <Text label="Home address" value={f.address} onChange={(v) => set('address', v)} hint="Kept private: shown only to the volunteer who accepts a case" />
          </Section>
        )}
        {step === 1 && (
          <Section>
            <p className="text-sm text-muted">These set {first}'s personal heat threshold, so Neralu calls before a city-wide alert would.</p>
            <YesNo label="Lives alone" value={f.lives_alone} onChange={(v) => set('lives_alone', v)} />
            <Choice label="Roof" value={f.roof_type} options={ROOFS} onChange={(v) => set('roof_type', v)} />
            <YesNo label="Has a working fan or cooler" value={f.has_fan} onChange={(v) => set('has_fan', v)} />
            <YesNo label="Takes medicines that make heat riskier" value={f.heat_sensitive_meds} onChange={(v) => set('heat_sensitive_meds', v)} hint="For example water pills or blood pressure medicines" />
            <YesNo label="Difficulty hearing" value={f.hearing_difficulty} onChange={(v) => set('hearing_difficulty', v)} />
            <YesNo label="Memory difficulty" value={f.cognitive_flag} onChange={(v) => set('cognitive_flag', v)} hint="If yes, a caregiver is the main contact" />
            <Text label="A neighbour's phone (optional)" value={f.neighbour_phone} onChange={(v) => set('neighbour_phone', v)} inputMode="tel" hint="If a check is needed, a neighbour is asked first: usually the fastest help" />
          </Section>
        )}
        {step === 2 && (
          <Section>
            <p className="text-sm text-muted">You are told when {first} needs a follow-up and when someone has checked in person.</p>
            <Text label="Your name and relation" value={f.family_name} onChange={(v) => set('family_name', v)} hint="For example: Suresh (son)" />
            <Text label="Your phone" value={f.family_phone} onChange={(v) => set('family_phone', v)} inputMode="tel" />
          </Section>
        )}
        {step === 3 && (
          <Section>
            <p className="text-sm text-muted">
              Every Neralu call starts with this word, so {first} knows it is genuine and not a scam. Pick one {first} will
              remember, and play it to hear how it sounds on the call.
            </p>
            <div role="radiogroup" aria-label="Code word" className="grid grid-cols-2 gap-2">
              {CODE_WORDS.map((w) => (
                <div key={w} className={`flex items-center rounded-ui border ${f.code_word === w ? 'border-ink bg-surface ring-1 ring-ink' : 'border-line'}`}>
                  <button type="button" role="radio" aria-checked={f.code_word === w} onClick={() => set('code_word', w)} className="press min-h-11 flex-1 px-3 py-2.5 text-left">
                    {cap(w)}
                  </button>
                  <button type="button" onClick={() => play(w)} className="min-h-11 border-l border-line px-3 text-xs text-muted" aria-label={`Play ${w}`}>
                    Play
                  </button>
                </div>
              ))}
            </div>
          </Section>
        )}
        {step === 4 && (
          <>
            <dl className="divide-y divide-line rounded-ui border border-line bg-surface text-sm">
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
            <label className="flex gap-3 rounded-ui border border-line bg-surface px-3 py-3 text-sm">
              <input type="checkbox" checked={f.consent} onChange={(e) => set('consent', e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--brand)]" />
              <span>
                I have {first}'s permission. Neralu stores only what is needed to check on them, shows the address only to
                the volunteer who accepts a case, and never shares it.
              </span>
            </label>
          </>
        )}

        {error && <p role="alert" className="rounded-ui bg-alert-bg px-3 py-2 text-sm text-alert">{error}</p>}
        {missing.length > 0 && <p className="text-xs text-muted">Still needed: {missing.join(', ')}</p>}
        <div className="flex gap-2">
          {step > 0 && (
            <button type="button" onClick={() => go(step - 1)} className="press min-h-12 rounded-ui border border-line px-4 text-base">
              Back
            </button>
          )}
          <button type="submit" disabled={busy || missing.length > 0}
            className="press min-h-12 flex-1 rounded-ui bg-ink text-base font-semibold text-paper disabled:opacity-40">
            {step < STEPS.length - 1 ? 'Continue' : busy ? 'Registering…' : `Register ${first}`}
          </button>
        </div>
      </form>
    </Page>
  )
}

function Confirmation({ done, onAnother }: { done: ElderDetail; onAnother: () => void }) {
  const dn = done.name.split(' ')[0]
  return (
    <Page>
      <DrawnCheck className="mb-3 h-10 w-10 text-ok" />
      <p className="text-sm text-muted">Registration complete</p>
      <h1 className="display text-[1.85rem] font-medium leading-tight">{done.name} is on the Ward 47 heat register</h1>
      <div className="mt-4 rounded-ui border border-line bg-surface">
        <div className="flex items-baseline justify-between border-b border-line px-4 py-3">
          <span className="text-sm text-muted">Registration number</span>
          <span className="num text-base font-semibold">{regNo(done.id)}</span>
        </div>
        <div className="grid grid-cols-2 divide-x divide-line">
          <div className="px-4 py-3">
            <div className="text-xs text-muted">Heat-risk score</div>
            <AnimatedNumber value={done.risk_score} from={0} className="num text-xl" />
          </div>
          <div className="px-4 py-3">
            <div className="text-xs text-muted">Personal threshold</div>
            <div className="num text-xl">{done.threshold_c.toFixed(1)} °C</div>
          </div>
        </div>
      </div>
      <p className="mt-1.5 text-xs text-muted">Thresholds are starting values to be calibrated in a pilot.</p>

      <div className="mt-5 rounded-ui border-2 border-ink bg-surface px-4 py-3">
        <div className="text-sm font-semibold">Tell {dn} the code word today</div>
        <div className="mt-1 text-2xl font-semibold">{cap(done.code_word)}</div>
        <p className="mt-1 text-sm text-muted">Every Neralu call starts with it. A call without it is not from Neralu.</p>
      </div>

      <h2 className="mt-6 text-sm font-semibold">What happens next</h2>
      <ol className="mt-2 space-y-3 text-sm">
        <Next n={1} title="On hot days, Neralu phones">
          When the heat index passes <span className="num">{done.threshold_c.toFixed(1)} °C</span>, {dn}'s personal threshold,
          Neralu calls in {LANG_NAME[done.language] ?? 'their language'} at 11:00, and again at 15:00 on very hot days. Any phone works.
        </Next>
        <Next n={2} title="A few keypad questions">
          Water, dizziness, a hot room, the fan, what day it is, and whether they need help. Fixed rules decide, not AI.
        </Next>
        <Next n={3} title="If something is wrong, a person goes">
          If {dn} needs help or does not answer twice, {done.has_neighbour ? 'the neighbour and then ' : ''}a volunteer nearby is
          asked to check in person, and you are told.
        </Next>
        <Next n={4} title="Neralu never asks for money">
          No money, OTP, Aadhaar or bank details, ever. Report any call that asks.
        </Next>
      </ol>

      <button onClick={onAnother} className="press mt-6 w-full rounded-ui border border-line py-3">
        Register another person
      </button>
    </Page>
  )
}

function Progress({ step }: { step: number }) {
  return (
    <div className="mt-3">
      <div className="flex gap-1" aria-hidden="true">
        {STEPS.map((s, i) => (
          <span key={s.key} className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? 'bg-ink' : 'bg-line'}`} />
        ))}
      </div>
      <p className="mt-1.5 text-xs text-muted">
        Step <span className="num">{step + 1}</span> of <span className="num">{STEPS.length}</span>
      </p>
    </div>
  )
}

function Row({ label, value, edit }: { label: string; value: string; edit: () => void }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-baseline gap-x-3 px-3 py-2">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words">{value}</dd>
      <button type="button" onClick={edit} className="text-xs text-muted underline hover:text-ink">Edit</button>
    </div>
  )
}

function Next({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-2">
      <span className="num flex h-6 w-6 items-center justify-center rounded-full border border-line-strong text-xs">{n}</span>
      <div>
        <div className="font-semibold">{title}</div>
        <div className="text-muted">{children}</div>
      </div>
    </li>
  )
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh max-w-[430px] bg-paper px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]">
      <div className="mb-6 flex items-center justify-between">
        <Wordmark size="sm" />
        <span className="text-sm text-muted">Ward 47 · demo ward, Bengaluru</span>
      </div>
      {children}
    </div>
  )
}

function Section({ children }: { children: React.ReactNode }) {
  return <fieldset className="space-y-3">{children}</fieldset>
}

function Text({ label, value, onChange, inputMode, hint }: { label: string; value: string; onChange: (v: string) => void; inputMode?: 'numeric' | 'tel'; hint?: string }) {
  return (
    <label className="block">
      <span className="text-sm">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} inputMode={inputMode}
        className="mt-1 w-full rounded-ui border border-line bg-surface px-3 py-2.5 text-base" />
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  )
}

function Choice({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <div>
      <div className="text-sm" id={`choice-${label}`}>{label}</div>
      <div role="radiogroup" aria-labelledby={`choice-${label}`} className="mt-1 flex flex-wrap gap-2">
        {options.map(([k, l]) => (
          <button key={k} type="button" role="radio" aria-checked={value === k} onClick={() => onChange(k)}
            className={`press min-h-11 rounded-ui border px-3 py-2 text-sm ${value === k ? 'border-ink bg-ink text-paper' : 'border-line bg-surface'}`}>
            {l}
          </button>
        ))}
      </div>
    </div>
  )
}

function YesNo({ label, value, onChange, hint }: { label: string; value: boolean | null; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm" id={`yesno-${label}`}>{label}</span>
        <div role="radiogroup" aria-labelledby={`yesno-${label}`} className="flex shrink-0 gap-1.5">
          {([[true, 'Yes'], [false, 'No']] as const).map(([v, l]) => (
            <button key={l} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
              className={`press min-h-11 w-14 rounded-ui border py-2 text-sm ${value === v ? 'border-ink bg-ink text-paper' : 'border-line bg-surface'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </div>
  )
}
