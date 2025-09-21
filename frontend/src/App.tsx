import React, { useEffect } from "react";
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import AppShell from "./components/layout/AppShell";
import WeekOverview from "./pages/WeekOverview";
import Matrix from "./pages/Matrix";
import Deadlines from "./pages/Deadlines";
import Uploads from "./pages/Uploads";
import Settings from "./pages/Settings";
import Handleiding from "./pages/Handleiding";
import { hydrateDocsFromApi, useAppStore } from "./app/store";
import { DocumentPreviewProvider } from "./components/DocumentPreviewProvider";
import { OnboardingTourProvider } from "./components/OnboardingTour";

type AppStoreWithPersist = typeof useAppStore & {
  persist: {
    hasHydrated: () => boolean;
    onFinishHydration: (callback: () => void) => () => void;
  };
};

const storeWithPersist = useAppStore as AppStoreWithPersist;

function useStoreHydration() {
  const [hydrated, setHydrated] = React.useState(() =>
    storeWithPersist.persist.hasHydrated()
  );

  React.useEffect(() => {
    const unsubscribe = storeWithPersist.persist.onFinishHydration(() => {
      setHydrated(true);
    });

    if (storeWithPersist.persist.hasHydrated()) {
      setHydrated(true);
    }

    return () => {
      unsubscribe();
    };
  }, []);

  return hydrated;
}

type AppContentProps = {
  hasHydratedStore: boolean;
};

function AppContent({ hasHydratedStore }: AppContentProps) {
  const hasDocs = useAppStore((state) => state.docs.length > 0);
  const docsInitialized = useAppStore((state) => state.docsInitialized);
  const lastVisitedRoute = useAppStore((state) => state.lastVisitedRoute);
  const setLastVisitedRoute = useAppStore((state) => state.setLastVisitedRoute);
  const navigate = useNavigate();
  const location = useLocation();
  const [initialRouteHandled, setInitialRouteHandled] = React.useState(false);
  const previousHasDocsRef = React.useRef<boolean | null>(null);

  React.useEffect(() => {
    if (!docsInitialized) {
      setInitialRouteHandled(false);
    }
  }, [docsInitialized]);

  React.useEffect(() => {
    if (!hasHydratedStore || !docsInitialized) {
      return;
    }

    if (!hasDocs) {
      if (!initialRouteHandled) {
        if (location.pathname !== "/uitleg") {
          navigate("/uitleg", { replace: true });
        }
        setInitialRouteHandled(true);
      }
      return;
    }

    if (initialRouteHandled) {
      return;
    }

    const targetRoute = lastVisitedRoute && lastVisitedRoute.trim() ? lastVisitedRoute : "/";
    if (targetRoute !== location.pathname) {
      navigate(targetRoute, { replace: true });
    }
    setInitialRouteHandled(true);
  }, [
    docsInitialized,
    hasHydratedStore,
    hasDocs,
    initialRouteHandled,
    lastVisitedRoute,
    location.pathname,
    navigate,
  ]);

  React.useEffect(() => {
    if (!hasHydratedStore || !docsInitialized) {
      return;
    }

    const prev = previousHasDocsRef.current;
    previousHasDocsRef.current = hasDocs;

    if (prev === null) {
      return;
    }

    if (prev !== hasDocs) {
      setInitialRouteHandled(false);
    }
  }, [hasDocs, docsInitialized, hasHydratedStore]);

  React.useEffect(() => {
    if (!hasHydratedStore || !hasDocs) {
      return;
    }

    setLastVisitedRoute(location.pathname);
  }, [hasHydratedStore, hasDocs, location.pathname, setLastVisitedRoute]);

  return (
    <Routes>
      <Route path="/" element={<WeekOverview />} />
      <Route path="/matrix" element={<Matrix />} />
      <Route path="/deadlines" element={<Deadlines />} />
      <Route path="/agenda" element={<Deadlines />} />
      <Route path="/uploads" element={<Uploads />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/uitleg" element={<Handleiding />} />
    </Routes>
  );
}

export default function App() {
  const hasHydratedStore = useStoreHydration();
  const enableAutoUpdate = useAppStore((state) => state.enableAutoUpdate);
  const [shouldCheckUpdate, setShouldCheckUpdate] = React.useState(true);
  const lastPromptedVersionRef = React.useRef<string | null>(null);
  const prevAutoUpdateRef = React.useRef(enableAutoUpdate);

  React.useEffect(() => {
    if (!hasHydratedStore) {
      return;
    }
    if (prevAutoUpdateRef.current === enableAutoUpdate) {
      return;
    }
    if (enableAutoUpdate) {
      setShouldCheckUpdate(true);
    }
    prevAutoUpdateRef.current = enableAutoUpdate;
  }, [enableAutoUpdate, hasHydratedStore]);

  React.useEffect(() => {
    if (!hasHydratedStore || !enableAutoUpdate || !shouldCheckUpdate) {
      return;
    }

    let cancelled = false;
    setShouldCheckUpdate(false);

    (async () => {
      try {
        const api = await import("./lib/api");
        const result = await api.apiCheckForUpdate();
        if (cancelled) {
          return;
        }
        if (!result.updateAvailable || !result.latestVersion) {
          return;
        }
        if (lastPromptedVersionRef.current === result.latestVersion) {
          return;
        }
        lastPromptedVersionRef.current = result.latestVersion;

        const rawNotes = (result.notes ?? "").trim();
        const maxLength = 600;
        const snippet =
          rawNotes && rawNotes.length > maxLength
            ? `${rawNotes.slice(0, maxLength - 3)}...`
            : rawNotes;

        let message = `Er is een nieuwe versie beschikbaar (v${result.latestVersion}).`;
        message += `\nHuidige versie: v${result.currentVersion}.`;
        if (snippet) {
          message += `\n\nWijzigingen:\n${snippet}`;
        }
        message += "\n\nWil je de update nu installeren?";

        const confirmed = window.confirm(message);
        if (!confirmed) {
          return;
        }

        try {
          await api.apiInstallUpdate(result.latestVersion);
          window.alert(
            "De installer is gestart. Sluit Vlier Planner af wanneer daarom wordt gevraagd om de update te voltooien."
          );
        } catch (error) {
          console.error("Kon update niet starten:", error);
          const errorMessage = error instanceof Error ? error.message : String(error);
          window.alert(`Update kon niet worden gestart: ${errorMessage}`);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn("Automatische update-check mislukt:", error);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enableAutoUpdate, hasHydratedStore, shouldCheckUpdate]);

  // Hydrate globale docs-store vanaf de backend zodra de app mount
  useEffect(() => {
    hydrateDocsFromApi();
  }, []);

  return (
    <BrowserRouter>
      <DocumentPreviewProvider>
        <OnboardingTourProvider>
          <AppShell>
            <AppContent hasHydratedStore={hasHydratedStore} />
          </AppShell>
        </OnboardingTourProvider>
      </DocumentPreviewProvider>
    </BrowserRouter>
  );
}
