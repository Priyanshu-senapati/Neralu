import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type PhoneCall, type PhoneScript } from '../api'

/**
 * Browser phone (TELEPHONY_MODE=browser): the demo fallback when Twilio cannot ring a real SIM.
 * It behaves like the Twilio call flow: same prompts, one reprompt on silence or a wrong key,
 * 8 s to answer each question, then "no answer" for that question. Answers go to the same rules.
 */

type Phase = 'off' | 'idle' | 'ringing' | 'talking' | 'ended'
const DIGIT_TIMEOUT_MS = 8000
const RECORD_MS = 5000
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#']

class HungUp extends Error {}

export default function Phone() {
  const [phase, setPhase] = useState<Phase>('off')
  const [call, setCall] = useState<PhoneCall | null>(null)
  const [caption, setCaption] = useState('')
  const [codeWord, setCodeWord] = useState<string | null>(null)
  const [keypad, setKeypad] = useState(false)
  const [dayPicker, setDayPicker] = useState(false)
  const [listening, setListening] = useState(0)
  const [endNote, setEndNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [hasMic, setHasMic] = useState(false)

  const audioEl = useRef<HTMLAudioElement | null>(null)
  const ctx = useRef<AudioContext | null>(null)
  const mic = useRef<MediaStream | null>(null)
  const digitWaiter = useRef<((d: string) => void) | null>(null)
  const dayWaiter = useRef<((d: number) => void) | null>(null)
  const live = useRef(false) // false once the call is hung up: every await checks it
  const ringTimer = useRef<number | undefined>(undefined)
  const finishClip = useRef<(() => void) | null>(null) // resolves the clip now playing

  const stopRing = () => {
    window.clearInterval(ringTimer.current)
    ringTimer.current = undefined
    navigator.vibrate?.(0)
  }

  const startRing = useCallback(() => {
    if (ringTimer.current !== undefined || !ctx.current) return
    const beep = () => {
      const a = ctx.current!
      for (const at of [0, 0.45]) {
        const osc = a.createOscillator()
        const gain = a.createGain()
        osc.frequency.value = 440
        gain.gain.setValueAtTime(0.0001, a.currentTime + at)
        gain.gain.exponentialRampToValueAtTime(0.25, a.currentTime + at + 0.03)
        gain.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + at + 0.35)
        osc.connect(gain).connect(a.destination)
        osc.start(a.currentTime + at)
        osc.stop(a.currentTime + at + 0.4)
      }
      navigator.vibrate?.([400, 200, 400])
    }
    beep()
    ringTimer.current = window.setInterval(beep, 2000)
  }, [])

  // Poll for an incoming call while idle or ringing.
  useEffect(() => {
    if (phase !== 'idle' && phase !== 'ringing') return
    let alive = true
    const poll = async () => {
      try {
        const { call: c } = await api.phone.current()
        if (!alive) return
        setError(null)
        if (c && c.status === 'ringing') {
          setCall(c)
          setPhase('ringing')
          startRing()
        } else if (phase === 'ringing') {
          stopRing()
          setPhase('ended')
          setEndNote('Missed call')
        }
      } catch {
        if (alive) setError('Cannot reach Neralu · retrying')
      }
    }
    poll()
    const id = window.setInterval(poll, 1000)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [phase, startRing])

  useEffect(() => () => stopRing(), [])

  // After a missed or finished call, go back to waiting so a retry or recall rings by itself.
  useEffect(() => {
    if (phase !== 'ended') return
    const id = window.setTimeout(() => {
      setCall(null)
      setCodeWord(null)
      setCaption('')
      setPhase('idle')
    }, 4000)
    return () => window.clearTimeout(id)
  }, [phase])

  const turnOn = async () => {
    ctx.current = new AudioContext()
    audioEl.current = new Audio()
    try {
      mic.current = await navigator.mediaDevices.getUserMedia({ audio: true })
      setHasMic(true)
    } catch {
      mic.current = null // no mic (or http on a phone): the day is tapped instead of spoken
    }
    setPhase('idle')
  }

  const play = (src: string) =>
    new Promise<void>((resolve, reject) => {
      if (!live.current) return reject(new HungUp())
      const el = audioEl.current!
      const done = () => {
        finishClip.current = null
        resolve()
      }
      finishClip.current = done
      el.onended = done
      el.onerror = done // a missing clip must not stall the call
      el.src = src
      el.play().catch(done)
    })

  /** Stop the clip and let whoever awaits it carry on (a key pressed mid-prompt, or hang-up). */
  const stopAudio = () => {
    const el = audioEl.current
    if (el) {
      el.onended = null
      el.onerror = null
      el.pause()
    }
    finishClip.current?.()
  }

  /** One keypad question, Twilio-style: barge-in allowed, 8 s after the prompt, one reprompt. */
  const gather = async (prompt: string, reprompt: string, valid: string[]) => {
    for (let attempt = 0; attempt < 2; attempt++) {
      let pressed: string | null = null
      const got = new Promise<string>((res) => {
        digitWaiter.current = (d) => {
          pressed = d
          stopAudio()
          res(d)
        }
      })
      setKeypad(true)
      if (attempt === 1) await play(reprompt)
      if (pressed === null) await play(prompt)
      const digit = pressed ?? (await Promise.race([got, wait(DIGIT_TIMEOUT_MS).then(() => null)]))
      digitWaiter.current = null
      if (!live.current) throw new HungUp()
      if (digit && valid.includes(digit)) return digit
    }
    return null
  }

  const askDay = async (s: PhoneScript, id: number) => {
    setCaption(s.orientation.caption)
    await play(s.orientation.prompt)
    if (mic.current) {
      const rec = new MediaRecorder(mic.current)
      const chunks: Blob[] = []
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
      const done = new Promise<void>((res) => (rec.onstop = () => res()))
      rec.start()
      for (let left = RECORD_MS / 1000; left > 0 && live.current; left--) {
        setListening(left)
        await wait(1000)
      }
      setListening(0)
      if (rec.state !== 'inactive') rec.stop()
      await done
      if (!live.current) throw new HungUp()
      await api.phone.orientation(id, { audio: new Blob(chunks, { type: rec.mimeType || 'audio/webm' }) })
    } else {
      setDayPicker(true)
      const day = await Promise.race([
        new Promise<number>((res) => (dayWaiter.current = res)),
        wait(DIGIT_TIMEOUT_MS * 2).then(() => null),
      ])
      dayWaiter.current = null
      setDayPicker(false)
      if (!live.current) throw new HungUp()
      if (day !== null) await api.phone.orientation(id, { day })
    }
  }

  const answer = async () => {
    if (!call) return
    stopRing()
    const id = call.checkin_id
    live.current = true
    setPhase('talking')
    try {
      const s = await api.phone.answer(id)
      setCodeWord(s.code_word)
      setCaption('Namaskara. This is Neralu, the heat care service from your ward office.')
      for (const src of s.intro) await play(src)
      for (const step of s.steps) {
        setCaption(step.caption)
        const d = await gather(step.prompt, s.reprompt, ['1', '2'])
        await api.phone.key(id, step.step, d)
      }
      setKeypad(false)
      await askDay(s, id)
      setCaption(s.help.caption)
      const d = await gather(s.help.prompt, s.reprompt, ['1', '2'])
      const { closing = [] } = await api.phone.key(id, 'help', d)
      setKeypad(false)
      setCaption(d === '2' ? 'Thank you. Someone from your area is being informed now.' : 'Thank you. We will check on you again later today.')
      for (const src of closing) await play(src)
      await hangUp('Call ended')
    } catch (e) {
      if (!(e instanceof HungUp)) {
        setError('The call dropped · Neralu treats it as an unfinished check')
        await hangUp('Call ended')
      }
    }
  }

  const hangUp = async (note: string) => {
    if (!call) return
    const wasLive = live.current
    live.current = false
    stopAudio()
    digitWaiter.current = null
    setKeypad(false)
    setDayPicker(false)
    setListening(0)
    setPhase('ended')
    setEndNote(note)
    if (wasLive) await api.phone.hangup(call.checkin_id).catch(() => {})
  }

  const decline = async () => {
    if (!call) return
    stopRing()
    setPhase('ended')
    setEndNote('Declined')
    await api.phone.decline(call.checkin_id).catch(() => {})
  }

  const press = (k: string) => {
    navigator.vibrate?.(15)
    digitWaiter.current?.(k)
  }

  return (
    <div className="flex min-h-dvh justify-center bg-paper text-ink">
      <div className="flex w-full max-w-[430px] flex-col px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between text-xs text-ink/60">
          <span>Simulated phone · demo fallback</span>
          {phase !== 'off' && <span>{hasMic ? 'Mic on' : 'Mic off · tap the day'}</span>}
        </div>

        {phase === 'off' && (
          <Center>
            <p className="mb-6 text-center text-sm text-ink/70">
              This page stands in for Kamala's phone when a real call cannot be placed. Turn it on to let it ring and play sound.
            </p>
            <BigButton tone="light" onClick={turnOn}>Turn on phone</BigButton>
          </Center>
        )}

        {phase === 'idle' && (
          <Center>
            <p className="text-sm text-ink/60">Waiting for a call</p>
          </Center>
        )}

        {(phase === 'ringing' || phase === 'talking') && call && (
          <div className="mt-14 text-center">
            <div className="text-sm text-ink/60">{phase === 'ringing' ? 'Incoming call' : 'On call'}</div>
            <div className="mt-2 text-3xl font-semibold">Neralu</div>
            <div className="mt-1 text-sm text-ink/60">Heat care service · Ward 47</div>
            <div className="mt-1 text-xs text-ink/40">
              to {call.elder_name} · {call.is_recall ? 'recall' : `attempt ${call.attempt}`}
            </div>
          </div>
        )}

        {phase === 'ringing' && (
          <div className="mt-auto grid grid-cols-2 gap-4 pb-6">
            <BigButton tone="alert" onClick={decline}>Decline</BigButton>
            <BigButton tone="ok" onClick={answer}>Answer</BigButton>
          </div>
        )}

        {phase === 'talking' && (
          <>
            {codeWord && (
              <div className="mt-6 text-center text-sm text-ink/70">
                Code word <span className="font-semibold text-ink">{codeWord}</span>
              </div>
            )}
            <p aria-live="polite" className="mt-5 min-h-[3.5rem] text-center text-base leading-snug">{caption}</p>
            {listening > 0 && (
              <p className="mt-2 text-center font-mono text-sm text-ink/70">Listening · {listening}</p>
            )}
            {dayPicker && (
              <div className="mt-4 grid grid-cols-4 gap-2" role="group" aria-label="Today is">
                {DAYS.map((d, i) => (
                  <button key={d} onClick={() => dayWaiter.current?.(i + 1)}
                    className="press min-h-12 rounded-ui border border-ink/20 text-base">{d}</button>
                ))}
              </div>
            )}
            <div className="mt-auto pb-4">
              <div className="grid grid-cols-3 gap-3" aria-label="Keypad">
                {KEYS.map((k) => (
                  <button key={k} onClick={() => press(k)} disabled={!keypad}
                    className="press h-16 rounded-full bg-ink/10 font-mono text-2xl disabled:opacity-30">{k}</button>
                ))}
              </div>
              <div className="mt-5 flex justify-center">
                <button onClick={() => hangUp('You hung up')}
                  className="press h-16 w-40 rounded-full bg-alert text-base font-semibold text-ink">Hang up</button>
              </div>
            </div>
          </>
        )}

        {phase === 'ended' && (
          <Center>
            <p className="text-lg font-semibold">{endNote}</p>
            <button onClick={() => { setCall(null); setCodeWord(null); setCaption(''); setPhase('idle') }}
              className="press mt-6 rounded-ui border border-ink/30 px-5 py-3 text-sm">Wait for the next call</button>
          </Center>
        )}

        {error && <p className="mt-3 text-center text-xs text-watch-bg">{error}</p>}
      </div>
    </div>
  )
}

const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms))

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 flex-col items-center justify-center">{children}</div>
}

function BigButton({ children, onClick, tone }: { children: React.ReactNode; onClick: () => void; tone: 'ok' | 'alert' | 'light' }) {
  const cls = tone === 'ok' ? 'bg-ok text-ink' : tone === 'alert' ? 'bg-alert text-ink' : 'bg-ink text-paper'
  return (
    <button onClick={onClick} className={`press min-h-14 w-full rounded-full px-6 text-base font-semibold ${cls}`}>
      {children}
    </button>
  )
}
