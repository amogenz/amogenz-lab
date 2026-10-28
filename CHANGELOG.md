# Changelog — AMOGENZ LAB Web

> Format: `[versi] - tanggal - ringkasan perubahan`.
> Hanya rilis yang terverifikasi yang dicatat di sini.

## [1.6] - 2026-10-06

- Kredensial Supabase pindah ke environment variable Vercel, disajikan ke
  browser via endpoint baru `/api/config` (build 12:45 WIB).
- Tidak ada lagi kredensial yang tertulis di file JavaScript — rotasi kunci
  kini bisa dilakukan dari dashboard tanpa deploy ulang kode.

## [1.4] - 2026-10-06

- Papan Usulan komunitas tayang dengan backend Supabase: tabel `lab_usulan`
  (usulan, dukungan/vote, komentar realtime via Firebase).
- Tabel dipindah ke project Supabase AksaraDB karena akun yang dipakai login
  tidak punya akses ke project sebelumnya.

## [1.0] - 2026-10-06

- Rilis perdana web AMOGENZ LAB di `https://lab.amogenz.xyz/` (live ~09:05 WIB).
- Isi awal: splash + menu navigasi ala game, kartu proyek riset
  (AMOGENZ 3D World — RILIS, Naruto War — RILIS, AMO Downloader — BETA),
  AI "Zero" (asisten tanya-jawab + generator usulan eksperimen),
  Arsip Lab, dan halaman Tentang (alur riset + tiga divisi AMOGENZ).

---
*Disusun 11 Oktober 2026 dari `version.json` dan tonggak rilis yang
terverifikasi. Tidak ada nilai secret/kunci API yang ditulis di dokumen ini.*
