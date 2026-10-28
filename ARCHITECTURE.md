# Arsitektur — AMOGENZ LAB Web

> Dokumentasi ini ditulis menunaikan titah prasasti Founder AMOGENZ
> (11 Oktober 2026): *"Yang dihafal akan hilang. Yang ditulis akan lestari."*
> Cara menjalankan, cara deploy, dan daftar environment variable ada di `README.md`
> dan tidak diulang di sini — dokumen ini fokus pada struktur, alur data,
> keputusan desain beserta alasannya, dan batasan yang diketahui.

## 1. Gambaran Umum

Web statis satu halaman (`index.html`) untuk **AMOGENZ LAB** — divisi riset dan
pengembangan AMOGENZ — yang tayang di `https://lab.amogenz.xyz/`.
Dibangun dengan **HTML + CSS + JavaScript vanilla** (tanpa framework, tanpa build step),
di-deploy sebagai situs statis di **Vercel** (project `amogenz-lab`, deploy non-git
via `~/workspace/lab-deploy/deploy.py`).

Dua fungsi server-side dijalankan sebagai **Vercel Serverless Functions**:

- `api/zero.js` — otak AI "Zero" (asisten tanya-jawab + generator proposal eksperimen)
- `api/config.js` — menyajikan kredensial publik Supabase dari environment variable

Dua backend data eksternal:

- **Supabase** (project AksaraDB) — tabel `lab_usulan` untuk Papan Usulan
- **Firebase Realtime Database** (project `amogenz-inc`, region `asia-southeast1`) —
  path `lab_komen/<id-usulan>/<pushId>` untuk komentar realtime tiap usulan

## 2. Struktur Direktori

```
amogenz-lab-web/
├── index.html              Satu-satunya halaman: splash, menu, dan semua layar
│                           (proyek, zero, log, arsip, tentang). Seluruh teks
│                           konten situs tinggal di sini agar mudah diedit.
├── css/
│   └── lab.css             Tema HUD game: slate gelap + aksen hijau, rounded,
│                           mobile-first (lebar maks 620px). Dipanggil dengan
│                           ?v=5 untuk cache-busting.
├── js/
│   └── lab.js              Router layar, chat Zero, generator usulan, papan
│                           usulan (Supabase), voting, komentar realtime
│                           (Firebase). Dipanggil dengan ?v=4.
├── api/
│   ├── zero.js             Serverless: Zero AI multi-model, mode tanya|usulkan.
│   │                       Kunci API dibaca dari env Vercel (server-side).
│   └── config.js           Serverless: GET /api/config mengembalikan URL +
│                           ANON key Supabase dari env. Header no-store.
├── assets/
│   ├── poster-lab.jpg      Poster resmi (splash + og:image)
│   ├── logo-lab.jpg        Logo (topbar, avatar Zero, tentang, JSON-LD)
│   └── favicon.jpg         Favicon
├── version.json            Penanda build. WAJIB diperbarui tiap deploy agar
│                           banner "Pembaruan tersedia" muncul di HP pengunjung.
├── vercel.json             Header cache: HTML selalu no-cache; file di
│                           css/, js/, assets/ boleh di-cache lama (immutable)
│                           karena memakai nomor versi ?v=.
├── supabase-lab.sql        Migrasi sekali jalan: membuat tabel lab_usulan +
│                           policy RLS + index. Dijalankan via SQL Editor
│                           dashboard Supabase, bukan otomatis.
├── firebase-rules-lab.json Aturan keamanan path lab_komen. WAJIB digabung ke
│                           rules Firebase yang sudah ada (jangan replace
│                           rules milik Aksara).
├── robots.txt              Mengizinkan semua crawler, termasuk crawler AI
│                           (GPTBot, ClaudeBot, PerplexityBot, dll).
├── sitemap.xml             Satu URL: https://lab.amogenz.xyz/
└── llms.txt                Ringkasan situs untuk AI crawler (tentang, proyek,
                            Zero, arsip).
```

Catatan: file binary di `assets/` tidak ikut push via konektor GitHub
(konektor hanya untuk file teks) — aset binary di-deploy lewat upload Vercel.

## 3. Alur Data

### 3.1 Navigasi layar (murni client-side)

Tidak ada router URL dan tidak ada framework. `js/lab.js` menyimpan daftar layar
(`splash`, `menu`, `proyek`, `zero`, `log`, `arsip`, `tentang`) dan fungsi `go(name)`
yang menyalakan class `active` pada layar tujuan lalu mematikan yang lain.

```
klik [data-go] / btn-enter
  -> go("menu")
  -> toggle class .active pada <section>
  -> scroll ke atas
```

Khusus layar `zero`: pertama kali dibuka memanggil `bootZero()` (sapaan pembuka)
dan `loadPapan()` (memuat Papan Usulan sekali saja, dijaga flag `go._papanLoaded`).
Tombol "USULKAN KE ZERO" di kartu terkunci memakai `go("zero")` + `switchTab("usulkan")`.

### 3.2 Zero AI — tanya jawab

```
browser (tab TANYA ZERO)
  -> POST /api/zero  { mode:"tanya", message, history: 6 terakhir }
  -> api/zero.js: validasi (POST saja, pesan 1..2000 karakter)
  -> think(prompt): coba otak satu per satu sampai berhasil
       1. Groq  llama-3.3-70b-versatile
       2. Groq  gemma2-9b-it
       3. OpenRouter  google/gemma-3-27b-it:free
       4. OpenRouter  meta-llama/llama-3.3-70b-instruct:free
       5. Gemini 2.5 Flash            (terakhir: paling sering kena limit)
     Yang gagal -> lanjut ke berikutnya. Semua gagal -> 503 ZERO_OFFLINE.
  -> prompt = PERSONA + KNOWLEDGE + 6 riwayat terakhir + pesan user
  -> { reply }  (dipotong maks 2000 karakter)
  -> browser: tampilkan via esc() + <br>, simpan ke chatHistory
```

Pengetahuan Zero (proyek, status, divisi, arsip) bukan diambil dari database,
melainkan konstanta `KNOWLEDGE` di dalam `api/zero.js`. Kalau status proyek
berubah, yang diedit adalah konstanta itu lalu deploy ulang.

Jika tidak ada satu pun kunci API terpasang di env Vercel, endpoint menjawab
`503 { error: "ZERO_OFFLINE" }` dan browser menampilkan pesan "belum terhubung
ke otak".

### 3.3 Generator usulan eksperimen + Papan Usulan (Supabase)

```
browser (tab USULKAN EKSPERIMEN)
  -> validasi client: ide min. 10 karakter + lolos filter kata kasar
  -> POST /api/zero  { mode:"usulkan", message: ide }
  -> api/zero.js: minta model mengembalikan HANYA JSON
     { nama, kategori, ringkasan, fitur[], tantangan[], estimasi }
  -> extractJson(): buang blok ``` lalu parse objek JSON pertama
  -> browser: tampilkan draf proposal + tombol TERBITKAN / BUANG
  -> klik TERBITKAN:
       GET /api/config  ->  { url, anonKey }   (dari env, header no-store)
       POST {url}/rest/v1/lab_usulan  (Supabase REST, header apikey+Bearer)
         { nama, kategori, ringkasan, fitur, tantangan, estimasi, ide_asli, oleh }
```

Papan Usulan (tab PAPAN) memuat daftar lewat:

```
GET {url}/rest/v1/lab_usulan?select=id,nama,kategori,ringkasan,oleh,dukungan,created_at
    &order=dukungan.desc&order=created_at.desc&limit=50
```

Voting dilakukan dengan `PATCH /rest/v1/lab_usulan?id=eq.<id>` berisi
`{ dukungan: <angka_lama+1> }`. ID yang sudah didukung dicatat di
`localStorage` (`lab_voted`) agar tombol berubah menjadi "DIDUKUNG".

Skema tabel `lab_usulan` (lihat `supabase-lab.sql`): `id` (uuid),
`nama`, `kategori`, `ringkasan`, `fitur` (jsonb), `tantangan` (jsonb),
`estimasi`, `ide_asli`, `oleh` (default `'anonim'`), `dukungan` (default 0),
`status` (default `'usulan'`), `created_at`. RLS aktif dengan tiga policy
publik: baca (select), tambah (insert), dukung (update). Tidak ada policy delete.

### 3.4 Komentar usulan (Firebase Realtime Database)

Komentar memakai project Firebase yang sama dengan Aksara (`amogenz-inc`):

```
buka komen-toggle pada satu usulan
  -> toggleKomen(usulanId)
  -> onChildAdded(ref(db, "lab_komen/" + usulanId))
  -> setiap komentar baru langsung muncul (realtime), penghitung diperbarui

kirim komentar
  -> validasi: teks 2..400 karakter, nama maks 30, lolos filter kata kasar
  -> rate limit client: maks 1 komentar per 8 detik per usulan
  -> push(ref(db, "lab_komen/" + usulanId), { nama, teks, waktu })
```

Aturan di `firebase-rules-lab.json`: baca publik, tulis hanya boleh
**insert** (`!data.exists()` — tidak bisa edit/hapus), dan data wajib tepat
tiga field (`nama` string 1..30 char, `teks` string 1..400 char,
`waktu` number). Firebase SDK v10.8.0 dimuat via dynamic `import()` dari CDN
gstatic; kalau gagal dimuat, fitur komentar nonaktif dengan pesan yang jelas.

### 3.5 Strategi cache

`vercel.json` membagi dua perlakuan:

- `*.html` -> `Cache-Control: no-cache` (browser selalu cek ulang)
- `css/*`, `js/*`, `assets/*` -> `public, max-age=31536000, immutable`
  (boleh disimpan setahun karena nama URL-nya berubah tiap isi berubah)

Karena itu setiap perubahan isi `lab.css`/`lab.js` WAJIB menaikkan nomor
`?v=` di `index.html` (saat ini `css/lab.css?v=5`, `js/lab.js?v=4`).
`version.json` diperbarui tiap deploy agar banner "Pembaruan tersedia" muncul.

## 4. Keputusan Desain Penting & Alasannya

1. **Vanilla HTML/CSS/JS tanpa framework.**
   Alasan: situs ini kontennya statis dan interaksinya sederhana (toggle layar,
   fetch API). Tanpa framework berarti tanpa build step, file kecil, dan cepat
   dibuka di HP kentang. Konten teks seluruhnya di `index.html` sehingga
   non-programmer pun bisa mengeditnya.

2. **Satu file `index.html` berisi semua layar (ala MPA rasa SPA).**
   Alasan: navigasi instan tanpa reload, dan struktur "splash -> pilih misi"
   meniru menu game — sesuai identitas lab sebagai tempat bereksperimen.
   Trade-off yang disadari: file HTML membesar seiring konten bertambah.

3. **Kunci API AI hanya dibaca server-side dari env Vercel.**
   Alasan: `api/zero.js` berjalan di server, jadi `GOOGLE_API_KEY`,
   `GROQ_API_KEY`, `OPENROUTER_API_KEY` tidak pernah sampai ke browser.
   Ini aturan keras AMOGENZ: kredensial di environment variable, bukan hard-code.

4. **Kredensial Supabase disajikan via `/api/config`, bukan hard-code di JS.**
   Alasan: URL dan ANON key bisa dirotasi dari dashboard Vercel tanpa
   deploy ulang kode. Yang disajikan hanya ANON key (publik, proteksinya
   lewat RLS); service-role key tidak pernah diekspos. Header `no-store`
   agar respons config tidak di-cache.

5. **Dua database untuk dua kebutuhan berbeda.**
   Alasan: Papan Usulan butuh query terstruktur (urut berdasar dukungan,
   limit 50) — cocok untuk Supabase/Postgres. Komentar butuh realtime
   murah tanpa server tambahan — cocok untuk Firebase RTDB yang project-nya
   (`amogenz-inc`) memang sudah ada dan dipakai Aksara.

6. **Rantai fallback multi-model, semuanya gratis.**
   Alasan: tanpa biaya infrastruktur (aturan Bos). Urutan disusun dari yang
   limitnya paling longgar (Groq) ke yang paling sering kena limit
   (Gemini 2.5 Flash, ditaruh terakhir). Satu model tumbang tidak mematikan
   Zero — pindah otomatis ke berikutnya.

7. **Pengetahuan Zero sebagai konstanta di kode, bukan database.**
   Alasan: datanya kecil, jarang berubah, dan harus selalu konsisten dengan
   isi web. Satu sumber kebenaran (`KNOWLEDGE` di `api/zero.js`) yang
   diperbarui manual saat status proyek berubah, lalu deploy ulang.

8. **Filter kata kasar client-side + validasi server-side di Firebase Rules.**
   Alasan: filter client memberi umpan balik instan yang ramah ("lab ini
   tempat berkarya"). Keamanan yang sesungguhnya dijaga di Rules
   (batas panjang, tipe data, insert-only) karena validasi client bisa
   di-bypass dari console browser.

9. **Voting tanpa login, anti-dobel via `localStorage`.**
   Alasan: gesekan nol — pengunjung bisa mendukung tanpa daftar.
   Trade-off yang disadari: bukan anti-curang yang kuat (lihat Batasan).

10. **Ikon SVG, tanpa emoji.**
    Alasan: aturan tetap AMOGENZ — seluruh ikon UI wajib SVG/gambar.
    Menu memakai chip ikon SVG inline.

11. **SEO + ramah AI crawler (JSON-LD, `llms.txt`, `robots.txt`, `sitemap.xml`).**
    Alasan: lab ingin ditemukan — oleh manusia via Google (terverifikasi di
    Search Console) maupun oleh asisten AI via `llms.txt` dan schema
    `ResearchOrganization`. `robots.txt` secara eksplisit mengizinkan
    GPTBot, ClaudeBot, PerplexityBot, dan sejenisnya.

12. **Desain HUD game, mobile-first, dark.**
    Alasan: identitas lab ("PILIH MISI", badge status RILIS/BETA/TERKUNCI).
    Lebar konten dibatasi 620px dan memakai `safe-area-inset` agar nyaman
    di HP. Hijau (`#3dff73`) dipakai hemat sebagai aksen di atas slate gelap.

## 5. Batasan yang Diketahui

- **Filter kata kasar hanya di client.** Ini filter kesopanan, bukan
  benteng keamanan — validasi server-side dalam rencana.
- **Voting perlu penguatan anti-dobel.** Status "sudah mendukung" hanya
  disimpan di `localStorage` per browser; angka dihitung read-then-write
  sehingga rawan race condition. Mekanisme yang lebih kuat dalam rencana.
- **Policy Supabase perlu pengetatan.** Kebijakan akses saat ini longgar;
  autentikasi dan pembatasan tulis dalam rencana perbaikan.
- **Komentar tanpa moderasi dan tanpa hapus.** Rules Firebase hanya
  mengizinkan insert; tidak ada edit, tidak ada hapus, tidak ada
  penanda spam. Pembersihan dilakukan manual dari console.
- **Zero tanpa rate limit per pengguna.** Endpoint `/api/zero` terbuka;
  satu-satunya rem adalah batas 2000 karakter per pesan dan kuota
  gratis tiap provider AI. Penyalahgunaan berulang bisa menghabiskan
  kuota dan membuat Zero offline untuk semua orang (`ZERO_OFFLINE`).
- **Ketergantungan pada env Vercel.** Tanpa `GOOGLE_API_KEY` /
  `GROQ_API_KEY` / `OPENROUTER_API_KEY`, Zero mati total. Tanpa
  `SUPABASE_URL` / `SUPABASE_ANON_KEY`, Papan Usulan mati total.
  Kunci-kunci ini dipasang manual di dashboard Vercel.
- **Deploy non-git via script.** Tidak ada auto-deploy dari push repo;
  deploy dijalankan manual lewat `~/workspace/lab-deploy/deploy.py`.
  Lupa menjalankan script = repo baru, web lama.
- **Teks versi di splash ditulis manual** (`v1.2` di `index.html`).
  Bisa basi kalau lupa diperbarui — sumber kebenaran versi adalah
  `version.json`, bukan teks di HTML.
- **Migrasi Supabase manual.** `supabase-lab.sql` dijalankan sekali via
  SQL Editor dashboard. Kalau tabel belum dibuat, Papan Usulan menampilkan
  pesan "koneksi database gagal" — bukan error yang jelas bagi pengunjung.
- **Akurasi pengetahuan Zero tergantung edit manual.** Konstanta
  `KNOWLEDGE` di `api/zero.js` harus diperbarui tiap ada perubahan status
  proyek; kalau lupa, Zero menjawab dengan info basi.

---
*Terakhir diperbarui: 11 Oktober 2026 — disusun dari pembacaan langsung
kode sumber (`index.html`, `css/lab.css`, `js/lab.js`, `api/zero.js`,
`api/config.js`, `vercel.json`, `version.json`, `supabase-lab.sql`,
`firebase-rules-lab.json`, `robots.txt`, `sitemap.xml`, `llms.txt`).*
