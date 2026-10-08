/** Plain-English explanations of the deterministic rules (backend/app/rules.py, plan §7.2). */
const EXPLAIN: Record<string, string> = {
  R0: 'The call connected but none of the four keypad questions got an answer, so we could not confirm they are safe. This counts as not reached, never as fine.',
  R1: 'They pressed the key for "I need help now". This is escalated straight away, whatever the other answers were.',
  R2: 'They reported dizziness, weakness or confusion, and could not say what day it is. Together these can be early signs of heat illness affecting thinking.',
  R3: 'They reported dizziness, weakness or confusion, and had no water in the last hour. Together these signal heat distress.',
  R4: 'They reported dizziness, weakness or confusion. On its own this needs a follow-up call and a family check.',
  R5: 'They named the wrong day. Heat can cause confusion, so this is followed up even if they said they are okay.',
  R6: 'They have not had water in the last hour. Neralu advises them to drink now and calls again later.',
  R7: 'Their answer to "What day is it today?" was missing or unclear, so we cannot rule out confusion.',
  R8: 'Two or more questions went unanswered, so the check is incomplete.',
  R9: 'All answers were fine and they knew the day.',
  E1: 'No one answered any of the call attempts, so a person nearby is asked to check in person.',
  E3: 'A follow-up call was still concerning or went unanswered, so this moves to a person checking in person.',
  S1: 'Their room is very hot and their fan or cooler is not working. A volunteer can bring water, ORS or a fan.',
}

interface Props {
  ruleId: string
  reason?: string | null
  /** Show the "Rule R3 · reason" line (off when the caller already shows it). */
  heading?: boolean
  /** Show the note that a fixed rule, not AI, decided. */
  note?: boolean
}

export function RuleExplanation({ ruleId, reason, heading = true, note = true }: Props) {
  return (
    <div className="text-sm">
      {heading && (
        <div className="font-semibold">
          <span className="font-mono">{ruleId.startsWith('E') ? `Escalated by ${ruleId}` : `Rule ${ruleId}`}</span>
          {reason && <> · {reason}</>}
        </div>
      )}
      {EXPLAIN[ruleId] && <p className="mt-0.5">{EXPLAIN[ruleId]}</p>}
      {note && (
        <p className="mt-1 text-xs text-muted">
          Decided by a fixed rule, not by AI. "I'm okay" never overrides another warning sign, and
          anything unclear is followed up rather than assumed fine.
        </p>
      )}
    </div>
  )
}
