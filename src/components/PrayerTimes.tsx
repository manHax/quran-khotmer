import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { MapPin, Clock, Sliders, Info, Loader2, Navigation, Sun, Sunrise, Sunset, Moon, CloudSun, Timer } from "lucide-react";

// ─────────────────────────────────────────────────────────
//  ASTRONOMICAL PRAYER TIME CALCULATION
//  Metode: Hisab Hakiki Tahqiqi (Muhammadiyah)
//  Referensi: Jean Meeus "Astronomical Algorithms"
// ─────────────────────────────────────────────────────────

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

function toRad(d: number) { return d * RAD; }
function toDeg(r: number) { return r * DEG; }
function fixAngle(a: number) { return a - 360 * Math.floor(a / 360); }
function fixHour(a: number)  { return a - 24  * Math.floor(a / 24); }

// Julian Day Number
function julianDay(year: number, month: number, day: number) {
  let y = year;
  let m = month;
  if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + B - 1524.5;
}

// Sun position (low precision, sufficient for prayer times)
function sunPosition(jd: number) {
  const D = jd - 2451545.0; // Days since J2000.0

  // Mean anomaly
  const g = fixAngle(357.529 + 0.98560028 * D);
  // Mean longitude
  const q = fixAngle(280.459 + 0.98564736 * D);
  // Ecliptic longitude
  const L = fixAngle(q + 1.915 * Math.sin(toRad(g)) + 0.020 * Math.sin(toRad(2 * g)));

  // Obliquity of ecliptic
  const e = 23.439 - 0.0000004 * D;

  // Right ascension
  let RA = toDeg(Math.atan2(Math.cos(toRad(e)) * Math.sin(toRad(L)), Math.cos(toRad(L))));
  RA = fixAngle(RA) / 15; // convert to hours

  // Declination
  const sinDec = Math.sin(toRad(e)) * Math.sin(toRad(L));
  const Dec = toDeg(Math.asin(sinDec));

  // Equation of time (hours)
  const EqT = q / 15 - RA;

  return { dec: Dec, eqt: EqT };
}

// Hour angle for given altitude
function hourAngle(lat: number, dec: number, alt: number) {
  const cosH = (Math.sin(toRad(alt)) - Math.sin(toRad(lat)) * Math.sin(toRad(dec)))
             / (Math.cos(toRad(lat)) * Math.cos(toRad(dec)));
  if (cosH < -1 || cosH > 1) return null; // never rises/sets
  return toDeg(Math.acos(cosH)) / 15; // hours
}

// Ashar shadow ratio (Syafi'i = 1)
function asharAlt(lat: number, dec: number) {
  const targetShadow = 1; // Syafi'i
  const angle = toDeg(Math.atan(1 / (targetShadow + Math.tan(toRad(Math.abs(lat - dec))))));
  return angle;
}

interface PrayerTimesData {
  fajr: number | null;
  sunrise: number | null;
  dhuhr: number | null;
  asr: number | null;
  maghrib: number | null;
  isha: number | null;
}

function calcPrayerTimes(year: number, month: number, day: number, lat: number, lng: number, elev: number, tzOffset: number): PrayerTimesData {
  const jd = julianDay(year, month, day);
  const { dec, eqt } = sunPosition(jd);

  // Dhuhr (solar noon)
  const noon = 12 - eqt - lng / 15 + tzOffset;

  // Horizon correction for elevation (in degrees)
  const elevCorr = -0.0347 * Math.sqrt(elev);

  // Sun angles for each prayer (Muhammadiyah parameters)
  const FAJR_ANGLE    = -20; // Subuh
  const ISHA_ANGLE    = -18; // Isya
  const SUNRISE_ANGLE = -0.8333 + elevCorr; // refraction + disk
  const SUNSET_ANGLE  = SUNRISE_ANGLE;

  const fajrH    = hourAngle(lat, dec, FAJR_ANGLE);
  const sunriseH = hourAngle(lat, dec, SUNRISE_ANGLE);
  const asharH   = hourAngle(lat, dec, asharAlt(lat, dec));
  const sunsetH  = hourAngle(lat, dec, SUNSET_ANGLE);
  const ishaH    = hourAngle(lat, dec, ISHA_ANGLE);

  const toTime = (h: number | null, sign: number) => h !== null ? fixHour(noon + sign * h) : null;

  return {
    fajr:    toTime(fajrH, -1),
    sunrise: toTime(sunriseH, -1),
    dhuhr:   noon,
    asr:     toTime(asharH, +1),
    maghrib: toTime(sunsetH, +1),
    isha:    toTime(ishaH, +1),
  };
}

// Qibla direction from coords
function qibla(lat: number, lng: number) {
  const mLat = toRad(21.4225); // Kaabah
  const mLng = toRad(39.8262);
  const uLat = toRad(lat);
  const uLng = toRad(lng);
  const q = toDeg(Math.atan2(
    Math.sin(mLng - uLng),
    Math.cos(uLat) * Math.tan(mLat) - Math.sin(uLat) * Math.cos(mLng - uLng)
  ));
  return ((q % 360) + 360) % 360;
}

// Format hour (decimal) to "HH:MM"
function fmtTime(h: number | null): string {
  if (h === null) return "--:--";
  h = fixHour(h);
  let hh = Math.floor(h);
  let mm = Math.round((h - hh) * 60);
  if (mm === 60) {
    mm = 0;
    hh = (hh + 1) % 24;
  }
  return String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0");
}

const LOCAL_STORAGE_KEY = "quran-khotmer:prayer-settings";

interface SavedLocation {
  lat: number;
  lng: number;
  elev: number;
  tz: number;
  locationName: string;
}

export default function PrayerTimes() {
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  
  // Set default values from local storage if available
  const [settings, setSettings] = useState<SavedLocation>(() => {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.lat === "number") {
          return parsed as SavedLocation;
        }
      }
    } catch (e) {
      console.error("Failed to load prayer settings", e);
    }
    
    // Default to Yogyakarta
    return {
      lat: -7.7956,
      lng: 110.3695,
      elev: 114,
      tz: 7,
      locationName: "Yogyakarta, Indonesia"
    };
  });

  const [dateInput, setDateInput] = useState<string>(() => {
    const now = new Date();
    return now.toISOString().slice(0, 10);
  });
  
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [geocodingLoading, setGeocodingLoading] = useState(false);

  // Auto-detect timezone on first mount if not saved
  useEffect(() => {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) {
      const now = new Date();
      const tzOffset = -now.getTimezoneOffset() / 60;
      let detectedTz = 7;
      if (tzOffset === 8) detectedTz = 8;
      else if (tzOffset === 9) detectedTz = 9;
      else if (Number.isFinite(tzOffset)) detectedTz = tzOffset;

      setSettings(prev => ({ ...prev, tz: detectedTz }));
    }
  }, []);

  // Update current time every second for dynamic countdowns
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Save settings to local storage when they change
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      console.error(e);
    }
  }, [settings]);

  // Geocoding helper
  const fetchGeocode = async (latitude: number, longitude: number) => {
    setGeocodingLoading(true);
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=id`;
      const res = await fetch(url, { headers: { "Accept-Language": "id" } });
      if (res.ok) {
        const data = await res.json();
        const a = data.address;
        if (a) {
          const parts = [
            a.village || a.suburb || a.neighbourhood || a.hamlet || "",
            a.city || a.town || a.county || a.municipality || "",
            a.state || ""
          ].filter(Boolean);
          const name = parts.slice(0, 2).join(", ");
          if (name) {
            setSettings(prev => ({ ...prev, locationName: name }));
            return;
          }
        }
      }
    } catch (e) {
      console.error("Geocoding failed", e);
    } finally {
      setGeocodingLoading(false);
    }
  };

  const handleGps = () => {
    if (!navigator.geolocation) {
      alert("Browser Anda tidak mendukung deteksi lokasi.");
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const latitude = parseFloat(position.coords.latitude.toFixed(6));
        const longitude = parseFloat(position.coords.longitude.toFixed(6));
        const elevation = position.coords.altitude ? Math.round(position.coords.altitude) : 0;
        
        // Auto timezone detection
        const tzOffset = -new Date().getTimezoneOffset() / 60;
        let detectedTz = 7;
        if (tzOffset === 8) detectedTz = 8;
        else if (tzOffset === 9) detectedTz = 9;
        else if (Number.isFinite(tzOffset)) detectedTz = tzOffset;

        setSettings(prev => ({
          ...prev,
          lat: latitude,
          lng: longitude,
          elev: elevation || prev.elev,
          tz: detectedTz,
          locationName: "Mendeteksi..."
        }));

        setGpsLoading(false);
        await fetchGeocode(latitude, longitude);
      },
      (error) => {
        setGpsLoading(false);
        alert(`Gagal mendeteksi lokasi: ${error.message}`);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSettingChange = (key: keyof SavedLocation, val: any) => {
    setSettings(prev => {
      const updated = { ...prev, [key]: val };
      // If coordinates manually changed, reset or update location name
      if (key === "lat" || key === "lng") {
        updated.locationName = "";
      }
      return updated;
    });
  };

  const handleManualGeocode = () => {
    fetchGeocode(settings.lat, settings.lng);
  };

  // Convert settings and inputs to numbers for calculation
  const calculatedTimes = useMemo(() => {
    const [y, mo, d] = dateInput.split("-").map(Number);
    if (isNaN(y) || isNaN(mo) || isNaN(d)) {
      const now = new Date();
      return {
        pt: calcPrayerTimes(now.getFullYear(), now.getMonth() + 1, now.getDate(), settings.lat, settings.lng, settings.elev, settings.tz),
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        day: now.getDate()
      };
    }
    return {
      pt: calcPrayerTimes(y, mo, d, settings.lat, settings.lng, settings.elev, settings.tz),
      year: y,
      month: mo,
      day: d
    };
  }, [dateInput, settings.lat, settings.lng, settings.elev, settings.tz]);

  const { pt, year, month, day } = calculatedTimes;

  // Imsak = 10 minutes before Fajr
  const imsakH = pt.fajr !== null ? pt.fajr - 10 / 60 : null;

  // Prayer list entries
  const prayerEntries = useMemo(() => {
    return [
      { key: "imsak", name: "Imsak", h: imsakH, isPrayer: false, icon: Clock },
      { key: "fajr", name: "Subuh", h: pt.fajr, isPrayer: true, icon: Sunrise },
      { key: "sunrise", name: "Terbit", h: pt.sunrise, isPrayer: false, icon: Sun },
      { key: "dhuhr", name: "Dzuhur", h: pt.dhuhr, isPrayer: true, icon: CloudSun },
      { key: "asr", name: "Ashar", h: pt.asr, isPrayer: true, icon: Sun },
      { key: "maghrib", name: "Maghrib", h: pt.maghrib, isPrayer: true, icon: Sunset },
      { key: "isha", name: "Isya", h: pt.isha, isPrayer: true, icon: Moon },
    ];
  }, [imsakH, pt]);

  // Convert decimal hours to Date objects for matching current time
  const toDateObj = (h: number | null, y: number, m: number, d: number) => {
    if (h === null) return null;
    const fh = fixHour(h);
    const hh = Math.floor(fh);
    const mm = Math.floor((fh - hh) * 60 + 0.5);
    return new Date(y, m - 1, d, hh, mm, 0);
  };

  // Determine active and next prayer
  const activeAndNext = useMemo(() => {
    const isTodaySelected = new Date(year, month - 1, day).toDateString() === currentTime.toDateString();
    
    if (!isTodaySelected) {
      return { activeIdx: -1, nextIdx: -1, countdownSeconds: null, countdownLabel: "" };
    }

    const sholat5Keys = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
    
    // Find next prayer among today's 5 main prayers
    let nextIdx = -1;
    for (let i = 0; i < prayerEntries.length; i++) {
      const item = prayerEntries[i];
      if (!sholat5Keys.includes(item.key)) continue;
      const dt = toDateObj(item.h, year, month, day);
      if (dt && dt > currentTime) {
        nextIdx = i;
        break;
      }
    }

    let isTomorrow = false;
    let nextPrayerDt: Date | null = null;
    let nextPrayerName = "";

    if (nextIdx !== -1) {
      nextPrayerDt = toDateObj(prayerEntries[nextIdx].h, year, month, day);
      nextPrayerName = prayerEntries[nextIdx].name;
    } else {
      // If past Isya, next prayer is Fajr tomorrow
      const tomorrow = new Date(currentTime);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomY = tomorrow.getFullYear();
      const tomM = tomorrow.getMonth() + 1;
      const tomD = tomorrow.getDate();
      
      const tomPt = calcPrayerTimes(tomY, tomM, tomD, settings.lat, settings.lng, settings.elev, settings.tz);
      nextPrayerDt = toDateObj(tomPt.fajr, tomY, tomM, tomD);
      nextPrayerName = "Subuh (Besok)";
      isTomorrow = true;
      
      // Fajr index is 1 in our entries
      nextIdx = 1; 
    }

    // Determine active (current running) prayer
    // It is the prayer that has started and hasn't reached the next one.
    let activeIdx = -1;
    if (!isTomorrow) {
      // We go backwards from the nextIdx to find the latest prayer that has passed
      const passedPrayers = prayerEntries
        .slice(0, nextIdx !== -1 ? nextIdx : prayerEntries.length)
        .filter(item => sholat5Keys.includes(item.key));
        
      if (passedPrayers.length > 0) {
        const latestPassed = passedPrayers[passedPrayers.length - 1];
        activeIdx = prayerEntries.findIndex(x => x.key === latestPassed.key);
      } else {
        // Before Fajr, Isya from yesterday is still "active"
        // For simplicity, we just highlight nothing or Isya. Let's keep it clean
        activeIdx = 6; // Isya
      }
    } else {
      activeIdx = 6; // Isya is active since we are past today's Isya
    }

    // Calculate countdown
    let countdownSeconds = null;
    let countdownLabel = "";
    if (nextPrayerDt) {
      const diffMs = nextPrayerDt.getTime() - currentTime.getTime();
      countdownSeconds = Math.max(0, Math.floor(diffMs / 1000));
      
      const diffMins = Math.floor(countdownSeconds / 60);
      const hours = Math.floor(diffMins / 60);
      const mins = diffMins % 60;
      const secs = countdownSeconds % 60;

      if (hours > 0) {
        countdownLabel = `${hours} jam ${mins} menit ${isTomorrow ? "lagi" : "lagi"}`;
      } else if (mins > 0) {
        countdownLabel = `${mins} menit ${secs} detik lagi`;
      } else {
        countdownLabel = `${secs} detik lagi`;
      }
      
      countdownLabel = `${nextPrayerName}: ${countdownLabel}`;
    }

    return { activeIdx, nextIdx, countdownSeconds, countdownLabel, isTomorrow };
  }, [prayerEntries, year, month, day, currentTime, settings]);

  const { activeIdx, nextIdx, countdownLabel } = activeAndNext;

  const qiblaDirection = useMemo(() => {
    return qibla(settings.lat, settings.lng);
  }, [settings.lat, settings.lng]);

  const formattedSelectedDate = useMemo(() => {
    try {
      const [y, m, d] = dateInput.split("-").map(Number);
      return new Date(y, m - 1, d).toLocaleDateString("id-ID", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
      });
    } catch {
      return dateInput;
    }
  }, [dateInput]);

  return (
    <Card className="rounded-2xl shadow-md border overflow-hidden transition-all duration-300">
      <CardHeader className="bg-muted/30 pb-4 border-b">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-xl font-semibold flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" />
              Waktu Sholat
            </CardTitle>
            <CardDescription className="text-xs">
              Hisab Hakiki Tahqiqi (Metode Muhammadiyah • Subuh -20° • Isya -18°)
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsConfigOpen(!isConfigOpen)}
              className="text-xs h-8 gap-1.5"
            >
              <Sliders className="w-3.5 h-3.5" />
              {isConfigOpen ? "Tutup Pengaturan" : "Atur Lokasi"}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-5 space-y-6">
        {/* Dynamic Countdown Header */}
        {countdownLabel && (
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-3 text-center md:text-left transition-all animate-pulse-subtle">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-primary/10 rounded-lg text-primary">
                <Timer className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-primary uppercase tracking-wider">Menjelang Waktu Sholat</h4>
                <p className="text-sm font-medium text-foreground">{countdownLabel}</p>
              </div>
            </div>
            {settings.locationName && (
              <Badge variant="outline" className="border-primary/30 text-primary py-1 px-2.5 rounded-md text-xs font-medium bg-background/50 flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {settings.locationName}
              </Badge>
            )}
          </div>
        )}

        {/* Configurations (Collapsible) */}
        {isConfigOpen && (
          <Card className="border border-dashed p-4 rounded-xl space-y-4 bg-muted/10">
            <div className="flex items-center justify-between pb-2 border-b border-dashed">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pengaturan Koordinat & Lokasi</span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleGps}
                disabled={gpsLoading}
                className="h-8 text-xs font-medium gap-1 text-primary border-primary/30 hover:bg-primary/5"
              >
                {gpsLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <MapPin className="w-3.5 h-3.5" />
                )}
                Deteksi GPS Lokasi Saya
              </Button>
            </div>

            <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
              <div className="space-y-1.5 col-span-2 md:col-span-1">
                <Label htmlFor="lat" className="text-xs font-medium">Lintang (Latitude)</Label>
                <Input
                  id="lat"
                  type="number"
                  step="0.000001"
                  value={settings.lat}
                  onChange={(e) => handleSettingChange("lat", parseFloat(e.target.value) || 0)}
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1.5 col-span-2 md:col-span-1">
                <Label htmlFor="lng" className="text-xs font-medium">Bujur (Longitude)</Label>
                <Input
                  id="lng"
                  type="number"
                  step="0.000001"
                  value={settings.lng}
                  onChange={(e) => handleSettingChange("lng", parseFloat(e.target.value) || 0)}
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="elev" className="text-xs font-medium">Elevasi (meter)</Label>
                <Input
                  id="elev"
                  type="number"
                  min="0"
                  value={settings.elev}
                  onChange={(e) => handleSettingChange("elev", parseInt(e.target.value, 10) || 0)}
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="tz" className="text-xs font-medium">Zona Waktu (UTC)</Label>
                <select
                  id="tz"
                  value={settings.tz}
                  onChange={(e) => handleSettingChange("tz", parseFloat(e.target.value) || 7)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="7">WIB (UTC+7)</option>
                  <option value="8">WITA (UTC+8)</option>
                  <option value="9">WIT (UTC+9)</option>
                  <option value="0">GMT (UTC+0)</option>
                  <option value="1">UTC+1</option>
                  <option value="2">UTC+2</option>
                  <option value="3">UTC+3</option>
                  <option value="4">UTC+4</option>
                  <option value="5">UTC+5</option>
                  <option value="6">UTC+6</option>
                </select>
              </div>

              <div className="space-y-1.5 col-span-2 md:col-span-1">
                <Label htmlFor="prayer-date" className="text-xs font-medium">Tanggal Hijri/Masehi</Label>
                <Input
                  id="prayer-date"
                  type="date"
                  value={dateInput}
                  onChange={(e) => setDateInput(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-dashed">
              <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-muted-foreground" />
                GPS altitude otomatis diset jika didukung sensor perangkat Anda.
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleManualGeocode}
                disabled={geocodingLoading || !settings.lat || !settings.lng}
                className="h-8 text-xs font-medium gap-1"
              >
                {geocodingLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                Cari Nama Kota Koordinat Ini
              </Button>
            </div>
          </Card>
        )}

        <div className="grid gap-6 md:grid-cols-3">
          {/* Main Prayer Times Grid */}
          <div className="md:col-span-2 space-y-3">
            <div className="flex items-center justify-between pb-1 border-b">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Jadwal Hari Ini</span>
              <span className="text-xs font-medium text-primary italic">{formattedSelectedDate}</span>
            </div>

            <div className="grid gap-2 grid-cols-2 sm:grid-cols-4 md:grid-cols-2 lg:grid-cols-3">
              {prayerEntries.map((item, idx) => {
                const isActive = idx === activeIdx;
                const isUpcoming = idx === nextIdx;
                const IconComponent = item.icon;

                return (
                  <div
                    key={item.key}
                    className={`p-3 rounded-xl border transition-all duration-300 flex flex-col justify-between gap-1.5 relative overflow-hidden ${
                      isActive
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : isUpcoming
                        ? "bg-primary/5 border-primary/40 ring-1 ring-primary/20 shadow-sm"
                        : "bg-card border-border hover:border-muted-foreground/30"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-semibold tracking-wide uppercase ${isActive ? "text-primary-foreground/90" : "text-muted-foreground"}`}>
                        {item.name}
                      </span>
                      <IconComponent className={`w-4 h-4 ${isActive ? "text-primary-foreground" : "text-primary/70"}`} />
                    </div>

                    <div className="flex items-baseline justify-between mt-1">
                      <span className="text-lg font-bold tracking-tight">
                        {fmtTime(item.h)}
                      </span>
                      {isActive && (
                        <span className="absolute right-2 bottom-2 w-2 h-2 bg-red-400 rounded-full animate-ping" />
                      )}
                    </div>

                    {isUpcoming && !isActive && (
                      <span className="text-[10px] text-primary/80 font-medium mt-1">
                        Berikutnya
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Compass & Detail info column */}
          <div className="space-y-4 flex flex-col items-center justify-start border-t md:border-t-0 md:border-l pt-6 md:pt-0 md:pl-6">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground w-full text-left pb-1 border-b">
              Arah Kiblat
            </span>

            {/* Compass Visualization */}
            <div className="relative w-40 h-40 flex items-center justify-center bg-muted/20 border border-muted rounded-full shadow-inner mt-2">
              {/* Compass card background ticks */}
              <div className="absolute inset-0 rounded-full border border-dashed border-muted/50 p-2">
                <div className="relative w-full h-full text-[9px] font-bold text-muted-foreground">
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 text-red-500">U</span>
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2">S</span>
                  <span className="absolute right-0 top-1/2 -translate-y-1/2">T</span>
                  <span className="absolute left-0 top-1/2 -translate-y-1/2">B</span>
                </div>
              </div>

              {/* Compass Needle Container rotated towards Qibla */}
              <div
                className="absolute w-24 h-24 transition-transform duration-700 ease-out"
                style={{ transform: `rotate(${qiblaDirection}deg)` }}
                aria-hidden="true"
              >
                {/* Needle drawing */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-12 bg-primary">
                  {/* Arrow Tip */}
                  <div className="absolute -top-1 -left-1.5 w-3.5 h-3.5 bg-primary transform rotate-45 flex items-center justify-center">
                    {/* Small star to indicate Kaaba direction */}
                    <div className="w-1 h-1 bg-background rounded-full" />
                  </div>
                </div>
                {/* Bottom of needle */}
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0.5 h-12 bg-muted-foreground/60" />
                
                {/* Center cap */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border border-primary bg-background flex items-center justify-center shadow">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                </div>
              </div>
              
              <div className="absolute bottom-2 bg-background/80 px-2 py-0.5 rounded-md border border-border shadow-xs">
                <span className="text-[10px] font-bold text-foreground">
                  Kiblat: {qiblaDirection.toFixed(1)}°
                </span>
              </div>
            </div>

            {/* Location Details Info Box */}
            <div className="w-full text-xs space-y-2 bg-muted/20 border p-3.5 rounded-xl text-muted-foreground leading-relaxed mt-1">
              <div className="flex justify-between items-center pb-1.5 border-b border-muted">
                <span className="font-semibold text-foreground flex items-center gap-1">
                  <Navigation className="w-3.5 h-3.5 text-primary" />
                  Koordinat Aktif
                </span>
                <span className="text-[10px] bg-muted/60 text-foreground py-0.5 px-1.5 rounded-sm">
                  UTC+{settings.tz}
                </span>
              </div>
              <div className="space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span>Lintang / Bujur:</span>
                  <span className="font-mono text-foreground">{settings.lat.toFixed(4)}° / {settings.lng.toFixed(4)}°</span>
                </div>
                <div className="flex justify-between">
                  <span>Ketinggian Elevasi:</span>
                  <span className="font-mono text-foreground">{settings.elev} meter</span>
                </div>
                <div className="flex justify-between">
                  <span>Sudut Kiblat:</span>
                  <span className="font-mono text-foreground font-bold">{qiblaDirection.toFixed(2)}° dari Utara</span>
                </div>
                <div className="flex justify-between border-t border-dashed border-muted/50 pt-1 mt-1">
                  <span>Metode Ashar:</span>
                  <span className="text-foreground">Syafi'i (Rasio 1)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
