import { useEffect, useMemo, useState } from "react";

const KEY = "quran-khotmer:accent-hex";
const DEFAULT_HEX = "#111827"; // slate-ish

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace("#", "").trim();
  if (![3, 6].includes(h.length)) return null;

  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n)) return null;

  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return { r, g, b };
}

// returns h,s,l as: h:0..360, s/l:0..100
function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;

  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const d = max - min;

  let h = 0;
  const l = (max + min) / 2;

  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case rr:
        h = 60 * (((gg - bb) / d) % 6);
        break;
      case gg:
        h = 60 * ((bb - rr) / d + 2);
        break;
      case bb:
        h = 60 * ((rr - gg) / d + 4);
        break;
    }
  }

  if (h < 0) h += 360;

  return { h, s: s * 100, l: l * 100 };
}

// relative luminance (sRGB)
function luminance(r: number, g: number, b: number): number {
  const srgb = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

export function useAccentColor() {
  const [hex, setHex] = useState<string>(() => {
    const saved = localStorage.getItem(KEY);
    return saved && saved.startsWith("#") ? saved : DEFAULT_HEX;
  });

  const hsl = useMemo(() => {
    const rgb = hexToRgb(hex) ?? hexToRgb(DEFAULT_HEX)!;
    return rgbToHsl(rgb.r, rgb.g, rgb.b);
  }, [hex]);

  useEffect(() => {
    // persist
    try {
      localStorage.setItem(KEY, hex);
    } catch {
      // ignore
    }

    const rgb = hexToRgb(hex);
    if (!rgb) return;

    const root = document.documentElement;

    const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const H = Math.round(clamp(h, 0, 360));
    const S = Math.round(clamp(s, 0, 100));
    const L = Math.round(clamp(l, 0, 100));

    // shadcn wants: "H S% L%"
    root.style.setProperty("--primary", `${H} ${S}% ${L}%`);
    root.style.setProperty("--ring", `${H} ${S}% ${L}%`);

    // auto foreground: choose near-white or near-black based on luminance
    const lum = luminance(rgb.r, rgb.g, rgb.b);
    const fg = lum < 0.45 ? "210 40% 98%" : "222.2 47.4% 11.2%";
    root.style.setProperty("--primary-foreground", fg);
  }, [hex]);

  function reset() {
    setHex(DEFAULT_HEX);
  }

  return { hex, setHex, reset, hsl };
}
