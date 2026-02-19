import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ApiResp<T> = { code: number; status: string; data: T };

type ReadMode = "surah" | "juz" | "page";

type SurahItem = {
  number: number;
  name: string;
  englishName: string;
  numberOfAyahs: number;
};

type Edition = {
  identifier: string;
  language: string;
  type: string;
  englishName?: string;
  name?: string;
};

type Ayah = {
  number: number; // global id
  text: string;
  numberInSurah: number;
  juz?: number;
  page?: number;
  surah: { number: number; englishName: string; name: string };
};

type Container = { ayahs: Ayah[]; surah?: any };

type SurahEditionData = {
  edition: Edition;
  surah: SurahItem;
  ayahs: Ayah[];
};

type LastRead = {
  mode: ReadMode;
  ref: number; // surahNo / juzNo / pageNo
  surah: number;
  ayah: number; // numberInSurah
  at: number;
};

const API_BASE = "https://api.alquran.cloud/v1";
const AR_EDITION = "quran-uthmani";
const LASTREAD_KEY = "quran-khotmer:lastread:v2";

async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as ApiResp<T>;
  if (json?.status !== "OK") throw new Error(`API status: ${json?.status ?? "unknown"}`);
  return json.data;
}

function loadLastRead(): LastRead | null {
  try {
    const raw = localStorage.getItem(LASTREAD_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LastRead;
  } catch {
    return null;
  }
}

function saveLastRead(v: LastRead) {
  try {
    localStorage.setItem(LASTREAD_KEY, JSON.stringify(v));
  } catch {
    // ignore
  }
}

function clamp(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function modeLabel(m: ReadMode) {
  if (m === "page") return "Halaman";
  if (m === "juz") return "Juz";
  return "Surah";
}

function maxRef(m: ReadMode) {
  if (m === "page") return 604;
  if (m === "juz") return 30;
  return 114;
}

function ayahAnchorId(surah: number, ayah: number) {
  return `ayah-${surah}-${ayah}`;
}

export default function QuranReader() {
  const initialLast = useMemo(() => loadLastRead(), []);
  const [surahs, setSurahs] = useState<SurahItem[]>([]);

  const [mode, setMode] = useState<ReadMode>(initialLast?.mode ?? "surah");
  const [ref, setRef] = useState<number>(initialLast?.ref ?? 1);

  const [showId, setShowId] = useState(true);
  const [idEditions, setIdEditions] = useState<Edition[]>([]);
  const [idEdition, setIdEdition] = useState<string>("");

  const [arabAyahs, setArabAyahs] = useState<Ayah[]>([]);
  const [idAyahs, setIdAyahs] = useState<Ayah[]>([]);

  const [lastRead, setLastRead] = useState<LastRead | null>(initialLast);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const scrollOnceRef = useRef(false);

  // Load surah list + Indonesian translation editions
  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        setErr("");
        const s = await apiGet<SurahItem[]>("/surah", ac.signal);
        setSurahs(s);

        const e = await apiGet<Edition[]>("/edition?language=id&type=translation", ac.signal);
        setIdEditions(e);
        setIdEdition(e?.[0]?.identifier ?? "");
      } catch (e: any) {
        setErr(e?.message ?? "Gagal load data awal");
      }
    })();
    return () => ac.abort();
  }, []);

  // Load content by mode/ref
  useEffect(() => {
    const safeRef = clamp(ref, 1, maxRef(mode));
    if (safeRef !== ref) setRef(safeRef);

    if (showId && !idEdition) return;

    const ac = new AbortController();
    (async () => {
      try {
        setLoading(true);
        setErr("");

        scrollOnceRef.current = false;

        if (mode === "surah" && showId) {
          // Surah supports multiple editions directly
          const data = await apiGet<SurahEditionData[]>(
            `/surah/${safeRef}/editions/${AR_EDITION},${encodeURIComponent(idEdition)}`,
            ac.signal
          );
          setArabAyahs(data?.[0]?.ayahs ?? []);
          setIdAyahs(data?.[1]?.ayahs ?? []);
        } else {
          // page/juz/surah single edition
          const basePath =
            mode === "page"
              ? `/page/${safeRef}`
              : mode === "juz"
              ? `/juz/${safeRef}`
              : `/surah/${safeRef}`;

          const [ar, id] = await Promise.all([
            apiGet<Container>(`${basePath}/${AR_EDITION}`, ac.signal),
            showId ? apiGet<Container>(`${basePath}/${encodeURIComponent(idEdition)}`, ac.signal) : Promise.resolve(null),
          ]);

          setArabAyahs(ar?.ayahs ?? []);
          setIdAyahs(id?.ayahs ?? []);
        }
      } catch (e: any) {
        setErr(e?.message ?? "Gagal load bacaan");
        setArabAyahs([]);
        setIdAyahs([]);
      } finally {
        setLoading(false);
      }
    })();

    return () => ac.abort();
  }, [mode, ref, showId, idEdition]);

  // Auto-scroll to lastRead when same mode/ref loaded
  useEffect(() => {
    if (!arabAyahs.length) return;
    if (!lastRead) return;
    if (lastRead.mode !== mode || lastRead.ref !== ref) return;
    if (scrollOnceRef.current) return;

    const el = document.getElementById(ayahAnchorId(lastRead.surah, lastRead.ayah));
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      scrollOnceRef.current = true;
    }
  }, [arabAyahs.length, lastRead, mode, ref]);

  const headerTitle = useMemo(() => {
    if (mode === "surah") {
      const s = surahs.find((x) => x.number === ref);
      return s ? `${s.number}. ${s.englishName} (${s.name})` : `Surah ${ref}`;
    }
    if (mode === "juz") return `Juz ${ref}`;
    return `Halaman ${ref} / 604`;
  }, [mode, ref, surahs]);

  function markLastRead(surahNum: number, ayahInSurah: number) {
  if (!surahNum || !ayahInSurah) return;

  const v: LastRead = {
    mode,
    ref,
    surah: surahNum,
    ayah: ayahInSurah,
    at: Date.now(),
  };

  setLastRead(v);
  saveLastRead(v);
}

  function continueLastRead() {
    if (!lastRead) return;
    setMode(lastRead.mode);
    setRef(lastRead.ref);
    // scroll will happen after load; also highlight already tracked
  }

  const safeRef = clamp(ref, 1, maxRef(mode));

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader>
        <div className="flex flex-col gap-1">
          <CardTitle>Baca Al-Qur’an</CardTitle>
          <div className="text-sm text-muted-foreground">
            Mode {modeLabel(mode)} • klik nomor ayat untuk menyimpan “terakhir dibaca”.
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {err ? (
          <div className="rounded-xl border p-3 text-sm">
            <div className="font-medium">Error</div>
            <div className="text-muted-foreground">{err}</div>
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2 md:col-span-2">
            <Label>Mode</Label>
            <Tabs value={mode} onValueChange={(v) => setMode(v as ReadMode)}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="surah">Surah</TabsTrigger>
                <TabsTrigger value="juz">Juz</TabsTrigger>
                <TabsTrigger value="page">Halaman</TabsTrigger>
              </TabsList>
            </Tabs>

            {mode === "surah" ? (
              <>
                <Label className="mt-3 block">Surah</Label>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={safeRef}
                  onChange={(e) => setRef(Number(e.target.value))}
                  disabled={!surahs.length || loading}
                >
                  {surahs.map((s) => (
                    <option key={s.number} value={s.number}>
                      {s.number}. {s.englishName} ({s.name})
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <>
                <Label className="mt-3 block">{mode === "juz" ? "Nomor Juz" : "Nomor Halaman"}</Label>
                <div className="flex gap-2">
                  <Button type="button" variant="secondary" onClick={() => setRef((v) => clamp(v - 1, 1, maxRef(mode)))} disabled={loading}>
                    Prev
                  </Button>
                  <input
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    type="number"
                    value={safeRef}
                    min={1}
                    max={maxRef(mode)}
                    onChange={(e) => setRef(Number(e.target.value))}
                  />
                  <Button type="button" variant="secondary" onClick={() => setRef((v) => clamp(v + 1, 1, maxRef(mode)))} disabled={loading}>
                    Next
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground">
                  Max: {maxRef(mode)} {mode === "page" ? "(AlQuran Cloud pakai 604 halaman)" : ""}
                </div>
              </>
            )}
          </div>

          <div className="space-y-2">
            <Label>Terjemah Indonesia</Label>
            <div className="flex items-center justify-between rounded-xl border p-3">
              <div className="text-sm">Tampilkan</div>
              <Switch checked={showId} onCheckedChange={setShowId} />
            </div>

            {showId && (
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={idEdition}
                onChange={(e) => setIdEdition(e.target.value)}
                disabled={!idEditions.length || loading}
              >
                {idEditions.map((ed) => (
                  <option key={ed.identifier} value={ed.identifier}>
                    {ed.englishName ?? ed.name ?? ed.identifier}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {lastRead ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm">
            <div className="text-muted-foreground">
              Terakhir dibaca:{" "}
              <span className="font-medium text-foreground">
                {modeLabel(lastRead.mode)} {lastRead.ref} • {lastRead.surah}:{lastRead.ayah}
              </span>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={continueLastRead}>
              Lanjutkan
            </Button>
          </div>
        ) : null}

        <div className="rounded-2xl border">
          <div className="flex items-center justify-between border-b px-4 py-3 text-sm">
            <div className="text-muted-foreground">{loading ? "Loading..." : headerTitle}</div>
            <div className="text-xs text-muted-foreground">
              Arab: {AR_EDITION}
              {showId ? ` • ID: ${idEdition || "—"}` : ""}
            </div>
          </div>

          <div className="p-4 space-y-3">
            {arabAyahs.map((a, idx) => {
  const idA = showId ? idAyahs?.[idx] : undefined;

  const surahNum =
    a?.surah?.number ??
    idA?.surah?.number ??
    0;

  const ayahInSurah =
    a?.numberInSurah ??
    idA?.numberInSurah ??
    0;

  const anchorId =
    surahNum && ayahInSurah
      ? ayahAnchorId(surahNum, ayahInSurah)
      : `ayah-global-${a?.number ?? idx}`;

  const idText = showId ? (idA?.text ?? "") : "";

  const isLast =
    !!lastRead &&
    lastRead.mode === mode &&
    lastRead.ref === ref &&
    lastRead.surah === surahNum &&
    lastRead.ayah === ayahInSurah;

  return (
    <div
      key={`${a?.number ?? idx}`}
      id={anchorId}
      className={`rounded-xl border p-3 ${isLast ? "ring-2 ring-primary/40" : ""}`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => markLastRead(surahNum, ayahInSurah)}
          className={`min-w-14 rounded-md border px-2 py-1 text-xs font-semibold ${
            isLast ? "bg-primary text-primary-foreground" : "bg-background"
          }`}
          title="Klik untuk simpan terakhir dibaca"
        >
          {mode === "surah"
            ? (ayahInSurah || "—")
            : (surahNum && ayahInSurah ? `${surahNum}:${ayahInSurah}` : "—")}
        </button>

        <div className="flex-1">
          <div style={{ direction: "rtl" }} className="font-quran text-2xl leading-relaxed">
            {a?.text ?? ""}
          </div>

          {showId && (
            <div className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {idText || "—"}
            </div>
          )}

          <div className="mt-2 text-xs text-muted-foreground">
            {a?.page ? `Page ${a.page} • ` : ""}
            {a?.juz ? `Juz ${a.juz} • ` : ""}
            {a?.surah?.englishName ?? a?.surah?.name ?? ""}
          </div>
        </div>
      </div>
    </div>
  );
})}


            {!loading && !arabAyahs.length ? <div className="text-sm text-muted-foreground">Tidak ada data ayat.</div> : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
