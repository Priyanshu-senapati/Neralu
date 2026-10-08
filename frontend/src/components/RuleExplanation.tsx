import { useRuleBook } from '../rules'

/** Plain-English explanation of a deterministic rule. Wording comes from the backend rule book. */
interface Props {
  ruleId: string
  reason?: string | null
  /** Show the "Rule R3 · reason" line (off when the caller already shows it). */
  heading?: boolean
  /** Show the note that a fixed rule, not AI, decided. */
  note?: boolean
}

export function RuleExplanation({ ruleId, reason, heading = true, note = true }: Props) {
  const book = useRuleBook()
  const text = book?.explain[ruleId]
  return (
    <div className="text-sm">
      {heading && (
        <div className="font-semibold">
          <span className="font-mono">{ruleId.startsWith('E') ? `Escalated by ${ruleId}` : `Rule ${ruleId}`}</span>
          {reason && <> · {reason}</>}
        </div>
      )}
      {text && <p className="mt-0.5">{text}</p>}
      {note && book && <p className="mt-1 text-xs text-muted">{book.decided_by}</p>}
    </div>
  )
}
