import React from 'react'

export default function SubjectWeekView({ tasks }) {
  // Group by subject
  const bySubject = tasks.reduce((acc, t) => {
    (acc[t.vak] ||= []).push(t)
    return acc
  }, {})

  const subjects = Object.keys(bySubject).sort()

  function fmt(d) {
    const dt = new Date(d)
    return dt.toLocaleDateString('nl-NL', { day:'2-digit', month:'2-digit' })
  }

  return (
    <div className="space-y-4">
      {subjects.map(subj => (
        <div key={subj} className="bg-white rounded-2xl shadow p-4">
          <div className="font-semibold mb-2">{subj}</div>
          <ul className="space-y-2">
            {bySubject[subj].sort((a,b)=>a.datum.localeCompare(b.datum)).map(it => (
              <li key={it.id || it.vak+it.titel+it.datum} className="flex items-start gap-2">
                <span className="text-xs text-slate-500 w-16">{fmt(it.datum)}</span>
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
