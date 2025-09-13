import React from 'react'

export default function WeekListView({ tasks }) {
  // Group by day (YYYY-MM-DD)
  const byDate = tasks.reduce((acc, t) => {
    (acc[t.datum] ||= []).push(t)
    return acc
  }, {})

  const dates = Object.keys(byDate).sort()

  function fmt(d) {
    const dt = new Date(d)
    return dt.toLocaleDateString('nl-NL', { weekday:'short', day:'2-digit', month:'2-digit' })
  }

  return (
    <div className="space-y-4">
      {dates.map(d => (
        <div key={d} className="bg-white rounded-2xl shadow p-4">
          <div className="font-semibold text-sm uppercase text-slate-600 mb-2">{fmt(d)}</div>
          <ul className="space-y-2">
            {byDate[d].map(it => (
              <li key={it.id || it.vak+it.titel+it.datum} className="flex items-start gap-2">
                <span className="shrink-0 mt-1 text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{it.vak}</span>
                <div className="text-sm">
                  <div className="font-medium">{it.titel}</div>
                  {it.is_assessment && <div className="text-xs text-red-700">TOETS / DEADLINE</div>}
                  {it.omschrijving && <div className="text-xs text-slate-600">{it.omschrijving}</div>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
