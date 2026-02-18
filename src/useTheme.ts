import { useEffect, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";
const KEY = "quran-khotmer:theme";

function systemPref(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem(KEY) as ThemeMode | null;
    return saved ?? "system";
  });

  useEffect(() => {
    localStorage.setItem(KEY, mode);

    const root = document.documentElement;

    const apply = () => {
      const resolved = mode === "system" ? systemPref() : mode;
      if (resolved === "dark") root.classList.add("dark");
      else root.classList.remove("dark");
    };

    apply();

    if (mode === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => apply();
      mq.addEventListener?.("change", handler);
      // fallback lama
      mq.addListener?.(handler);

      return () => {
        mq.removeEventListener?.("change", handler);
        mq.removeListener?.(handler);
      };
    }
  }, [mode]);

  return { mode, setMode };
}
