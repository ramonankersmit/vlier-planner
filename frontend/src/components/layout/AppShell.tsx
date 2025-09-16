import React from "react";
import { NavLink } from "react-router-dom";
import { useAppStore } from "../../app/store";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const theme = useAppStore((state) => state.theme);
  const backgroundImage = useAppStore((state) => state.backgroundImage);

  const themeStyle = React.useMemo(() => {
    const base = {
      "--app-background": theme.background,
      "--app-surface": theme.surface,
      "--app-accent": theme.accent,
      "--app-text": theme.text,
      "--app-muted": theme.muted,
      "--app-border": theme.border,
      "--app-accent-text": theme.accentText,
    } as React.CSSProperties;
    if (backgroundImage) {
      base.backgroundImage = `url(${backgroundImage})`;
      base.backgroundSize = "cover";
      base.backgroundRepeat = "no-repeat";
      base.backgroundPosition = "center";
      base.backgroundAttachment = "fixed";
    } else {
      base.backgroundImage = "none";
      base.backgroundSize = "auto";
      base.backgroundRepeat = "repeat";
      base.backgroundPosition = "left top";
      base.backgroundAttachment = "scroll";
    }
    return base;
  }, [theme, backgroundImage]);

  const headerBackground = React.useMemo(() => {
    if (theme.surface.startsWith("#") && theme.surface.length === 7) {
      return `${theme.surface}cc`;
    }
    return theme.surface;
  }, [theme.surface]);

  const linkBase = "rounded-md border px-3 py-1 text-sm transition-colors theme-border";
  return (
    <div className="min-h-screen theme-app" style={themeStyle}>
      <header
        className="sticky top-0 z-20 border-b backdrop-blur theme-border theme-surface"
        style={{ backgroundColor: headerBackground }}
      >
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-3">
          <div className="text-xl font-semibold theme-text">Het Vlier Studiewijzer Planner</div>
          <nav className="ml-auto flex gap-1">
            <NavLink
              to="/"
              className={({ isActive }) =>
                `${linkBase} ${isActive ? "theme-accent" : "theme-surface theme-text"}`
              }
            >
              Weekoverzicht
            </NavLink>
            <NavLink
              to="/matrix"
              className={({ isActive }) =>
                `${linkBase} ${isActive ? "theme-accent" : "theme-surface theme-text"}`
              }
            >
              Matrix
            </NavLink>
            <NavLink
              to="/deadlines"
              className={({ isActive }) =>
                `${linkBase} ${isActive ? "theme-accent" : "theme-surface theme-text"}`
              }
            >
              Deadlines
            </NavLink>
            <NavLink
              to="/uploads"
              className={({ isActive }) =>
                `${linkBase} ${isActive ? "theme-accent" : "theme-surface theme-text"}`
              }
            >
              Uploads
            </NavLink>
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                `${linkBase} ${isActive ? "theme-accent" : "theme-surface theme-text"}`
              }
            >
              Settings
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="rounded-2xl border theme-border theme-surface p-6 shadow-sm">
          {children}
        </div>
      </main>
      <footer className="mx-auto max-w-6xl px-4 py-8 text-xs theme-muted">
        © {new Date().getFullYear()} Het Vlier Studiewijzer Planner - made by Ramon Ankersmit
      </footer>
    </div>
  );
}
