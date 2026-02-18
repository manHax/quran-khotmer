import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useEffect, useMemo, useState } from "react";
import { useTheme } from "./useTheme";
import { useAccentOklch } from "./useAccentOklch";

// Quran Khatam Separator (simple)
// - Supports splitting by pages (default 604) or ayat (custom total)
// - Targets: per day or per prayer (5 daily prayers)
// - Produces day-by-day ranges and optional prayer-by-prayer breakdown

const STORAGE_KEY = "quran-khotmer:v1";

type Unit = "pages" | "ayat";
type Mode = "per-day" | "per-prayer";

type PersistedState = {
  doneDays: Record<number, boolean>;
  doneSlots: Record<string, boolean>; // <-- NEW: checklist per-sholat (key: "day:idx")
  unit: Unit;
  totalPages: number;
  totalAyat: number;
  days: number;
  mode: Mode;
  prayersPerDay: number;
  allowUneven: boolean;
  khatamTimes: number;
};

function loadState(): PersistedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedState;
  } catch {
    return null;
  }
}

function formatWrappedRange(start: number, end: number, cycleSize: number): string {
  if (cycleSize <= 0) return `${start}–${end}`;

  const kStart = Math.floor((start - 1) / cycleSize) + 1;
  const kEnd = Math.floor((end - 1) / cycleSize) + 1;

  const s = ((start - 1) % cycleSize) + 1;
  const e = ((end - 1) % cycleSize) + 1;

  // masih dalam khatam yang sama
  if (kStart === kEnd) {
    return `K${kStart} ${s}–${e}`;
  }

  // nyebrang batas khatam (mis. 590–604 lalu 1–10)
  return `K${kStart} ${s}–${cycleSize} + K${kEnd} 1–${e}`;
}


function saveState(state: PersistedState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore (quota/private mode)
  }
}

const DEFAULT_TOTAL_PAGES = 604;
const DEFAULT_PRAYERS_PER_DAY = 5;

type Slot = {
  idx: number;
  start: number | null;
  end: number | null;
  size: number;
};

type DayPlan = {
  day: number;
  slots: Slot[];
  start: number | null;
  end: number | null;
  totalThisDay: number;
};

type BuildDailyPlanArgs = {
  total: number;
  days: number;
  mode: Mode;
  prayersPerDay: number;
  unitLabel: string;
  allowUneven: boolean;
};

type BuildDailyPlanResult = {
  daysArr: DayPlan[];
  slots: Slot[];
  base: number;
  remainder: number;
  totalSlots: number;
  perSlotLabel: string;
};

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function parseIntOrDefault(
  raw: string,
  def: number,
  min: number,
  max: number
): number {
  const s = raw.trim();
  if (s === "") return def;
  const n = Number(s);
  if (!Number.isFinite(n)) return def;
  return clampInt(n, min, max);
}

function ceilDiv(a: number, b: number): number {
  return Math.floor((a + b - 1) / b);
}

function buildDailyPlan({
  total,
  days,
  mode, // 'per-day' | 'per-prayer'
  prayersPerDay,
  unitLabel,
  allowUneven,
}: BuildDailyPlanArgs): BuildDailyPlanResult {
  const totalSlots = mode === "per-prayer" ? days * prayersPerDay : days;

  // Base amount per slot
  const base = allowUneven ? Math.floor(total / totalSlots) : ceilDiv(total, totalSlots);

  // If allowUneven=true, distribute remainder across first slots
  const remainder = allowUneven ? total - base * totalSlots : Math.max(0, base * totalSlots - total);

  // Create slot sizes
  const slotSizes: number[] = [];
  for (let i = 0; i < totalSlots; i++) {
    if (allowUneven) {
      slotSizes.push(base + (i < remainder ? 1 : 0));
    } else {
      // When not uneven, we keep base fixed and last slot may end early
      slotSizes.push(base);
    }
  }

  // Convert to ranges
  const slots: Slot[] = [];
  let cursor = 1;
  for (let i = 0; i < totalSlots; i++) {
    if (cursor > total) {
      slots.push({ idx: i + 1, start: null, end: null, size: 0 });
      continue;
    }
    const size = slotSizes[i];
    const start = cursor;
    const end = Math.min(total, cursor + size - 1);
    slots.push({ idx: i + 1, start, end, size: end - start + 1 });
    cursor = end + 1;
  }

  // Group into days
  const daysArr: DayPlan[] = [];
  if (mode === "per-day") {
    for (let d = 0; d < days; d++) {
      const s = slots[d];
      daysArr.push({
        day: d + 1,
        slots: s ? [s] : [],
        start: s?.start ?? null,
        end: s?.end ?? null,
        totalThisDay: s?.size ?? 0,
      });
    }
  } else {
    for (let d = 0; d < days; d++) {
      const startIdx = d * prayersPerDay;
      const daySlots = slots.slice(startIdx, startIdx + prayersPerDay);
      const start = daySlots.find((x) => x.start != null)?.start ?? null;
      const end = [...daySlots].reverse().find((x) => x.end != null)?.end ?? null;
      const totalThisDay = daySlots.reduce((a, b) => a + (b.size || 0), 0);
      daysArr.push({ day: d + 1, slots: daySlots, start, end, totalThisDay });
    }
  }

  const perSlotLabel = mode === "per-prayer" ? `/${unitLabel} per sholat` : `/${unitLabel} per hari`;
  return { daysArr, slots, base, remainder, totalSlots, perSlotLabel };
}

function prayerName(i: number): string {
  // Map 0..4 -> Subuh, Dzuhur, Ashar, Maghrib, Isya
  const names = ["Subuh", "Dzuhur", "Ashar", "Maghrib", "Isya"];
  return names[i] ?? `Sholat ${i + 1}`;
}

export default function App() {
  const { mode: themeMode, setMode: setThemeMode } = useTheme();
  const { hex: accentHex, setHex: setAccentHex, reset: resetAccent } = useAccentOklch();


  const initial = loadState();

  const [unit, setUnit] = useState<Unit>(initial?.unit ?? "pages");

  const [totalPagesRaw, setTotalPagesRaw] = useState<string>(String(initial?.totalPages ?? DEFAULT_TOTAL_PAGES));
  const [totalAyatRaw, setTotalAyatRaw] = useState<string>(String(initial?.totalAyat ?? 6236));
  const [daysRaw, setDaysRaw] = useState<string>(String(initial?.days ?? 29));
  const [khatamTimesRaw, setKhatamTimesRaw] = useState<string>(String(initial?.khatamTimes ?? 1));
  const [prayersPerDayRaw, setPrayersPerDayRaw] = useState<string>(String(initial?.prayersPerDay ?? DEFAULT_PRAYERS_PER_DAY));

  const totalPages = parseIntOrDefault(totalPagesRaw, DEFAULT_TOTAL_PAGES, 1, 1_000_000);
  const totalAyat = parseIntOrDefault(totalAyatRaw, 6236, 1, 1_000_000);
  const days = parseIntOrDefault(daysRaw, 29, 1, 366);
  const khatamTimes = parseIntOrDefault(khatamTimesRaw, 1, 1, 1000);
  const prayersPerDay = parseIntOrDefault(prayersPerDayRaw, DEFAULT_PRAYERS_PER_DAY, 1, 10);

  const [mode, setMode] = useState<Mode>(initial?.mode ?? "per-prayer");
  const [allowUneven, setAllowUneven] = useState<boolean>(initial?.allowUneven ?? true);

  const baseTotal = unit === "pages" ? totalPages : totalAyat;
  // const total = baseTotal * clampInt(Number(khatamTimes), 1, 1000);
  const total = baseTotal * khatamTimes;
  const unitLabel = unit === "pages" ? "halaman" : "ayat";

  // Checklist per-hari
  const [doneDays, setDoneDays] = useState<Record<number, boolean>>(initial?.doneDays ?? {});
  // Checklist per-sholat (key: "day:idx")
  const [doneSlots, setDoneSlots] = useState<Record<string, boolean>>(initial?.doneSlots ?? {});

  const plan = useMemo(() => {
    const safeDays = clampInt(Number(days), 1, 366);
    const safePrayers = clampInt(Number(prayersPerDay), 1, 10);
    const safeTotal = clampInt(Number(total), 1, 1_000_000);
    return buildDailyPlan({
      total: safeTotal,
      days: safeDays,
      mode,
      prayersPerDay: safePrayers,
      unitLabel,
      allowUneven,
    });
  }, [total, days, mode, prayersPerDay, unitLabel, allowUneven]);

  // key helper untuk per-sholat
  const slotKey = (day: number, idx: number) => `${day}:${idx}`;

  function toggleDay(day: number): void {
    setDoneDays((prev) => ({ ...prev, [day]: !prev[day] }));
  }

  function toggleSlot(day: number, idx: number): void {
    const k = slotKey(day, idx);
    setDoneSlots((prev) => ({ ...prev, [k]: !prev[k] }));
  }

  function setAllSlotsForDay(day: number, value: boolean): void {
    setDoneSlots((prev) => {
      const next = { ...prev };
      // gunakan d.slots.length (bukan prayersPerDay) supaya sesuai plan saat slot terakhir kosong dll.
      const dayPlan = plan.daysArr.find((x) => x.day === day);
      const count = dayPlan?.slots.length ?? prayersPerDay;
      for (let idx = 0; idx < count; idx++) {
        next[slotKey(day, idx)] = value;
      }
      return next;
    });
  }

  function isDayAllSlotsDone(d: DayPlan): boolean {
    if (mode !== "per-prayer") return false;
    if (!d.slots.length) return false;
    return d.slots.every((_, idx) => !!doneSlots[slotKey(d.day, idx)]);
  }

  function resetChecklist(): void {
    setDoneDays({});
    setDoneSlots({});
    try {
      const prev = loadState();
      saveState({
        doneDays: {},
        doneSlots: {},
        unit: prev?.unit ?? unit,
        totalPages: prev?.totalPages ?? totalPages,
        totalAyat: prev?.totalAyat ?? totalAyat,
        days: prev?.days ?? days,
        mode: prev?.mode ?? mode,
        prayersPerDay: prev?.prayersPerDay ?? prayersPerDay,
        allowUneven: prev?.allowUneven ?? allowUneven,
        khatamTimes: prev?.khatamTimes ?? khatamTimes,
      });
    } catch {
      // ignore
    }
  }

  // Progress: jika per-sholat, hitung slot; jika per-hari, hitung hari
  const totalCount =
    mode === "per-prayer"
      ? plan.daysArr.reduce((acc, d) => acc + d.slots.length, 0)
      : plan.daysArr.length;

  const doneCount =
    mode === "per-prayer"
      ? plan.daysArr.reduce((acc, d) => acc + d.slots.filter((_, idx) => !!doneSlots[slotKey(d.day, idx)]).length, 0)
      : plan.daysArr.filter((d) => !!doneDays[d.day]).length;

  const progressPct = Math.round((doneCount / Math.max(1, totalCount)) * 100);

  useEffect(() => {
    saveState({
      doneDays,
      doneSlots,
      unit,
      totalPages,
      totalAyat,
      days,
      mode,
      prayersPerDay,
      allowUneven,
      khatamTimes,
    });
  }, [doneDays, doneSlots, unit, totalPages, totalAyat, days, mode, prayersPerDay, allowUneven, khatamTimes]);

  const summary = useMemo(() => {
    const safeDays = clampInt(Number(days), 1, 366);
    const safePrayers = clampInt(Number(prayersPerDay), 1, 10);
    const slots = mode === "per-prayer" ? safeDays * safePrayers : safeDays;
    const avgPerDay = total / safeDays;
    const avgPerSlot = total / slots;
    const safeKhatam = clampInt(Number(khatamTimes), 1, 1000);
    return {
      safeDays,
      safePrayers,
      slots,
      avgPerDay,
      avgPerSlot,
      safeKhatam,
    };
  }, [days, prayersPerDay, mode, total, khatamTimes]);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Quran Khatam Separator</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Bagi target khatam berdasarkan <span className="font-medium">per hari</span> atau{" "}
            <span className="font-medium">per habis sholat</span>. Bisa pakai unit{" "}
            <span className="font-medium">halaman</span> atau <span className="font-medium">ayat</span>.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <Tabs value={themeMode} onValueChange={(v) => setThemeMode(v as any)}>
                <TabsList className="grid grid-cols-3">
                  <TabsTrigger value="light">Light</TabsTrigger>
                  <TabsTrigger value="dark">Dark</TabsTrigger>
                  <TabsTrigger value="system">System</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="flex items-center justify-between rounded-xl border p-3">
                <div className="space-y-0.5">
                  <div className="text-sm font-medium">Accent color</div>
                  <div className="text-xs text-muted-foreground">{accentHex.toUpperCase()}</div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={accentHex}
                    onChange={(e) => setAccentHex(e.target.value)}
                    aria-label="Pick accent color"
                    className="h-9 w-12 cursor-pointer rounded-md border bg-transparent p-1"
                  />
                  <Button variant="secondary" onClick={resetAccent}>
                    Reset
                  </Button>
                </div>
              </div>


            </CardHeader>
            <CardHeader>
              <CardTitle>Input Target</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Tabs value={unit} onValueChange={(v) => setUnit(v as Unit)}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="pages">Halaman</TabsTrigger>
                  <TabsTrigger value="ayat">Ayat</TabsTrigger>
                </TabsList>
                <TabsContent value="pages" className="mt-4 space-y-2">
                  <Label>Total halaman (default mushaf 604)</Label>
                  <Input
                    inputMode="numeric"
                    value={totalPagesRaw}
                    onChange={(e) => setTotalPagesRaw(e.target.value)}
                    onBlur={() => {
                      // kalau kosong, isi default
                      const fixed = parseIntOrDefault(totalPagesRaw, DEFAULT_TOTAL_PAGES, 1, 1_000_000);
                      setTotalPagesRaw(String(fixed));
                    }}
                  />

                </TabsContent>
                <TabsContent value="ayat" className="mt-4 space-y-2">
                  <Label>Total ayat (bisa kamu ubah)</Label>
                  <Input
                    inputMode="numeric"
                    value={totalAyatRaw}
                    onChange={(e) => setTotalAyatRaw(e.target.value)}
                    onBlur={() => setTotalAyatRaw(String(parseIntOrDefault(totalAyatRaw, 6236, 1, 1_000_000)))}
                  />

                </TabsContent>
              </Tabs>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Periode (hari)</Label>
                  <Input
                    inputMode="numeric"
                    value={daysRaw}
                    onChange={(e) => setDaysRaw(e.target.value)}
                    onBlur={() => setDaysRaw(String(parseIntOrDefault(daysRaw, 29, 1, 366)))}
                  />

                </div>
                <div className="space-y-2">
                  <Label>Target khatam (kali)</Label>
                  <Input
                    inputMode="numeric"
                    value={khatamTimesRaw}
                    onChange={(e) => setKhatamTimesRaw(e.target.value)}
                    onBlur={() => setKhatamTimesRaw(String(parseIntOrDefault(khatamTimesRaw, 1, 1, 1000)))}
                  />

                  <p className="text-xs text-muted-foreground">Misal 3 = target khatam 3x dalam periode yang kamu set.</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Mode pembagian</Label>
                <div className="flex items-center justify-between rounded-xl border p-3">
                  <div className="space-y-0.5">
                    <div className="text-sm font-medium">Per habis sholat</div>
                    <div className="text-xs text-muted-foreground">Jika OFF: per hari</div>
                  </div>
                  <Switch
                    checked={mode === "per-prayer"}
                    onCheckedChange={(v) => setMode(v ? "per-prayer" : "per-day")}
                    aria-label="Toggle mode"
                  />
                </div>
              </div>

              {mode === "per-prayer" && (
                <div className="space-y-2">
                  <Label>Jumlah sholat per hari</Label>
                  <Input
                    inputMode="numeric"
                    value={prayersPerDayRaw}
                    onChange={(e) => setPrayersPerDayRaw(e.target.value)}
                    onBlur={() => setPrayersPerDayRaw(String(parseIntOrDefault(prayersPerDayRaw, DEFAULT_PRAYERS_PER_DAY, 1, 10)))}
                  />

                  <p className="text-xs text-muted-foreground">Default 5 (Subuh, Dzuhur, Ashar, Maghrib, Isya).</p>
                </div>
              )}

              <div className="flex items-center justify-between rounded-xl border p-3">
                <div className="space-y-0.5">
                  <div className="text-sm font-medium">Bagi rata + sebar sisa</div>
                  <div className="text-xs text-muted-foreground">
                    ON: sisa dibagi ke slot awal (lebih rapi). OFF: pakai pembulatan ke atas (slot terakhir bisa lebih pendek).
                  </div>
                </div>
                <Switch checked={allowUneven} onCheckedChange={setAllowUneven} aria-label="Toggle uneven" />
              </div>

              <Separator />

              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">
                    Total: {total} {unitLabel}
                  </Badge>
                  <Badge variant="secondary">Target: {summary.safeKhatam}x khatam</Badge>
                  <Badge variant="secondary">Periode: {summary.safeDays} hari</Badge>
                  <Badge variant="secondary">Slot: {summary.slots}</Badge>
                </div>

                <div className="text-sm">
                  Rata-rata per hari: <span className="font-semibold">{summary.avgPerDay.toFixed(2)}</span> {unitLabel}
                </div>
                <div className="text-sm">
                  Rata-rata per slot: <span className="font-semibold">{summary.avgPerSlot.toFixed(2)}</span> {unitLabel}
                  {mode === "per-prayer" ? " (per habis sholat)" : " (per hari)"}
                </div>
                <div className="text-xs text-muted-foreground">
                  Pembagian slot: base {plan.base} {unitLabel}
                  {allowUneven && plan.remainder ? `, +1 untuk ${plan.remainder} slot awal` : ""}.
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle>Checklist</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="text-sm font-medium">Progress selesai</div>
                  <div className="text-xs text-muted-foreground">
                    {doneCount} / {totalCount} {mode === "per-prayer" ? "slot" : "hari"}
                  </div>
                </div>
                <div className="text-sm font-semibold">{progressPct}%</div>
              </div>
              <Progress value={progressPct} />
              <div className="flex gap-2">
                <Button variant="secondary" onClick={resetChecklist}>
                  Reset
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Catatan: sekarang checklist tersimpan di localStorage, jadi tidak hilang saat refresh.
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <div className="flex flex-col gap-1">
              <CardTitle>Rencana Bacaan</CardTitle>
              <p className="text-sm text-muted-foreground">
                Rentang {unitLabel} per hari{mode === "per-prayer" ? " + rincian per sholat" : ""}.
              </p>
            </div>
          </CardHeader>

          <CardContent>
            <div className="grid gap-3">
              {plan.daysArr.map((d) => {
                const dayAllDone = isDayAllSlotsDone(d);
                const dayChecked = mode === "per-prayer" ? dayAllDone : !!doneDays[d.day];

                return (
                  <div key={d.day} className="rounded-2xl border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={dayChecked}
                          onCheckedChange={() => {
                            if (mode === "per-prayer") {
                              setAllSlotsForDay(d.day, !dayChecked);
                            } else {
                              toggleDay(d.day);
                            }
                          }}
                          id={`day-${d.day}`}
                        />
                        <Label htmlFor={`day-${d.day}`} className="cursor-pointer">
                          <span className="font-semibold">Hari {d.day}</span>
                          {d.start && d.end ? (
                            <span className="text-muted-foreground">
                              {" "}
                              — {formatWrappedRange(d.start, d.end, baseTotal)} ({d.totalThisDay} {unitLabel})
                            </span>
                          ) : (
                            <span className="text-muted-foreground"> — selesai</span>
                          )}
                        </Label>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">
                          {d.totalThisDay} {unitLabel}/hari
                        </Badge>
                        {mode === "per-prayer" && (
                          <Badge variant="secondary">
                            {plan.base} {unitLabel}/slot
                          </Badge>
                        )}
                      </div>
                    </div>

                    {mode === "per-prayer" && (
                      <div className="mt-3 grid gap-2 md:grid-cols-5">
                        {d.slots.map((s, idx) => {
                          const k = slotKey(d.day, idx);
                          const checked = !!doneSlots[k];

                          return (
                            <div key={s.idx} className="rounded-xl bg-muted/40 p-3">
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-xs font-medium text-muted-foreground">
                                  {prayerName(idx)}
                                </div>

                                {/* Checkbox per-sholat */}
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={() => toggleSlot(d.day, idx)}
                                  aria-label={`Checklist ${prayerName(idx)} hari ${d.day}`}
                                />
                              </div>

                              <div className="mt-1 text-sm font-semibold">
                                {s.start != null && s.end != null ? formatWrappedRange(s.start, s.end, baseTotal) : "—"}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {s.size} {unitLabel}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle>Tips cepat pakai</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <ul className="list-disc pl-5 space-y-1">
              <li>
                Ingin khatam Ramadan? Set <span className="font-medium text-foreground">Periode = 29/30</span>, unit halaman (604), mode per habis sholat.
              </li>
              <li>
                Kalau kamu ingin target per hari saja, matikan switch <span className="font-medium text-foreground">Per habis sholat</span>.
              </li>
              <li>Kalau target terasa berat, naikkan periode atau ubah unit menjadi ayat (lebih fleksibel).</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
