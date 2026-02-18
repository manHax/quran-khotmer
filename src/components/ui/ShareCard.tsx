export function ShareCard({
  title,
  subtitle,
  summary,
  url,
  accentHex,
  progressPct,
  progressLabel,
}: {
  title: string;
  subtitle: string;
  summary: string;
  url: string;
  accentHex: string;
  progressPct: number; // 0..100
  progressLabel: string; // mis. "12/29 hari" atau "40/145 slot"
}) {
  const p = Math.max(0, Math.min(100, Math.round(progressPct)));

  return (
    <div
      className="w-[1080px] h-[1080px] rounded-[48px] p-[64px] flex flex-col justify-between"
      style={{
        background:
          "radial-gradient(1200px 700px at 20% 10%, rgba(0,0,0,0.06), transparent 60%), radial-gradient(900px 600px at 80% 90%, rgba(0,0,0,0.06), transparent 60%)",
      }}
    >
      <div className="space-y-8">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl" style={{ background: accentHex }} />
          <div className="text-3xl font-semibold">quran-khotmer</div>
        </div>

        <div>
          <div className="text-6xl font-semibold leading-tight">{title}</div>
          <div className="mt-3 text-2xl text-muted-foreground">{subtitle}</div>
        </div>

        {/* Progress */}
        <div className="rounded-3xl border bg-background/70 p-6">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-xl font-semibold">Progress</div>
              <div className="mt-1 text-lg text-muted-foreground">{progressLabel}</div>
            </div>
            <div className="text-4xl font-semibold">{p}%</div>
          </div>

          {/* Bar */}
          <div className="mt-4 h-4 w-full rounded-full bg-muted">
            <div
              className="h-4 rounded-full"
              style={{ width: `${p}%`, background: accentHex }}
            />
          </div>

          <div className="mt-5 text-lg text-muted-foreground">{summary}</div>
        </div>
      </div>

      <div className="flex items-end justify-between">
        <div className="text-lg text-muted-foreground">{url}</div>
        <div className="text-lg font-semibold">📖✅</div>
      </div>
    </div>
  );
}
