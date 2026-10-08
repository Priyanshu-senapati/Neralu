import type { CheckInOut } from '../types'

const ROWS: { key: string; label: string; via: 'keypad' | 'voice' }[] = [
  { key: 'water', label: 'Water in the last hour', via: 'keypad' },
  { key: 'symptoms', label: 'Dizzy, weak or confused', via: 'keypad' },
  { key: 'room_hot', label: 'Room very hot', via: 'keypad' },
  { key: 'fan_working', label: 'Fan or cooler working', via: 'keypad' },
  { key: 'orientation', label: 'Knew the day', via: 'voice' },
  { key: 'self_report', label: 'Okay or needs help', via: 'keypad' },
]

const VALUE: Record<string, string> = {
  yes: 'Yes', no: 'No', none: 'No answer', correct: 'Correct', wrong: 'Wrong day',
  uncertain: 'Unclear', ok: 'Okay', help: 'Needs help',
}

const CONCERN: Record<string, string[]> = {
  water: ['no'], symptoms: ['yes'], room_hot: ['yes'], fan_working: ['no'],
  orientation: ['wrong', 'uncertain'], self_report: ['help'],
}

export function AnswerTable({ c }: { c: CheckInOut }) {
  return (
    <table className="w-full text-sm">
      <tbody className="divide-y divide-line">
        {ROWS.map((r) => {
          const v = c.answers[r.key]
          const concern = v && CONCERN[r.key].includes(v)
          return (
            <tr key={r.key}>
              <td className="py-1.5 pr-2">{r.label}</td>
              <td className={`py-1.5 pr-2 font-semibold ${concern ? 'text-alert' : v === 'none' || !v ? 'text-muted' : ''}`}>
                {v ? VALUE[v] ?? v : c.classified ? 'No answer' : '…'}
              </td>
              <td className="py-1.5 text-right text-xs text-muted">
                {v ? `via ${r.key === 'orientation' ? c.answers.orientation_via ?? r.via : r.via}` : ''}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
