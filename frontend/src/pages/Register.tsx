import { useRef, useState } from 'react'
import { api, ApiError } from '../api'
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

export default function Register() {
  const [f, setF] = useState<Form>(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<ElderDetail | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }))

  const missing = [
    !f.name.trim() && 'name', !f.age && 'age', !f.phone.trim() && 'phone number', f.lives_alone === null && 'lives alone',
    !f.roof_type && 'roof type', f.has_fan === null && 'fan', f.heat_sensitive_meds === null && 'medicines',
    f.hearing_difficulty === null && 'hearing', f.cognitive_flag === null && 'memory', !f.address.trim() && 'address',
    !f.family_name.trim() && 'your name', !f.family_phone.trim() && 'your phone', !f.code_word && 'code word',
  ].filter(Boolean) as string[]

  const play = (w: string) => {
    audio.current?.pause()
    audio.current = new Audio(`/audio/${f.language}/code_${w}.mp3`)
    audio.current.play().catch(() => {})
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (missing.length || !f.consent) return
    setBusy(true)
    setError(null)
    try {
      const body = { ...f, age: Number(f.age), neighbour_phone: f.neighbour_phone.trim() || null }
      setDone(await api.register(body))
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        const detail = (err.body as { detail?: { msg?: string; loc?: string[] }[] | string })?.detail
        const first = Array.isArray(detail) ? detail[0] : null
        setError(first ? `${first.loc?.at(-1)?.replace('_', ' ')}: ${first.msg?.replace('Value error, ', '')}` : String(detail))
      } else {
        setError('Could not register · check your connection and try again')
      }
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <Page>
        <DrawnCheck className="mb-3 h-10 w-10 text-ok" />
        <h1 className="text-xl font-semibold">{done.name} is registered</h1>
        <p className="mt-2 text-sm">
          On hot days Neralu will call {done.name.split(' ')[0]} and play the code word <span className="font-semibold">{cap(done.code_word)}</span> at the start of every call.
        </p>
        <p className="mt-2 text-sm">Neralu will never ask for money, OTP, Aadhaar or bank details.</p>
        <div className="mt-4 rounded-ui border border-line bg-surface p-3 text-sm">
          <div className="flex justify-between"><span>Heat-risk score</span><AnimatedNumber value={done.risk_score} from={0} className="font-mono" /></div>
          <div className="flex justify-between"><span>Personal heat threshold</span><span className="font-mono">{done.threshold_c.toFixed(1)} °C</span></div>
          <p className="mt-1 text-xs text-muted">Thresholds are starting values to be calibrated in a pilot.</p>
        </div>
        <button onClick={() => { setF(EMPTY); setDone(null) }} className="press mt-5 w-full rounded-ui border border-line py-3">
          Register another person
        </button>
      </Page>
    )
  }

  return (
    <Page>
      <h1 className="text-xl font-semibold">Register someone for heat checks</h1>
      <p className="mt-1 text-sm text-muted">On hot days Neralu calls them on any phone and tells someone nearby if they need help.</p>
      <form onSubmit={submit} className="mt-5 space-y-5">
        <Section title="About them">
          <Text label="Name" value={f.name} onChange={(v) => set('name', v)} />
          <Text label="Age" value={f.age} onChange={(v) => set('age', v.replace(/\D/g, '').slice(0, 3))} inputMode="numeric" />
          <Text label="Their phone number" value={f.phone} onChange={(v) => set('phone', v)} inputMode="tel" />
          <Choice label="Language for calls" value={f.language} options={LANGUAGES} onChange={(v) => set('language', v)} />
          <Text label="Home address" value={f.address} onChange={(v) => set('address', v)} hint="Shown only to the volunteer who accepts a case" />
        </Section>
        <Section title="Their home and health">
          <YesNo label="Lives alone" value={f.lives_alone} onChange={(v) => set('lives_alone', v)} />
          <Choice label="Roof" value={f.roof_type} options={ROOFS} onChange={(v) => set('roof_type', v)} />
          <YesNo label="Has a working fan or cooler" value={f.has_fan} onChange={(v) => set('has_fan', v)} />
          <YesNo label="Takes medicines that make heat riskier" value={f.heat_sensitive_meds} onChange={(v) => set('heat_sensitive_meds', v)} hint="For example water pills or blood pressure medicines" />
          <YesNo label="Difficulty hearing" value={f.hearing_difficulty} onChange={(v) => set('hearing_difficulty', v)} />
          <YesNo label="Memory difficulty" value={f.cognitive_flag} onChange={(v) => set('cognitive_flag', v)} />
          <Text label="Neighbour's phone (optional)" value={f.neighbour_phone} onChange={(v) => set('neighbour_phone', v)} inputMode="tel" />
        </Section>
        <Section title="You">
          <Text label="Your name and relation" value={f.family_name} onChange={(v) => set('family_name', v)} hint="For example: Suresh (son)" />
          <Text label="Your phone" value={f.family_phone} onChange={(v) => set('family_phone', v)} inputMode="tel" />
        </Section>
        <Section title="Code word">
          <p className="text-sm text-muted">Every Neralu call starts with this word, so they know the call is genuine. Tell them the word.</p>
          <div role="radiogroup" aria-label="Code word" className="grid grid-cols-2 gap-2">
            {CODE_WORDS.map((w) => (
              <div key={w} className={`flex items-center rounded-ui border ${f.code_word === w ? 'border-ink bg-surface' : 'border-line'}`}>
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
        <label className="flex gap-3 text-sm">
          <input type="checkbox" checked={f.consent} onChange={(e) => set('consent', e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0" />
          <span>I have their permission. Neralu stores only what is needed to check on them and never shares it.</span>
        </label>
        {error && <p className="rounded-ui bg-alert-bg px-3 py-2 text-sm text-alert">{error}</p>}
        {missing.length > 0 && <p className="text-xs text-muted">Still needed: {missing.join(', ')}</p>}
        <button type="submit" disabled={busy || missing.length > 0 || !f.consent}
          className="press w-full rounded-ui bg-ink py-4 text-base font-semibold text-paper disabled:opacity-40">
          {busy ? 'Registering…' : 'Register'}
        </button>
      </form>
    </Page>
  )
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh max-w-[430px] bg-paper px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]">
      <div className="mb-4 flex items-baseline justify-between">
        <span className="text-lg font-semibold">Neralu</span>
        <span className="text-sm text-muted">Ward 47 · demo ward</span>
      </div>
      {children}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="mb-2 text-sm font-semibold">{title}</legend>
      {children}
    </fieldset>
  )
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
