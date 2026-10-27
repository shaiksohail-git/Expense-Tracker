import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { MonthPoint } from '../types'
import { formatINR, formatINRCompact } from '../lib/format'

const incomeColor = '#10b981'
const expenseColor = '#f43f5e'

interface Props {
  /** Already ordered oldest → newest. */
  data: MonthPoint[]
  /** Month key highlighted by the parent, if any. */
  selectedKey?: string | null
  /** When supplied, clicking a bar calls this with that month's key. */
  onSelectMonth?: (key: string) => void
  emptyMessage?: string
}

/**
 * Monthly income vs expenses, derived entirely from the transactions passed
 * in. Clicking a bar reports the month key so a report can drill into it.
 */
export function MonthlyChart({
  data,
  selectedKey = null,
  onSelectMonth,
  emptyMessage = 'No transactions in this period yet. Add one and the monthly bars appear here.',
}: Props) {
  const hasData = data.some((point) => point.income > 0 || point.expense > 0)
  if (data.length === 0 || !hasData) {
    return (
      <div className="grid h-64 place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 text-center sm:h-72">
        <p className="max-w-xs text-sm text-slate-500">{emptyMessage}</p>
      </div>
    )
  }

  const opacityFor = (key: string) =>
    selectedKey && selectedKey !== key ? 0.35 : 1

  return (
    <div className="h-64 w-full sm:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          style={onSelectMonth ? { cursor: 'pointer' } : undefined}
          onClick={
            onSelectMonth
              ? (state) => {
                  const index = Number(state.activeTooltipIndex)
                  if (!Number.isInteger(index) || index < 0) return
                  const point = data[index]
                  if (point) onSelectMonth(point.key)
                }
              : undefined
          }
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ stroke: '#cbd5e1' }}
            tick={{ fontSize: 12, fill: '#64748b' }}
          />
          <YAxis
            tickFormatter={(v: number) => formatINRCompact(v)}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: '#64748b' }}
            width={64}
          />
          <Tooltip
            formatter={(value) => formatINR(Number(value))}
            labelFormatter={(label) => `Month: ${label}`}
            cursor={{ fill: 'rgba(148, 163, 184, 0.12)' }}
          />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="income" name="Income" fill={incomeColor} radius={[4, 4, 0, 0]} maxBarSize={28}>
            {data.map((point) => (
              <Cell
                key={point.key}
                fill={incomeColor}
                fillOpacity={opacityFor(point.key)}
              />
            ))}
          </Bar>
          <Bar dataKey="expense" name="Expenses" fill={expenseColor} radius={[4, 4, 0, 0]} maxBarSize={28}>
            {data.map((point) => (
              <Cell
                key={point.key}
                fill={expenseColor}
                fillOpacity={opacityFor(point.key)}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
