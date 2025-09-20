import React from "react";
import { NavLink } from "react-router-dom";
import { Coffee } from "lucide-react";
import packageJson from "../../../package.json";
import { useAppStore } from "../../app/store";
import { LOGO_IMAGE, PUBLIC_ASSETS } from "../../assets/images";

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const hexToRgba = (color: string, alpha: number) => {
  const match = color.match(/^#?([0-9a-f]{6})$/i);
  if (!match) {
    return color;
  }
  const hex = match[1];
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const normalized = clamp01(alpha);
  const roundedAlpha = Math.round(normalized * 100) / 100;
  return `rgba(${r}, ${g}, ${b}, ${roundedAlpha})`;
};

export default function AppShell({ children }: { children: React.ReactNode }) {
  const theme = useAppStore((state) => state.theme);
  const backgroundImage = useAppStore((state) => state.backgroundImage);
  const surfaceOpacity = useAppStore((state) => state.surfaceOpacity);
  const appVersion = packageJson.version ?? "0.0.0";

  const themeStyle = React.useMemo(() => {
    const surfaceAlpha = clamp01(surfaceOpacity / 100);
    const resolvedSurface = hexToRgba(theme.surface, surfaceAlpha);
    const base = {
      "--app-background": theme.background,
      "--app-surface": resolvedSurface,
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
  }, [theme, backgroundImage, surfaceOpacity]);

  const headerBackground = React.useMemo(() => {
    const surfaceAlpha = clamp01(surfaceOpacity / 100);
    const headerAlpha = clamp01(surfaceAlpha * 0.6 + 0.2);
    return hexToRgba(theme.surface, headerAlpha);
  }, [theme.surface, surfaceOpacity]);

  const linkBase = "rounded-md border px-3 py-1 text-sm transition-colors theme-border";
  return (
    <div className="min-h-screen theme-app" style={themeStyle}>
      <header
        className="sticky top-0 z-20 border-b backdrop-blur theme-border theme-surface"
        style={{ backgroundColor: headerBackground }}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <img
              src={PUBLIC_ASSETS.logo}
              alt="Het Vlier Studiewijzer Planner"
              className="h-11 w-11 rounded-xl border border-white/40 bg-white/95 p-1 object-contain shadow-sm"
              onError={(event) => {
                const target = event.currentTarget;
                if (target.src === LOGO_IMAGE.src) {
                  return;
                }
                target.src = LOGO_IMAGE.src;
              }}
            />
            <div className="text-xl font-semibold theme-text">Het Vlier Studiewijzer Planner</div>
          </div>
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
              Matrix overzicht
            </NavLink>
            <NavLink
              to="/deadlines"
              className={({ isActive }) =>
                `${linkBase} ${isActive ? "theme-accent" : "theme-surface theme-text"}`
              }
            >
              Belangrijke events
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
              to="/uitleg"
              className={({ isActive }) =>
                `${linkBase} ${isActive ? "theme-accent" : "theme-surface theme-text"}`
              }
            >
              Uitleg
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
      <footer className="mx-auto max-w-6xl px-4 py-5 text-xs text-[var(--app-muted)]">
        <div className="flex flex-wrap items-center gap-2">
          <span>© {new Date().getFullYear()} Het Vlier Studiewijzer Planner</span>
          <span>·</span>
          <span>versie {appVersion}</span>
          <span>·</span>
          <span>made by Ramon Ankersmit</span>
          <span>·</span>
          <a
            href="https://buymeacoffee.com/ramonankersmit"
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 rounded-full border border-transparent px-2 py-1 transition-colors hover:border-[var(--app-border)] hover:text-[var(--app-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-border)]"
          >
            <Coffee size={14} aria-hidden="true" />
            <span>Trakteer op koffie</span>
          </a>
        </div>
      </footer>
    </div>
  );
}
