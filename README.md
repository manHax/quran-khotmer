# Quran Khotmer 📖

Aplikasi web progresif (PWA) untuk membantu Anda mengatur target bacaan/khatam Al-Qur'an secara terstruktur. Anda bisa merencanakan bacaan harian atau membaginya per waktu sholat (5 waktu).

## Fitur Utama ✨

- **Pembagian Target**: Bagi target khatam berdasarkan *per hari* atau *per habis sholat*.
- **Satuan Fleksibel**: Hitung target menggunakan satuan **Halaman** (default 604 halaman mushaf standar) atau **Ayat**.
- **Mode PWA (Progressive Web App)**: Bisa di-install langsung ke *homescreen* HP atau Desktop Anda (mendukung mode *offline*).
- **Checklist Interaktif**: Lacak progress harian/per-slot bacaan Anda. Data disimpan otomatis secara lokal di perangkat Anda (menggunakan *LocalStorage*).
- **Share Progress**: Bagikan pencapaian atau target harian Anda ke media sosial dalam bentuk gambar yang menarik.
- **Dark/Light Mode**: Didesain menyesuaikan kenyamanan membaca Anda, lengkap dengan kustomisasi *accent color*.
- **Quran Reader**: Dilengkapi dengan fitur baca Qur'an langsung di dalam aplikasi (termasuk jadwal sholat).

## Teknologi yang Digunakan 💻

- **React 19** + **TypeScript**
- **Vite** (Build Tool super cepat)
- **Tailwind CSS v4** (Styling)
- **Radix UI** / shadcn-ui (Komponen UI yang aksesibel)
- **Lucide React** (Ikonografi)
- **Date-fns** (Manipulasi tanggal)
- **Html-to-image** (Ekspor grafik bagikan/share)

## Menjalankan Proyek Secara Lokal 🚀

Jika Anda ingin berkontribusi atau menjalankan proyek ini di mesin Anda sendiri:

1. Clone repositori ini:
   ```bash
   git clone https://github.com/manHax/quran-khotmer.git
   ```
2. Pindah ke direktori proyek:
   ```bash
   cd quran-khotmer
   ```
3. Install dependensi (menggunakan npm, yarn, pnpm, atau bun):
   ```bash
   npm install
   ```
4. Jalankan *development server*:
   ```bash
   npm run dev
   ```
5. Buka `http://localhost:5173/` di browser Anda!

## Membangun / Build untuk Production 📦

Untuk membuat *build production* (siap *deploy*):

```bash
npm run build
```

Hasil build akan berada di direktori `/dist` dan siap di-deploy ke Vercel, Netlify, atau layanan hosting statis lainnya.
