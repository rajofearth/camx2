"use client";

import * as React from "react";

type ThemeChoice = "system" | "light" | "dark";
const STORAGE_KEY = "camx.theme";

/**
 * ThemeSwitcher
 *
 * Lightweight, self-contained theme switcher used in the TopNav actions slot.
 * - Persists user preference to localStorage
 * - Applies classes to <html> to drive the existing CSS theme system ('.light' / '.dark')
 * - When "system" is selected it follows the OS preference and listens for changes
 *
 * This file is intended to centralise theme logic so the component can be placed
 * once in the main layout (AppShell / RootLayout) and reused across pages.
 */
export function ThemeSwitcher({ className }: { className?: string }) {
  const [theme, setTheme] = React.useState<ThemeChoice>(() => {
    try {
      const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
      if (stored === "light" || stored === "dark" || stored === "system") return stored;
    } catch {
      // ignore storage errors
    }
    return "system";
  });

  // Apply theme to <html> element. For "system" we mirror the current preference
  // and subscribe to changes so the UI reacts when the OS theme changes.
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const html = document.documentElement;

    function applyThemeChoice(choice: ThemeChoice) {
      // remove both explicit classes first
      html.classList.remove("light", "dark");

      if (choice === "light") {
        html.classList.add("light");
      } else if (choice === "dark") {
        html.classList.add("dark");
      } else {
        // system: mirror prefers-color-scheme at any time
        const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
        if (prefersLight) {
          html.classList.add("light");
        } else {
          html.classList.add("dark");
        }
      }
    }

    applyThemeChoice(theme);

    // persist selection
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // ignore
    }

    // If system, listen for changes and update classes accordingly
    let mql: MediaQueryList | null = null;
    let listener: ((e: MediaQueryListEvent) => void) | null = null;
    if (theme === "system") {
      mql = window.matchMedia("(prefers-color-scheme: light)");
      listener = (e: MediaQueryListEvent) => {
        // re-apply to reflect the new system state
        applyThemeChoice("system");
      };
      // matchMedia API has addEventListener in modern browsers, but fallback to addListener for older ones
      if (typeof mql.addEventListener === "function") {
        mql.addEventListener("change", listener);
      } else if (typeof mql.addListener === "function") {
        // @ts-ignore - legacy API
        mql.addListener(listener);
      }
    }

    return () => {
      if (mql && listener) {
        if (typeof mql.removeEventListener === "function") {
          mql.removeEventListener("change", listener);
        } else if (typeof mql.removeListener === "function") {
          // @ts-ignore - legacy API
          mql.removeListener(listener);
        }
      }
    };
  }, [theme]);

  // Accessible handler — keep simple for minimal impact
  const handleChange: React.ChangeEventHandler<HTMLSelectElement> = (e) => {
    const v = e.target.value as ThemeChoice;
    setTheme(v);
  };

  return (
    <div className={className ?? ""}>
      <label className="sr-only" htmlFor="theme-switcher">
        Theme
      </label>
      <div className="flex items-center gap-2">
        <span
          className="material-symbols-outlined text-[18px] text-op-text-sec"
          aria-hidden
        >
          brightness_6
        </span>
        <select
          id="theme-switcher"
          value={theme}
          onChange={handleChange}
          aria-label="Theme"
          title="Theme"
          className="ml-1 border border-op-border bg-op-base px-2 py-0.5 font-mono text-[10px] text-op-silver rounded-sm outline-none"
        >
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </div>
    </div>
  );
}

export default ThemeSwitcher;
