import React from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import clsx from "clsx";
import { useFocusTrap } from "../lib/useFocusTrap";

const TOUR_STORAGE_KEY = "vlier.tourDone";

type OnboardingStep = {
  id: string;
  route: string;
  selector: string;
  heading: string;
  description: string;
};

type OnboardingTourContextValue = {
  start: (options?: { force?: boolean }) => void;
  restart: () => void;
  isActive: boolean;
};

const OnboardingTourContext = React.createContext<OnboardingTourContextValue | null>(null);

export function useOnboardingTour() {
  const ctx = React.useContext(OnboardingTourContext);
  if (!ctx) {
    throw new Error("useOnboardingTour must be used within OnboardingTourProvider");
  }
  return ctx;
}

const steps: OnboardingStep[] = [
  {
    id: "intro",
    route: "/uitleg",
    selector: '[data-tour-id="tour-intro"]',
    heading: "Snelstart",
    description:
      "Begin bij de uitleg om in één minuut te zien hoe de planner werkt en waar je alles terugvindt.",
  },
  {
    id: "upload",
    route: "/uploads",
    selector: '[data-tour-id="upload-dropzone"]',
    heading: "Upload je studiewijzer",
    description:
      "Sleep je studiewijzer hierheen of kies een bestand. Wij herkennen automatisch de planning en metadata.",
  },
  {
    id: "weekoverview",
    route: "/",
    selector: '[data-tour-id="planner-view"]',
    heading: "Weekoverzicht",
    description:
      "Zie per vak wat er deze week moet gebeuren en vink opdrachten af zodra je klaar bent.",
  },
  {
    id: "matrix",
    route: "/matrix",
    selector: '[data-tour-id="matrix-overview"]',
    heading: "Matrix overzicht",
    description:
      "Gebruik de matrix om meerdere weken naast elkaar te plannen en grote projecten vooruit te zien.",
  },
  {
    id: "events",
    route: "/deadlines",
    selector: '[data-tour-id="events-overview"]',
    heading: "Belangrijke events",
    description:
      "Check toetsen en inlevermomenten zodat je op tijd kunt beginnen en niets mist.",
  },
  {
    id: "settings",
    route: "/settings",
    selector: '[data-tour-id="settings-theme"]',
    heading: "Instellingen",
    description:
      "Pas kleuren, achtergrond en zichtbare vakken aan zodat de planner helemaal bij jou past.",
  },
];

export function OnboardingTourProvider({ children }: { children: React.ReactNode }) {
  const [hasSeenTour, setHasSeenTour] = React.useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    try {
      return window.localStorage.getItem(TOUR_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [isActive, setIsActive] = React.useState(false);
  const [stepIndex, setStepIndex] = React.useState(0);
  const location = useLocation();
  const navigate = useNavigate();
  const overlayRef = React.useRef<HTMLDivElement | null>(null);
  const targetElementRef = React.useRef<HTMLElement | null>(null);
  const [targetRect, setTargetRect] = React.useState<DOMRect | null>(null);
  const [targetFound, setTargetFound] = React.useState(false);

  const start = React.useCallback(
    (options?: { force?: boolean }) => {
      if (!options?.force && hasSeenTour) {
        return;
      }
      setIsActive(true);
      setStepIndex(0);
    },
    [hasSeenTour]
  );

  const finish = React.useCallback(() => {
    setIsActive(false);
    setStepIndex(0);
    setTargetRect(null);
    setTargetFound(false);
    targetElementRef.current = null;
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(TOUR_STORAGE_KEY, "true");
      } catch {
        // ignore
      }
    }
    setHasSeenTour(true);
  }, []);

  const restart = React.useCallback(() => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(TOUR_STORAGE_KEY);
      } catch {
        // ignore
      }
    }
    setHasSeenTour(false);
    setIsActive(true);
    setStepIndex(0);
  }, []);

  React.useEffect(() => {
    if (hasSeenTour || isActive) {
      return;
    }
    const timer = window.setTimeout(() => {
      start({ force: true });
    }, 600);
    return () => window.clearTimeout(timer);
  }, [hasSeenTour, isActive, start]);

  React.useEffect(() => {
    if (!isActive) {
      return;
    }
    const step = steps[stepIndex];
    if (!step) {
      finish();
      return;
    }
    if (location.pathname !== step.route) {
      navigate(step.route);
    }
  }, [finish, isActive, location.pathname, navigate, stepIndex]);

  React.useEffect(() => {
    if (!isActive) {
      setTargetRect(null);
      setTargetFound(false);
      targetElementRef.current = null;
      return;
    }
    const step = steps[stepIndex];
    if (!step) {
      return;
    }

    let cancelled = false;
    let rafId: number | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let hasScrolled = false;

    const setTarget = (element: HTMLElement | null, shouldScroll: boolean) => {
      if (cancelled) {
        return;
      }
      if (!element) {
        targetElementRef.current = null;
        setTargetRect(null);
        setTargetFound(false);
        return;
      }
      targetElementRef.current = element;
      setTargetRect(element.getBoundingClientRect());
      setTargetFound(true);
      if (shouldScroll && !hasScrolled) {
        hasScrolled = true;
        element.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    };

    const locate = () => {
      if (cancelled) {
        return;
      }
      const element = document.querySelector(step.selector) as HTMLElement | null;
      if (!element) {
        setTarget(null, false);
        rafId = window.requestAnimationFrame(locate);
        return;
      }
      setTarget(element, true);
      resizeObserver?.disconnect();
      resizeObserver = new ResizeObserver(() => {
        if (targetElementRef.current) {
          setTarget(targetElementRef.current, false);
        }
      });
      resizeObserver.observe(element);
    };

    rafId = window.requestAnimationFrame(locate);

    const handleScroll = () => {
      if (!targetElementRef.current) {
        return;
      }
      setTarget(targetElementRef.current, false);
    };

    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleScroll);

    const observer = new MutationObserver(() => {
      const element = document.querySelector(step.selector) as HTMLElement | null;
      if (element && element !== targetElementRef.current) {
        setTarget(element, true);
        resizeObserver?.disconnect();
        resizeObserver = new ResizeObserver(() => {
          if (targetElementRef.current) {
            setTarget(targetElementRef.current, false);
          }
        });
        resizeObserver.observe(element);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      cancelled = true;
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      observer.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleScroll);
    };
  }, [isActive, stepIndex]);

  React.useEffect(() => {
    if (!isActive) {
      return;
    }
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isActive]);

  useFocusTrap(overlayRef, isActive, [stepIndex]);

  const goNext = React.useCallback(() => {
    if (stepIndex + 1 >= steps.length) {
      finish();
    } else {
      setStepIndex((prev) => Math.min(prev + 1, steps.length - 1));
    }
  }, [finish, stepIndex]);

  const goPrev = React.useCallback(() => {
    setStepIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      finish();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      if (event.target === event.currentTarget) {
        event.preventDefault();
        goNext();
      }
    }
  };

  const portalTarget = typeof document !== "undefined" ? document.body : null;
  const step = steps[stepIndex];
  const headingId = `tour-heading-${step?.id ?? ""}`;
  const descriptionId = `tour-description-${step?.id ?? ""}`;

  const highlightPadding = 12;
  const highlightStyle = targetRect
    ? {
        top: Math.max(0, targetRect.top - highlightPadding),
        left: Math.max(0, targetRect.left - highlightPadding),
        width: targetRect.width + highlightPadding * 2,
        height: targetRect.height + highlightPadding * 2,
        borderRadius: "16px",
      }
    : undefined;

  const contextValue = React.useMemo(
    () => ({
      start,
      restart,
      isActive,
    }),
    [isActive, restart, start]
  );

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      (window as any).__vlierTour = { start, restart };
    }
  }, [start, restart]);

  return (
    <OnboardingTourContext.Provider value={contextValue}>
      {children}
      {isActive && portalTarget && step
        ? createPortal(
            <div className="fixed inset-0 z-[9999]" aria-live="polite">
              <div className="absolute inset-0 bg-slate-900/70" aria-hidden="true" />
              {highlightStyle ? (
                <div
                  className="pointer-events-none absolute border-2 border-white/90 shadow-[0_0_0_9999px_rgba(15,23,42,0.6)]"
                  style={highlightStyle}
                  aria-hidden="true"
                />
              ) : (
                <div className="pointer-events-none absolute inset-0" aria-hidden="true" />
              )}
              <div
                ref={overlayRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={headingId}
                aria-describedby={descriptionId}
                className="pointer-events-auto fixed bottom-6 left-1/2 z-[10000] w-[min(100%-2rem,380px)] -translate-x-1/2 rounded-2xl border bg-white p-6 text-sm shadow-2xl outline-none sm:left-auto sm:right-6 sm:translate-x-0"
                onKeyDown={handleKeyDown}
              >
                <div className="mb-4 flex flex-col gap-1 text-[11px] font-medium uppercase tracking-[0.3em] text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                  <span className="order-2 sm:order-1">Stap {stepIndex + 1} van {steps.length}</span>
                  <span className="order-1 text-slate-400 sm:order-2 sm:text-right">Enter = volgende • Esc = sluiten</span>
                </div>
                <h2 id={headingId} className="text-lg font-semibold text-slate-900">
                  {step.heading}
                </h2>
                <p id={descriptionId} className="mt-2 text-slate-700">
                  {step.description}
                </p>
                {!targetFound && (
                  <p className="mt-3 rounded-md bg-slate-100 px-3 py-2 text-xs text-slate-600">
                    Even geduld… we zoeken de juiste plek op de pagina.
                  </p>
                )}
                <div className="mt-5 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={finish}
                    className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 hover:bg-slate-100"
                  >
                    Sluiten
                  </button>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={goPrev}
                      disabled={stepIndex === 0}
                      className={clsx(
                        "rounded-md border border-slate-200 px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400",
                        stepIndex === 0
                          ? "cursor-not-allowed bg-slate-100 text-slate-400"
                          : "text-slate-700 hover:bg-slate-100"
                      )}
                    >
                      Vorige
                    </button>
                    <button
                      type="button"
                      data-autofocus
                      onClick={goNext}
                      className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 hover:bg-slate-800"
                    >
                      {stepIndex + 1 === steps.length ? "Afronden" : "Volgende"}
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            portalTarget
          )
        : null}
    </OnboardingTourContext.Provider>
  );
}
