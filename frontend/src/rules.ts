import { useEffect, useState } from 'react'

/** The rule book served by the backend (backend/app/rules.py is the single source of the wording). */
export interface RuleBook {
  decided_by: string
  explain: Record<string, string>
}

let cached: Promise<RuleBook> | null = null

function load(): Promise<RuleBook> {
  cached ??= fetch('/api/rules')
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`rules ${r.status}`))))
    .then((b: { decided_by: string; rules: { id: string; explanation: string }[] }) => ({
      decided_by: b.decided_by,
      explain: Object.fromEntries(b.rules.map((r) => [r.id, r.explanation])),
    }))
    .catch((e) => {
      cached = null // try again on the next render instead of caching the failure
      throw e
    })
  return cached
}

export function useRuleBook(): RuleBook | null {
  const [book, setBook] = useState<RuleBook | null>(null)
  useEffect(() => {
    let live = true
    load().then((b) => live && setBook(b)).catch(() => {})
    return () => {
      live = false
    }
  }, [])
  return book
}
