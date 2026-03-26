'use client'

import { useState, useEffect, useCallback } from 'react'
import type { JSX } from 'react'
import { useUser } from '@/lib/user-context'
import { callGetReports } from './reportsApi'
import type { ReportData, ReportPeriod } from './reportsApi'
import { formatPrice, DEFAULT_CURRENCY_SYMBOL } from '@/lib/formatPrice'

const PERIOD_LABELS: { value: ReportPeriod; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'custom', label: 'Custom' },
]

function SummaryCard({ label, value }: { label: string; value: string | number }): JSX.Element {
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-2xl p-6 flex flex-col gap-2">
      <span className="text-sm font-medium text-zinc-400 uppercase tracking-wide">{label}</span>
      <span className="text-3xl font-bold text-white">{value}</span>
    </div>
  )
}

interface BarChartProps {
  data: Array<{ date: string; revenue_cents: number }>
}

function BarChart({ data }: BarChartProps): JSX.Element {
  if (data.length === 0) {
    return <div className="text-zinc-500 text-sm py-4">No data for this period</div>
  }

  const maxRevenue = Math.max(...data.map(d => d.revenue_cents), 1)
  const chartHeight = 160
  const barWidth = Math.max(20, Math.min(48, Math.floor(600 / data.length) - 4))
  const gap = 4
  const totalWidth = data.length * (barWidth + gap)

  return (
    <div className="overflow-x-auto">
      <svg
        width={Math.max(totalWidth, 300)}
        height={chartHeight + 40}
        className="block"
        aria-label="Revenue bar chart"
      >
        {data.map((d, i) => {
          const barHeight = Math.max(2, Math.round((d.revenue_cents / maxRevenue) * chartHeight))
          const x = i * (barWidth + gap)
          const y = chartHeight - barHeight
          const label = d.date.slice(5) // MM-DD
          return (
            <g key={d.date}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx={4}
                className="fill-amber-500"
              />
              <title>{`${d.date}: ${formatPrice(d.revenue_cents, DEFAULT_CURRENCY_SYMBOL)}`}</title>
              <text
                x={x + barWidth / 2}
                y={chartHeight + 16}
                textAnchor="middle"
                fontSize={10}
                className="fill-zinc-400"
                fill="#a1a1aa"
              >
                {label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export default function ReportsDashboard(): JSX.Element {
  const { accessToken } = useUser()
  const [period, setPeriod] = useState<ReportPeriod>('today')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''

  const fetchReports = useCallback(async (
    p: ReportPeriod,
    from?: string,
    to?: string,
  ): Promise<void> => {
    if (!accessToken) return
    setLoading(true)
    setError(null)
    try {
      const result = await callGetReports(supabaseUrl, accessToken, p, from, to)
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reports')
    } finally {
      setLoading(false)
    }
  }, [accessToken, supabaseUrl])

  useEffect(() => {
    if (period !== 'custom') {
      void fetchReports(period)
    }
  }, [period, fetchReports])

  function handleCustomFetch(): void {
    if (!customFrom || !customTo) return
    void fetchReports('custom', customFrom, customTo)
  }

  const totalRevenue = data ? formatPrice(data.summary.total_revenue_cents, DEFAULT_CURRENCY_SYMBOL) : '—'
  const avgOrder = data ? formatPrice(data.summary.avg_order_cents, DEFAULT_CURRENCY_SYMBOL) : '—'
  const totalPaymentRevenue = data
    ? data.payment_breakdown.reduce((sum, p) => sum + p.revenue_cents, 0)
    : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-white">Reports</h1>
        <div className="flex flex-wrap items-center gap-2">
          {PERIOD_LABELS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setPeriod(value)}
              className={[
                'px-4 py-2 rounded-xl text-sm font-medium transition-colors min-h-[40px]',
                period === value
                  ? 'bg-amber-500 text-black'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-zinc-700',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom date range picker */}
      {period === 'custom' && (
        <div className="bg-zinc-800 border border-zinc-700 rounded-2xl p-4 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-400 font-medium">From</label>
            <input
              type="date"
              value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
              className="bg-zinc-700 text-white rounded-xl px-3 py-2 text-sm border border-zinc-600 focus:outline-none focus:border-amber-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-400 font-medium">To</label>
            <input
              type="date"
              value={customTo}
              onChange={e => setCustomTo(e.target.value)}
              className="bg-zinc-700 text-white rounded-xl px-3 py-2 text-sm border border-zinc-600 focus:outline-none focus:border-amber-500"
            />
          </div>
          <button
            type="button"
            onClick={handleCustomFetch}
            disabled={!customFrom || !customTo}
            className="px-4 py-2 rounded-xl bg-amber-500 text-black font-medium text-sm hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed min-h-[40px]"
          >
            Apply
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-900 border border-red-700 rounded-xl p-4 text-red-200 text-sm">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-zinc-400 text-sm py-4 text-center animate-pulse">Loading reports…</div>
      )}

      {/* Row 1 — Summary cards */}
      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <SummaryCard label="Total Revenue" value={totalRevenue} />
            <SummaryCard label="Orders" value={data.summary.order_count} />
            <SummaryCard label="Avg Order" value={avgOrder} />
            <SummaryCard label="Covers" value={data.summary.total_covers} />
          </div>

          {/* Row 2 — Revenue chart */}
          <div className="bg-zinc-800 border border-zinc-700 rounded-2xl p-6">
            <h2 className="text-base font-semibold text-white mb-4">Revenue by Day</h2>
            <BarChart data={data.revenue_by_day} />
          </div>

          {/* Row 3 — Top Items + Payment breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Top Items */}
            <div className="bg-zinc-800 border border-zinc-700 rounded-2xl p-6">
              <h2 className="text-base font-semibold text-white mb-4">Top Items</h2>
              {data.top_items.length === 0 ? (
                <p className="text-zinc-500 text-sm">No item data for this period</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-zinc-400 border-b border-zinc-700">
                      <th className="pb-2 pr-3 font-medium">#</th>
                      <th className="pb-2 pr-3 font-medium">Item</th>
                      <th className="pb-2 pr-3 font-medium text-right">Qty</th>
                      <th className="pb-2 font-medium text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.top_items.map((item, idx) => (
                      <tr key={item.name} className="border-b border-zinc-700/50">
                        <td className="py-2 pr-3 text-zinc-400">{idx + 1}</td>
                        <td className="py-2 pr-3 text-white font-medium">{item.name}</td>
                        <td className="py-2 pr-3 text-zinc-300 text-right">{item.quantity_sold}</td>
                        <td className="py-2 text-amber-400 text-right font-medium">
                          {formatPrice(item.revenue_cents, DEFAULT_CURRENCY_SYMBOL)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Payment Breakdown */}
            <div className="bg-zinc-800 border border-zinc-700 rounded-2xl p-6">
              <h2 className="text-base font-semibold text-white mb-4">Payment Methods</h2>
              {data.payment_breakdown.length === 0 ? (
                <p className="text-zinc-500 text-sm">No payment data for this period</p>
              ) : (
                <div className="space-y-3">
                  {data.payment_breakdown.map(p => {
                    const pct = totalPaymentRevenue > 0
                      ? Math.round((p.revenue_cents / totalPaymentRevenue) * 100)
                      : 0
                    return (
                      <div key={p.method}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-white font-medium capitalize">{p.method}</span>
                          <span className="text-zinc-400">
                            {p.count} orders · {formatPrice(p.revenue_cents, DEFAULT_CURRENCY_SYMBOL)} · {pct}%
                          </span>
                        </div>
                        <div className="h-2 bg-zinc-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-amber-500 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Row 4 — Discounts & Comps */}
          <div className="bg-zinc-800 border border-zinc-700 rounded-2xl p-6">
            <h2 className="text-base font-semibold text-white mb-4">Discounts &amp; Comps</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-zinc-900 rounded-xl p-4">
                <div className="text-xs text-zinc-400 uppercase tracking-wide mb-1">Discounted Orders</div>
                <div className="text-2xl font-bold text-white">{data.discount_summary.discount_order_count}</div>
                <div className="text-sm text-zinc-400 mt-1">
                  Total: {formatPrice(data.discount_summary.total_discount_cents, DEFAULT_CURRENCY_SYMBOL)}
                </div>
              </div>
              <div className="bg-zinc-900 rounded-xl p-4">
                <div className="text-xs text-zinc-400 uppercase tracking-wide mb-1">Comped Orders</div>
                <div className="text-2xl font-bold text-white">{data.discount_summary.comp_order_count}</div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Empty state */}
      {!loading && !data && !error && (
        <div className="text-zinc-500 text-sm text-center py-12">
          Select a period to load reports
        </div>
      )}
    </div>
  )
}
