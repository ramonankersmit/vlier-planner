import * as React from "react";

const FOCUSABLE_SELECTORS =
  'a[href], area[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useFocusTrap(
  containerRef: React.RefObject<HTMLElement>,
  active: boolean,
  deps: React.DependencyList = []
) {
  React.useEffect(() => {
    if (!active) {
      return;
    }
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const getFocusable = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)).filter(
        (el) =>
          !el.hasAttribute("disabled") &&
          el.getAttribute("aria-hidden") !== "true" &&
          el.tabIndex !== -1 &&
          (el.offsetParent !== null || el instanceof HTMLButtonElement)
      );

    const previousActive = document.activeElement as HTMLElement | null;
    const originalTabIndex = container.getAttribute("tabindex");
    if (originalTabIndex == null) {
      container.setAttribute("tabindex", "-1");
    }

    const focusFirst = () => {
      const focusable = getFocusable();
      const autoFocusTarget = focusable.find((el) => el.hasAttribute("data-autofocus"));
      const target = autoFocusTarget ?? focusable[0];
      if (target) {
        target.focus({ preventScroll: true });
      } else {
        container.focus({ preventScroll: true });
      }
    };

    focusFirst();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") {
        return;
      }
      const focusable = getFocusable();
      if (!focusable.length) {
        event.preventDefault();
        container.focus({ preventScroll: true });
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement as HTMLElement | null;

      if (event.shiftKey) {
        if (!activeElement || activeElement === first || activeElement === container) {
          event.preventDefault();
          last.focus({ preventScroll: true });
        }
        return;
      }

      if (activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (!container.contains(event.target as Node)) {
        focusFirst();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("focus", handleFocusIn, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("focus", handleFocusIn, true);
      if (originalTabIndex == null) {
        container.removeAttribute("tabindex");
      } else {
        container.setAttribute("tabindex", originalTabIndex);
      }
      if (previousActive && typeof previousActive.focus === "function") {
        previousActive.focus({ preventScroll: true });
      }
    };
  }, [containerRef, active, ...deps]);
}
