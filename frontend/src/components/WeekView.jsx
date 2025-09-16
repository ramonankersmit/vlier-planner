import React from 'react'

function groupBy(arr, fn) {
  return arr.reduce((acc, x) => {
    const k = fn(x);
    (acc[k] ||= []).push(x);
    return acc;
  }, {});
}

export default function WeekView({ tasks, week }) {
  const days = ['ma','di','wo','do','vr','za','zo'];
  const byDay = groupBy(tasks, t => new Date(t.datum).getDay()); // 1..7 (Sun=0)
  const mapIdx = {0:6,1:0,2:1,3:2,4:3,5:4,6:5}; // align to ma..zo

  return (
    <div className="grid grid-cols-7 gap-4">
      {days.map((d, i) => {
        const items = byDay[Object.keys(mapIdx).find(k => mapIdx[k]===i)] || [];
        return (
          <div key={i} className="rounded-2xl border theme-border theme-surface shadow p-3">
            <div className="font-semibold mb-2 uppercase text-sm">{d}</div>
            <div className="space-y-2">
              {items.map(it => (
                <div key={it.id} className="rounded-xl border theme-border theme-soft p-3">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full">{it.vak}</span>
                    {it.is_assessment && <span className="bg-red-50 text-red-700 text-xs px-2 py-0.5 rounded-full">TOETS / DEADLINE</span>}
                  </div>
                  <div className="text-sm font-medium">{it.titel}</div>
                  {it.omschrijving && <div className="text-xs theme-muted">{it.omschrijving}</div>}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
