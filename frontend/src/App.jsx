import React, { useState } from 'react'
import { parseFiles } from './api'

// Weergaven
import WeekView from './components/WeekView'
import WeekListView from './components/WeekListView'
import SubjectWeekView from './components/SubjectWeekView'
import ViewToggle from './components/ViewToggle'

export default function App() {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [view, setView] = useState('list') // 'day' | 'list' | 'subject'

  async function onUpload(e) {
    setError('')
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setLoading(true)
    try {
      const res = await parseFiles(files)
      setTasks(res.tasks || [])
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setLoading(false)
    }
  }

  const week = tasks.length ? tasks[0].iso_week : null

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">StuPlan – MVP</h1>
        <label className="cursor-pointer">
          <input type="file" multiple className="hidden" onChange={onUpload} />
          <span className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm">
            Upload .pdf/.docx
          </span>
        </label>
      </header>

      {loading && <div>Bezig met parsen…</div>}
      {error && <div className="text-red-600">{error}</div>}

      {tasks.length > 0 ? (
        <>
          <div className="flex items-center gap-3">
            <div className="text-sm text-slate-600">
              Gevonden taken: {tasks.length} • Week: {week ?? '-'}
            </div>
            <ViewToggle view={view} setView={setView} />
          </div>

          {view === 'day' && <WeekView tasks={tasks} week={week} />}
          {view === 'list' && <WeekListView tasks={tasks} />}
          {view === 'subject' && <SubjectWeekView tasks={tasks} />}
        </>
      ) : (
        <div className="text-slate-500">Upload je studiewijzers om te starten.</div>
      )}
    </div>
  )
}
