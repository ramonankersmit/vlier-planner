import React from 'react'

export default function ViewToggle({ view, setView }) {
  const opts = [
    { id:'day', label:'Dagkolommen' },
    { id:'list', label:'Weeklijst' },
    { id:'subject', label:'Per vak' },
  ]
  return (
    <div className="inline-flex rounded-xl border theme-border overflow-hidden">
      {opts.map((o) => (
        <button
          key={o.id}
          onClick={() => setView(o.id)}
          className={`${view === o.id ? 'theme-accent' : 'theme-surface theme-text'} px-3 py-1.5 text-sm transition-colors`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
