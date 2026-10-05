// js/data.js — Data 15 produk AMOGENZ 3D World (v2)
// id, name, category, zone, desc, url, color (warna zona), logo (path relatif atau null)
// style: gaya arsitektur paviliun — fold | drum | terrace | dome | ring | tent | tower | wave
//   (tiap produk punya gaya sendiri; tidak ada dua paviliun bertetangga yang kembar)

export const ZONES = {
  EDUKASI: { name: 'EDUKASI', color: '#2dd4a7', center: [-52, -52] },
  WEB:     { name: 'WEB',     color: '#3aa0ff', center: [52, -52] },
  TOOLS:   { name: 'TOOLS',   color: '#ffb020', center: [-52, 52] },
  AI:      { name: 'AI',      color: '#c084fc', center: [52, 52] },
};

export const PRODUCTS = [
  {
    id: 'buatweb',
    name: 'Buat Website Impianmu',
    category: 'Jasa • Web',
    zone: 'WEB',
    style: 'tent', // atap layar ala Google Bay View
    desc: 'Wujudkan website profesional untuk bisnis, portofolio, atau proyekmu dengan teknologi terbaik dari AMOGENZ.',
    url: 'https://buatwebsite.amogenz.xyz',
    color: '#3aa0ff',
    logo: null, // ikon globe prosedural
  },
  {
    id: 'nahwuos',
    name: 'Nahwu OS',
    category: 'Aplikasi • Android',
    zone: 'EDUKASI',
    style: 'ring', // gedung cincin ala Apple Park
    desc: 'Aplikasi Android Nahwu OS — belajar Nahwu ala pesantren dengan cara seru.',
    url: 'https://github.com/amogenz/Nahwu-OS/releases/download/Apk/NahwuOS.apk',
    color: '#2dd4a7',
    logo: 'assets/logos/nahwuos.webp',
  },
  {
    id: 'mynahwu',
    name: 'My Nahwu',
    category: 'Game • Edukasi',
    zone: 'EDUKASI',
    style: 'tower', // menara runcing ala Salesforce Tower
    desc: "My Nahwu — Makin Paham, Makin Tahu. Platform belajar Nahwu Shorof interaktif & analisis I'rob mendalam.",
    url: 'https://nahwu.amogenz.my.id/',
    color: '#2dd4a7',
    logo: 'assets/logos/my-nahwu.webp',
  },
  {
    id: 'nahwugame',
    name: 'Nahwu Game Card',
    category: 'Game • Edukasi',
    zone: 'EDUKASI',
    style: 'fold', // atap lipat dramatis
    desc: 'Cara baru belajar Nahwu & Shorof dengan mekanisme game kartu interaktif.',
    url: 'https://game-nahwu.amogenz.xyz/',
    color: '#2dd4a7',
    logo: 'assets/logos/nahwu-game.webp',
  },
  {
    id: 'tajwidgame',
    name: 'Tajwid Game',
    category: 'Game • Edukasi',
    zone: 'EDUKASI',
    style: 'dome', // kubah kaca geodesic ala Amazon Spheres
    desc: "Belajar Tajwid interaktif & menyenangkan — latihan hukum bacaan Al-Qur'an.",
    url: 'https://tajwid.amogenz.xyz/',
    color: '#2dd4a7',
    logo: 'assets/logos/tajwid-game.webp',
  },
  {
    id: 'kesan',
    name: 'Air Kesan Langitan',
    category: 'Web • Air Mineral',
    zone: 'WEB',
    style: 'wave', // atap bergelombang ala NVIDIA Voyager
    desc: 'Produk air mineral berkualitas untuk kesehatan & keberkahan.',
    url: 'https://airkesan-langitan.amogenz.xyz/',
    color: '#3aa0ff',
    logo: 'assets/logos/kesan.webp',
  },
  {
    id: 'blog',
    name: 'Blog Amogenz',
    category: 'Web • Blog',
    zone: 'WEB',
    style: 'drum', // menara drum kaca ala Steve Jobs Theater
    desc: 'Platform sharing ide berbasis blog dan tulisan panjang — sebarkan idemu.',
    url: 'https://blog.amogenz.xyz/',
    color: '#3aa0ff',
    logo: 'assets/logos/blog.webp',
  },
  {
    id: 'aksara',
    name: 'Aksara',
    category: 'Web • Sosmed',
    zone: 'WEB',
    style: 'terrace', // teras bertingkat ala Facebook MPK
    desc: 'Media sosial basic dari Amogenz — upload, komentar, dan like apa yang kamu suka.',
    url: 'https://universe.amogenz.xyz/',
    color: '#3aa0ff',
    logo: 'assets/logos/aksara.webp',
  },
  {
    id: 'telepati',
    name: 'Telepati',
    category: 'Tools • Sharing File',
    zone: 'TOOLS',
    style: 'tower', // menara runcing ala Salesforce Tower
    desc: 'Kirim file aman & anonim. Hancur otomatis dalam 7 menit.',
    url: 'https://telepati.amogenz.my.id/',
    color: '#ffb020',
    logo: 'assets/logos/telepati.webp?v=2',
  },
  {
    id: 'editno',
    name: 'Editno',
    category: 'Tools • Edit',
    zone: 'TOOLS',
    style: 'ring', // gedung cincin ala Apple Park
    desc: 'Alat edit simpel & mudah — Tinggal Jadi, Bebas Ekspresi.',
    url: 'https://editno.amogenz.xyz/',
    color: '#ffb020',
    logo: 'assets/logos/editno.webp',
  },
  {
    id: 'spec',
    name: 'Spec',
    category: 'Tools • Unduhan',
    zone: 'TOOLS',
    style: 'wave', // atap bergelombang ala NVIDIA Voyager
    desc: 'Download video YouTube, Instagram, Facebook HD/SD tanpa watermark, convert MP3 320kbps — cepat dan gratis.',
    url: 'https://spec.amogenz.xyz/',
    color: '#ffb020',
    logo: 'assets/logos/spec.webp',
  },
  {
    id: 'nahwuai',
    name: 'Nahwu AI',
    category: 'AI • Nahwu',
    zone: 'AI',
    style: 'fold', // atap lipat dramatis
    desc: 'Analisis Nahwu Shorof & I\'rab otomatis — bedah kalimat Arab dengan AI, sesuai kaidah kitab.',
    url: 'https://nahwuai.amogenz.xyz/',
    color: '#c084fc',
    logo: 'assets/logos/nahwu-ai.webp',
  },
  {
    id: 'ammotele',
    name: 'Ammo Tele',
    category: 'AI • Chatbot',
    zone: 'AI',
    style: 'tent', // atap layar ala Google Bay View
    desc: 'Chatbot Telegram 24 jam. Cepat & hemat kuota.',
    url: 'http://t.me/iammo_bot',
    color: '#c084fc',
    logo: 'assets/logos/ammotele.webp',
  },
  {
    id: 'tajwidai',
    name: 'Tajwid AI',
    category: 'Aplikasi • Android',
    zone: 'AI',
    style: 'dome', // kubah kaca geodesic ala Amazon Spheres
    desc: 'Aplikasi Android Tajwid AI — belajar tajwid interaktif.',
    url: 'https://github.com/amogenz/Tajwid/releases/download/Apk/Tajwid.Ai.apk',
    color: '#c084fc',
    logo: 'assets/logos/tajwid-game.webp',
  },
  {
    id: 'nahwucardmaster',
    name: 'Nahwu Card Master',
    category: 'Aplikasi • Android',
    zone: 'AI',
    style: 'wave', // atap bergelombang ala NVIDIA Voyager
    desc: 'Aplikasi Android Nahwu Card Master — game kartu Nahwu & Shorof.',
    url: 'https://github.com/amogenz/Game/releases/download/Apk/Nahwu-Card-Master.apk',
    color: '#c084fc',
    logo: 'assets/logos/nahwu-game.webp',
  },
];
