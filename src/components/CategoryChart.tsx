import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { formatINR } from '../lib/format'

interface Slice {
  name: string
  value: number
  /** Colour shown in the legend + slice */
  color?: string
}

/**
 * Spending by category for the period the caller selected. Transfers are
 * excluded upstream; this component only draws the figures it is given.
 */
export function CategoryChart({
  data,
  emptyMessage = 'No spending recorded in this period yet.',
}: {
  data: Slice[]
  emptyMessage?: string
}) {
  if (data.length === 0) {
    return (
      <div className="grid h-64 place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 text-center sm:h-72">
        <p className="max-w-xs text-sm text-slate-500">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className="h-64 w-full sm:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="55%"
            outerRadius="80%"
            paddingAngle={2}
            strokeWidth={0}
          >
            {data.map((slice) => (
              <Cell key={slice.name} fill={slice.color ?? '#94a3b8'} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value, name) => [formatINR(Number(value)), String(name)]}
          />
          <Legend
            iconType="circle"
            wrapperStyle={{ fontSize: 12 }}
            formatter={(value) => <span className="text-slate-600">{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

export type { Slice }
