import { formatINR } from '../lib/format'

interface CardState {
  label: string
  value: number
  /** How the value should be coloured */
  tone: 'neutral' | 'positive' | 'negative'
  hint?: string
}

export function SummaryCards({ cards }: { cards: CardState[] }) {
  const toneClass = {
    neutral: 'text-slate-900',
    positive: 'text-emerald-600',
    negative: 'text-rose-600',
  } as const

  return (
    <section aria-label="Monthly summary" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <p className="text-sm font-medium text-slate-500">{card.label}</p>
          <p
            className={`mt-1.5 text-2xl font-bold tracking-tight tabular-nums ${toneClass[card.tone]}`}
          >
            {formatINR(card.value)}
          </p>
          {card.hint && <p className="mt-1 text-xs text-slate-500">{card.hint}</p>}
        </div>
      ))}
    </section>
  )
}
