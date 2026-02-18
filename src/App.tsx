import React, { useMemo, useState } from "react";
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

// Quran Khatam Separator (simple)
// - Supports splitting by pages (default 604) or ayat (custom total)
// - Targets: per day or per prayer (5 daily prayers)
// - Produces day-by-day ranges and optional prayer-by-prayer breakdown

const DEFAULT_TOTAL_PAGES = 604;
const DEFAULT_PRAYERS_PER_DAY = 5;

function clampInt(n, min, max) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function ceilDiv(a, b) {
  return Math.floor((a + b - 1) / b);
}

function formatRange(start, end) {
  return `${start}–${end}`;
}

function buildDailyPlan({
  total,
  days,
  mode, // 'per-day' | 'per-prayer'
  prayersPerDay,
  unitLabel,
  allowUneven,
}) {
  const totalSlots = mode === "per-prayer" ? days * prayersPerDay : days;

  // Base amount per slot
  const base = allowUneven ? Math.floor(total / totalSlots) : ceilDiv(total, totalSlots);

  // If allowUneven=true, distribute remainder across first slots
  const remainder = allowUneven ? total - base * totalSlots : Math.max(0, base * totalSlots - total);

  // Create slot sizes
  const slotSizes = [];
  for (let i = 0; i < totalSlots; i++) {
    if (allowUneven) {
      slotSizes.push(base + (i < remainder ? 1 : 0));
    } else {
      // When not uneven, we keep base fixed and last slot may end early
      slotSizes.push(base);
    }
  }

  // Convert to ranges
  const slots = [];
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
  const daysArr = [];
  if (mode === "per-day") {
    for (let d = 0; d < days; d++) {
      const s = slots[d];
      daysArr.push({
        day: d + 1,
        slots: [s],
        start: s.start,
        end: s.end,
        totalThisDay: s.size,
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

function prayerName(i) {
  // Map 0..4 -> Subuh, Dzuhur, Ashar, Maghrib, Isya
  const names = ["Subuh", "Dzuhur", "Ashar", "Maghrib", "Isya"];
  return names[i] ?? `Sholat ${i + 1}`;
}

export default function App() {
  const [unit, setUnit] = useState("pages"); // 'pages' | 'ayat'
  const [totalPages, setTotalPages] = useState(DEFAULT_TOTAL_PAGES);
  const [totalAyat, setTotalAyat] = useState(6236); // common count; user can change

  const [days, setDays] = useState(29); // Ramadan-style default
  const [mode, setMode] = useState("per-prayer"); // 'per-day' | 'per-prayer'
  const [prayersPerDay, setPrayersPerDay] = useState(DEFAULT_PRAYERS_PER_DAY);
  const [allowUneven, setAllowUneven] = useState(true);
  const [khatamTimes, setKhatamTimes] = useState(1); // target khatam berapa kali

  const baseTotal = unit === "pages" ? totalPages : totalAyat;
  const total = baseTotal * clampInt(Number(khatamTimes), 1, 1000);
  const unitLabel = unit === "pages" ? "halaman" : "ayat";

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

  // Checklist state per day
  const [doneDays, setDoneDays] = useState(() => ({}));
  const doneCount = Object.values(doneDays).filter(Boolean).length;
  const progressPct = Math.round((doneCount / Math.max(1, plan.daysArr.length)) * 100);

  function toggleDay(day) {
    setDoneDays((prev) => ({ ...prev, [day]: !prev[day] }));
  }

  function resetChecklist() {
    setDoneDays({});
  }

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
            Bagi target khatam berdasarkan <span className="font-medium">per hari</span> atau <span className="font-medium">per habis sholat</span>.
            Bisa pakai unit <span className="font-medium">halaman</span> atau <span className="font-medium">ayat</span>.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle>Input Target</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Tabs value={unit} onValueChange={setUnit}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="pages">Halaman</TabsTrigger>
                  <TabsTrigger value="ayat">Ayat</TabsTrigger>
                </TabsList>
                <TabsContent value="pages" className="mt-4 space-y-2">
                  <Label>Total halaman (default mushaf 604)</Label>
                  <Input
                    type="number"
                    value={totalPages}
                    onChange={(e) => setTotalPages(clampInt(Number(e.target.value), 1, 1000000))}
                  />
                </TabsContent>
                <TabsContent value="ayat" className="mt-4 space-y-2">
                  <Label>Total ayat (bisa kamu ubah)</Label>
                  <Input
                    type="number"
                    value={totalAyat}
                    onChange={(e) => setTotalAyat(clampInt(Number(e.target.value), 1, 1000000))}
                  />
                </TabsContent>
              </Tabs>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Periode (hari)</Label>
                  <Input
                    type="number"
                    value={days}
                    onChange={(e) => setDays(clampInt(Number(e.target.value), 1, 366))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Target khatam (kali)</Label>
                  <Input
                    type="number"
                    value={khatamTimes}
                    onChange={(e) => setKhatamTimes(clampInt(Number(e.target.value), 1, 1000))}
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
                    type="number"
                    value={prayersPerDay}
                    onChange={(e) => setPrayersPerDay(clampInt(Number(e.target.value), 1, 10))}
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
                  <Badge variant="secondary">Total: {total} {unitLabel}</Badge>
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
                  Pembagian slot: base {plan.base} {unitLabel}{allowUneven && plan.remainder ? `, +1 untuk ${plan.remainder} slot awal` : ""}.
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
                  <div className="text-sm font-medium">Progress hari selesai</div>
                  <div className="text-xs text-muted-foreground">
                    {doneCount} / {plan.daysArr.length} hari
                  </div>
                </div>
                <div className="text-sm font-semibold">{progressPct}%</div>
              </div>
              <Progress value={progressPct} />
              <div className="flex gap-2">
                <Button variant="secondary" onClick={resetChecklist}>Reset</Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Catatan: checklist ini hanya tersimpan selama halaman tidak di-refresh (sederhana). Kalau mau disimpan permanen, bisa ditambah localStorage.
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
              {plan.daysArr.map((d) => (
                <div key={d.day} className="rounded-2xl border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={!!doneDays[d.day]}
                        onCheckedChange={() => toggleDay(d.day)}
                        id={`day-${d.day}`}
                      />
                      <Label htmlFor={`day-${d.day}`} className="cursor-pointer">
                        <span className="font-semibold">Hari {d.day}</span>
                        {d.start && d.end ? (
                          <span className="text-muted-foreground"> — {formatRange(d.start, d.end)} ({d.totalThisDay} {unitLabel})</span>
                        ) : (
                          <span className="text-muted-foreground"> — selesai</span>
                        )}
                      </Label>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{d.totalThisDay} {unitLabel}/hari</Badge>
                      {mode === "per-prayer" && (
                        <Badge variant="secondary">{plan.base} {unitLabel}/slot</Badge>
                      )}
                    </div>
                  </div>

                  {mode === "per-prayer" && (
                    <div className="mt-3 grid gap-2 md:grid-cols-5">
                      {d.slots.map((s, idx) => (
                        <div key={s.idx} className="rounded-xl bg-muted/40 p-3">
                          <div className="text-xs font-medium text-muted-foreground">{prayerName(idx)}</div>
                          <div className="mt-1 text-sm font-semibold">
                            {s.start && s.end ? formatRange(s.start, s.end) : "—"}
                          </div>
                          <div className="text-xs text-muted-foreground">{s.size} {unitLabel}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
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
              <li>
                Kalau target terasa berat, naikkan periode atau ubah unit menjadi ayat (lebih fleksibel).
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
