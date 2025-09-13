import React from 'react'

export default function ViewToggle({ view, setView }) {
  const opts = [
    { id:'day', label:'Dagkolommen' },
    { id:'list', label:'Weeklijst' },
    { id:'subject', label:'Per vak' },
  ]
  return (
    <div className="inline-flex rounded-xl border border-slate-200 bg-white overflow-hidden">
      {opts.map(o => (
        <button
          key={o.id}
          onClick={()=>setView(o.id)}
          className={(view===o.id?'bg-slate-900 text-white':'text-slate-700') + ' px-3 py-1.5 text-sm'}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
