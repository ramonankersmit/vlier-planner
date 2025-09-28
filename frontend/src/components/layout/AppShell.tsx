import React from "react";
import { NavLink } from "react-router-dom";
import { Coffee, Sparkles, Info, UploadCloud, Settings as SettingsIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAppStore } from "../../app/store";
import { PUBLIC_LOGO } from "../../assets/images";
import { clamp01, withAlpha } from "../../lib/color";
import { useOnboardingTour } from "../OnboardingTour";
import { API_BASE, apiGetVersion } from "../../lib/api";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const theme = useAppStore((state) => state.theme);
  const backgroundImage = useAppStore((state) => state.backgroundImage);
  const surfaceOpacity = useAppStore((state) => state.surfaceOpacity);
  const [backendVersion, setBackendVersion] = React.useState<string | null>(null);
  const appVersion = backendVersion ?? __APP_VERSION__ ?? "0.0.0";
  const { restart: restartTour } = useOnboardingTour();

  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const data = await apiGetVersion();
        const reported = data?.version?.trim();
        if (!cancelled && reported) {
          setBackendVersion(reported);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn("Kon backendversie niet ophalen:", error);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const themeStyle = React.useMemo(() => {
    const surfaceAlpha = clamp01(surfaceOpacity / 100);
    const resolvedSurface = withAlpha(theme.surface, surfaceAlpha);
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
    return withAlpha(theme.surface, headerAlpha);
  }, [theme.surface, surfaceOpacity]);

  type NavigationLink = {
    to: string;
    label: string;
    icon?: LucideIcon;
    hideLabel?: boolean;
  };

  const navigationLinks: NavigationLink[] = React.useMemo(
    () => [
      { to: "/", label: "Weekoverzicht" },
      { to: "/matrix", label: "Matrix overzicht" },
      { to: "/deadlines", label: "Belangrijke events" },
      { to: "/uploads", label: "Uploads", icon: UploadCloud, hideLabel: true },
      { to: "/uitleg", label: "Uitleg", icon: Info, hideLabel: true },
      { to: "/settings", label: "Settings", icon: SettingsIcon, hideLabel: true },
    ],
    [],
  );

  const linkBase =
    "inline-flex items-center gap-2 rounded-md border px-3 py-1 text-sm transition-colors theme-border";
  const resolveLinkClassName = React.useCallback(
    (isActive: boolean) =>
      `${linkBase} ${isActive ? "theme-accent" : "theme-surface theme-text"}`,
    [],
  );

  return (
    <div className="min-h-screen theme-app" style={themeStyle}>
      <header
        className="sticky top-0 z-20 border-b backdrop-blur theme-border theme-surface"
        style={{ backgroundColor: headerBackground }}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <img
              src={PUBLIC_LOGO}
              alt="Het Vlier Studiewijzer Planner"
              className="h-16 w-16 rounded-2xl border border-white/40 bg-white/95 p-1.5 object-contain"
            />
            <div className="text-xl font-semibold theme-text">Het Vlier Studiewijzer Planner</div>
          </div>
          <nav className="ml-auto flex gap-1">
            {navigationLinks.map((link) => {
              const Icon = link.icon;
              return (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) => resolveLinkClassName(isActive)}
                  aria-label={link.hideLabel ? link.label : undefined}
                >
                  {Icon ? <Icon size={16} aria-hidden="true" /> : null}
                  <span className={link.hideLabel ? "sr-only" : undefined}>{link.label}</span>
                </NavLink>
              );
            })}
            <button
              type="button"
              onClick={() => restartTour()}
              className={`${resolveLinkClassName(false)} flex items-center justify-center !px-2 !py-2`}
              aria-label="Rondleiding opnieuw starten"
            >
              <Sparkles size={18} aria-hidden="true" />
            </button>
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
