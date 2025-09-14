import { NavLink } from "react-router-dom";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const link = "rounded-md border px-3 py-1 text-sm";
  const active = "bg-black text-white";
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="sticky top-0 z-20 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-3">
          <div className="text-xl font-semibold">Studiewijzer Planner</div>
          <nav className="ml-auto flex gap-1">
            <NavLink to="/" className={({isActive}) => `${link} ${isActive?active:"bg-white"}`}>Weekoverzicht</NavLink>
            <NavLink to="/matrix" className={({isActive}) => `${link} ${isActive?active:"bg-white"}`}>Matrix</NavLink>
            <NavLink to="/agenda" className={({isActive}) => `${link} ${isActive?active:"bg-white"}`}>Agenda</NavLink>
            <NavLink to="/uploads" className={({isActive}) => `${link} ${isActive?active:"bg-white"}`}>Uploads</NavLink>
            <NavLink to="/settings" className={({isActive}) => `${link} ${isActive?active:"bg-white"}`}>Settings</NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          {children}
        </div>
      </main>
      <footer className="mx-auto max-w-6xl px-4 py-8 text-xs text-gray-500">
        © {new Date().getFullYear()} Studiewijzer Planner
      </footer>
    </div>
  );
}
