import { useEffect, useMemo, useState } from "react";

export type AccentTarget = "primary"; // bisa diperluas nanti

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

  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

// sRGB 0..255 -> linear 0..1
function srgbToLinear(u8: number): number {
  const c = u8 / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

// relative luminance (linear)
function luminanceFromRgb(rgb: { r: number; g: number; b: number }): number {
  const r = srgbToLinear(rgb.r);
  const g = srgbToLinear(rgb.g);
  const b = srgbToLinear(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Convert sRGB (0..255) -> OKLCH
 * Steps: sRGB -> linear RGB -> XYZ -> OKLab -> OKLCH
 * Reference: Björn Ottosson OKLab/OKLCH formulas (implemented directly)
 */
function rgbToOklch(rgb: { r: number; g: number; b: number }): { L: number; C: number; h: number } {
  const r = srgbToLinear(rgb.r);
  const g = srgbToLinear(rgb.g);
  const b = srgbToLinear(rgb.b);

  // linear RGB -> LMS (via OKLab matrix)
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;

  const C = Math.sqrt(a * a + bb * bb);
  let h = Math.atan2(bb, a) * (180 / Math.PI);
  if (h < 0) h += 360;

  return { L, C, h };
}

function formatOklch(L: number, C: number, h: number): string {
  // Keep stable rounding; Tailwind/shadcn tokens commonly use 3 decimals
  const Ls = L.toFixed(3);
  const Cs = C.toFixed(3);
  const hs = Math.round(h);
  return `oklch(${Ls} ${Cs} ${hs})`;
}

function pickForegroundByLuminance(lum: number): string {
  // use your existing theme tokens for "near white" / "near black"
  // These match your index.css:
  // white-ish: oklch(0.985 0 0), black-ish: oklch(0.145 0 0)
  return lum < 0.45 ? "oklch(0.985 0 0)" : "oklch(0.145 0 0)";
}

export function useAccentOklch() {
  const [hex, setHex] = useState<string>(() => {
    const saved = localStorage.getItem(KEY);
    return saved && saved.startsWith("#") ? saved : DEFAULT_HEX;
  });

  const meta = useMemo(() => {
    const rgb = hexToRgb(hex) ?? hexToRgb(DEFAULT_HEX)!;
    const lum = luminanceFromRgb(rgb);
    const { L, C, h } = rgbToOklch(rgb);

    // Boost chroma a bit so accent feels “accent-y” even for gray-ish colors
    const Cb = clamp(C * 1.1, 0, 0.35);

    return {
      rgb,
      lum,
      L: clamp(L, 0, 1),
      C: Cb,
      h,
      oklch: formatOklch(clamp(L, 0, 1), Cb, h),
      fg: pickForegroundByLuminance(lum),
    };
  }, [hex]);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, hex);
    } catch {
      // ignore
    }

    const root = document.documentElement;

    // apply primary + related tokens
    root.style.setProperty("--primary", meta.oklch);
    root.style.setProperty("--ring", meta.oklch);

    // optional: keep sidebar primary consistent with chosen accent
    root.style.setProperty("--sidebar-primary", meta.oklch);
    root.style.setProperty("--sidebar-ring", meta.oklch);

    // foregrounds for contrast
    root.style.setProperty("--primary-foreground", meta.fg);
    root.style.setProperty("--sidebar-primary-foreground", meta.fg);
  }, [hex, meta.oklch, meta.fg]);

  function reset() {
    setHex(DEFAULT_HEX);
  }

  return { hex, setHex, reset, meta };
}
