import React, { useEffect } from "react";
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import AppShell from "./components/layout/AppShell";
import WeekOverview from "./pages/WeekOverview";
import Matrix from "./pages/Matrix";
import Deadlines from "./pages/Deadlines";
import Uploads from "./pages/Uploads";
import Review from "./pages/Review";
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

function AppContent() {
  const hasDocs = useAppStore((state) => state.docs.length > 0);
  const docsInitialized = useAppStore((state) => state.docsInitialized);
  const lastVisitedRoute = useAppStore((state) => state.lastVisitedRoute);
  const setLastVisitedRoute = useAppStore((state) => state.setLastVisitedRoute);
  const navigate = useNavigate();
  const location = useLocation();
  const hasHydratedStore = useStoreHydration();
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
      <Route path="/review" element={<Review />} />
      <Route path="/review/:parseId" element={<Review />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/uitleg" element={<Handleiding />} />
    </Routes>
  );
}

export default function App() {
  // Hydrate globale docs-store vanaf de backend zodra de app mount
  useEffect(() => {
    hydrateDocsFromApi();
  }, []);

  return (
    <BrowserRouter>
      <DocumentPreviewProvider>
        <OnboardingTourProvider>
          <AppShell>
            <AppContent />
          </AppShell>
        </OnboardingTourProvider>
      </DocumentPreviewProvider>
    </BrowserRouter>
  );
}
