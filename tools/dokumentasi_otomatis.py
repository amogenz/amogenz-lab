#!/usr/bin/env python3
"""Sistem Dokumentasi Otomatis Aman AMOGENZ.

Apa yang dilakukan script ini (dan apa yang TIDAK):
- MENG-AUDIT proyek: apakah README.md, ARCHITECTURE.md, CHANGELOG.md ada?
  Apakah CHANGELOG ketinggalan dibanding entri Log Lab terbaru untuk proyek itu?
- MEMBUAT DRAF saja (di ~/workspace/dokumentasi-otomatis/drafts/), dari sumber
  TERVERIFIKASI saja: judul + tanggal entri Log Lab, dan version.json proyek.
  TIDAK mengarang isi arsitektur, TIDAK mengarang tanggal/versi.
- GERBANG AUDIT BUMERANG: setiap draf, dan setiap dokumen lama yang dipindai,
  dicek pola secret / eksploitasi / peta serangan / soceng. Yang gagal gate
  TIDAK ditulis sebagai draf publik — hanya dicatat alasan + file + nomor
  baris di held/, TANPA menyalin nilai secret-nya.
- TIDAK menimpa dokumen lama, TIDAK deploy ke web publik, TIDAK push GitHub.
  Menerapkan draf ke dokumen asli tetap butuh persetujuan Bos/developer.

Jalankan (workspace, cron Muse): python3 tools/dokumentasi_otomatis.py [--selftest]
Jalankan (repo, GitHub Actions, TANPA Muse — hanya Python stdlib):
  python3 tools/dokumentasi_otomatis.py --mode repo --root . [--selftest]
  Mode repo mengaudit repo ITU SENDIRI saja (README/ARCHITECTURE/CHANGELOG
  di root repo + gate), dan membandingkan CHANGELOG dengan data/log.json
  BILA file itu ada di repo. Bila tidak ada, laporan menulis jelas
  "tanpa sumber Log Lab" — tidak mengarang. Output ke <root>/dokumentasi-otomatis/.
  --selftest: uji negatif gate (secret & kalimat eksploitasi WAJIB ditahan),
  lalu audit normal. Keluar 1 bila ada uji negatif yang lolos (bug gate).
"""
import json, os, re, sys, datetime
from pathlib import Path

HOME = Path.home()
WS = HOME / "workspace"
OUT = WS / "dokumentasi-otomatis"
DRAFTS = OUT / "drafts"
HELD = OUT / "held"
LOG = WS / "amogenz-lab-web" / "data" / "log.json"

# Proyek dalam cakupan: NAMA PROYEK di Log Lab (field proj, BUKAN tag — tag di
# log.json tidak konsisten, mis. entri Cloth ada yang bertag "lab") -> folder.
# AMO Downloader sengaja TIDAK masuk: tidak ada folder workspace khusus
# (dokumennya hanya di README Lab). Memasukkannya dengan folder tebakan = audit palsu.
PROJECTS = {
    "Kompres":       {"slug": "kompres", "folder": "kompres-amogenz", "live": "kompres.amogenz.xyz"},
    "AMOGENZ LAB":   {"slug": "lab",     "folder": "amogenz-lab-web", "live": "lab.amogenz.xyz"},
    "AMOGENZ":       {"slug": "amogenz", "folder": "amogenz-web",     "live": "amogenz.xyz"},
    "Aksara":        {"slug": "aksara",  "folder": "aksara-apk",      "live": "aksara.amogenz.xyz"},
    "Akun AMOGENZ":  {"slug": "akun",    "folder": "account-amogenz", "live": "account.amogenz.xyz"},
    "Offroad 3D":    {"slug": "offroad", "folder": "offroad-game-3d", "live": "offroad.amogenz.xyz"},
    "Nahwu OS":      {"slug": "nahwu",   "folder": "nahwu-os",        "live": None},
    "Cloth":         {"slug": "cloth",   "folder": "cloth",           "live": "cloth.amogenz.xyz"},
    "Naruto War":    {"slug": "naruto",  "folder": "naruto-war",      "live": "naruto.amogenz.xyz"},
}
DOCS = ["README.md", "ARCHITECTURE.md", "CHANGELOG.md"]

# --- Gerbang Audit Bumerang (pola, bukan nilai) ---
# Pola secret: nilai, bukan nama env var. Nama env var saja (mis. GOOGLE_API_KEY) lolos.
GATE_PATTERNS = [
    ("secret_value", re.compile(r"(?i)(api[_-]?key|password|passwd|secret|token|bearer)\s*[:=]\s*['\"]?[A-Za-z0-9_\-./+]{12,}")),
    ("bearer_token", re.compile(r"Bearer\s+[A-Za-z0-9._\-]{20,}")),
    ("github_token", re.compile(r"gh[pousr]_[A-Za-z0-9]{20,}")),
    ("aws_key", re.compile(r"AKIA[0-9A-Z]{16}")),
    ("vercel_id", re.compile(r"\b(prj|dpl|team)_[A-Za-z0-9]{10,}\b")),
    ("email_internal", re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")),
    ("exploit_lang", re.compile(r"(?i)\b(bisa dibypass|celahnya adalah|cukup lakukan|payload|reproduksi serangan|langkah eksploitasi)\b")),
    ("attack_map", re.compile(r"(?i)(database|rtbd|firestore|supabase).{0,40}(tanpa auth|tanpa autentikasi|bypass)")),
]

def gate_check(text):
    """Kembalikan list alasan gagal; kosong = lolos."""
    fails = []
    for name, pat in GATE_PATTERNS:
        if pat.search(text):
            fails.append(name)
    return fails

def parse_changelog_dates(text):
    # Cari tanggal YYYY-MM-DD di CHANGELOG
    return re.findall(r"20\d\d-\d\d-\d\d", text)

def id_date_to_iso(s):
    # "28 Okt 2026" -> "2026-10-28"
    months = {"Jan":1,"Feb":2,"Mar":3,"Apr":4,"Mei":5,"Jun":6,"Jul":7,
              "Agu":8,"Sep":9,"Okt":10,"Nov":11,"Des":12}
    m = re.match(r"(\d+)\s+(\w+)\s+(\d+)", s.strip())
    if not m: return None
    return f"{m.group(3)}-{months.get(m.group(2),0):02d}-{int(m.group(1)):02d}"

def audit():
    log_entries = []
    if LOG.exists():
        log_entries = json.loads(LOG.read_text(encoding="utf-8")).get("entries", [])
    OUT.mkdir(exist_ok=True); DRAFTS.mkdir(exist_ok=True); HELD.mkdir(exist_ok=True)
    report = {"generated": datetime.datetime.now().isoformat(), "projects": [], "held": []}
    for proj_name, meta in PROJECTS.items():
        tag = meta["slug"]
        folder = WS / meta["folder"]
        item = {"tag": tag, "nama": proj_name, "folder": meta["folder"],
                "docs": {}, "changelog_tertinggal": False, "draft": None, "gate": []}
        for doc in DOCS:
            p = folder / doc
            item["docs"][doc] = {"ada": p.exists(),
                                 "ukuran": p.stat().st_size if p.exists() else 0}
            if p.exists():
                txt = p.read_text(encoding="utf-8", errors="ignore")
                fails = gate_check(txt)
                if fails:
                    # Catat HANYA nama pola + file, TANPA menyalin baris/nilai yang dicurigai
                    report["held"].append({"file": str(p), "pola": fails,
                                           "catatan": "Dokumen lama mengandung pola yang dicurigai gate; periksa manual, jangan publikasikan ulang."})
        # CHANGELOG vs SEMUA entri Log Lab proyek ini yang lebih baru dari
        # tanggal terakhir di CHANGELOG (bukan hanya entri terbaru — kalau
        # tidak, entri di antaranya hilang dari draf).
        proj_entries = [e for e in log_entries if e.get("proj") == proj_name]
        cl_path = folder / "CHANGELOG.md"
        if proj_entries and cl_path.exists():
            cl = cl_path.read_text(encoding="utf-8", errors="ignore")
            cl_dates = parse_changelog_dates(cl)
            last_cl = max(cl_dates) if cl_dates else "0000-00-00"
            missing = [e for e in proj_entries
                       if (id_date_to_iso(e.get("date", "")) or "") > last_cl]
            missing.reverse()  # tertua dulu, seperti changelog
            if missing:
                item["changelog_tertinggal"] = True
                item["entri_hilang"] = len(missing)
                lines = [f"# DRAF CHANGELOG — {proj_name}", "",
                         "Sumber terverifikasi: entri Log Lab di bawah (judul + tanggal saja, "
                         "tidak ditambah fakta baru).",
                         "File ini HANYA draf. Jangan terbitkan sebelum dicek manusia.", ""]
                for e in missing:
                    lines.append(f"## {id_date_to_iso(e.get('date',''))} — {e.get('title')}")
                    lines.append("")
                draft_text = "\n".join(lines)
                fails = gate_check(draft_text)
                if fails:
                    report["held"].append({"file": f"draft {tag}", "pola": fails,
                                           "catatan": "Draf ditahan gate; tidak ditulis ke drafts/."})
                else:
                    draft_path = DRAFTS / f"{tag}-CHANGELOG-draft.md"
                    draft_path.write_text(draft_text, encoding="utf-8")
                    item["draft"] = str(draft_path)
        elif proj_entries and not cl_path.exists():
            item["changelog_tertinggal"] = True
            item["catatan"] = "CHANGELOG.md belum ada — buat dari template, isi dari Log Lab, jangan mengarang."
        report["projects"].append(item)
    # Laporan manusia
    lines = ["# Laporan Dokumentasi Otomatis Aman", "",
             f"Dibuat: {report['generated']}", "",
             "Aturan: audit + draf saja. TIDAK menimpa dokumen lama, TIDAK deploy publik, TIDAK push.",
             "Gerbang Audit Bumerang berlaku untuk semua draf.", ""]
    for it in report["projects"]:
        ada = ", ".join(f"{d}:{'ADA' if v['ada'] else 'HILANG'}" for d, v in it["docs"].items())
        lines.append(f"- **{it['nama']}** ({it['folder']}): {ada}"
                     + (" — CHANGELOG TERTINGGAL, draf: " + it["draft"] if it.get("draft")
                        else (" — CHANGELOG TERTINGGAL (tanpa draf)" if it["changelog_tertinggal"] else " — sinkron")))
    lines += ["", f"Ditahan gate: {len(report['held'])} item. Lihat held/ untuk daftarnya (tanpa nilai secret)."]
    (OUT / "report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    (OUT / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    return report

def audit_repo(root):
    """Mode repo (GitHub Actions): audit repo itu sendiri saja."""
    root = Path(root)
    out = root / "dokumentasi-otomatis"
    drafts = out / "drafts"
    out.mkdir(exist_ok=True); drafts.mkdir(exist_ok=True)
    log_path = root / "data" / "log.json"
    log_entries = []
    if log_path.exists():
        try:
            log_entries = json.loads(log_path.read_text(encoding="utf-8")).get("entries", [])
        except Exception:
            log_entries = []
    # Identitas repo di Log Lab: "AMOGENZ LAB" bila ada entrinya, kalau tidak
    # ada maka tidak ada pembanding CHANGELOG (jangan tebak proyek lain).
    proj_name = "AMOGENZ LAB" if any(e.get("proj") == "AMOGENZ LAB" for e in log_entries) else None
    report = {"generated": datetime.datetime.now().isoformat(), "mode": "repo",
              "root": str(root), "projects": [], "held": []}
    item = {"nama": root.name, "folder": ".", "docs": {},
            "changelog_tertinggal": False, "draft": None,
            "sumber_log_lab": bool(log_entries), "proj_log_lab": proj_name}
    for doc in DOCS:
        p = root / doc
        item["docs"][doc] = {"ada": p.exists(), "ukuran": p.stat().st_size if p.exists() else 0}
        if p.exists():
            fails = gate_check(p.read_text(encoding="utf-8", errors="ignore"))
            if fails:
                report["held"].append({"file": doc, "pola": fails,
                                       "catatan": "Dokumen mengandung pola yang dicurigai gate; periksa manual, jangan publikasikan ulang."})
    cl_path = root / "CHANGELOG.md"
    if proj_name and log_entries and cl_path.exists():
        cl = cl_path.read_text(encoding="utf-8", errors="ignore")
        cl_dates = parse_changelog_dates(cl)
        last_cl = max(cl_dates) if cl_dates else "0000-00-00"
        missing = [e for e in log_entries if e.get("proj") == proj_name
                   and (id_date_to_iso(e.get("date", "")) or "") > last_cl]
        missing.reverse()
        if missing:
            item["changelog_tertinggal"] = True
            item["entri_hilang"] = len(missing)
            lines = ["# DRAF CHANGELOG", "",
                     "Sumber terverifikasi: entri Log Lab di bawah (judul + tanggal saja, tidak ditambah fakta baru).",
                     "File ini HANYA draf. Jangan terbitkan sebelum dicek manusia.", ""]
            for e in missing:
                lines.append(f"## {id_date_to_iso(e.get('date',''))} — {e.get('title')}")
                lines.append("")
            draft_text = "\n".join(lines)
            fails = gate_check(draft_text)
            if fails:
                report["held"].append({"file": "draft", "pola": fails,
                                       "catatan": "Draf ditahan gate; tidak ditulis ke drafts/."})
            else:
                (drafts / "CHANGELOG-draft.md").write_text(draft_text, encoding="utf-8")
                item["draft"] = "dokumentasi-otomatis/drafts/CHANGELOG-draft.md"
    elif not log_entries:
        item["catatan"] = "Tanpa sumber Log Lab di repo ini (data/log.json tidak ada): hanya cek keberadaan dokumen + gate, tidak ada draf CHANGELOG."
    report["projects"].append(item)
    lines = ["# Laporan Dokumentasi Otomatis Aman (mode repo, GitHub Actions)", "",
             f"Dibuat: {report['generated']}", f"Repo: {root.name}", "",
             "Aturan: audit + draf saja. TIDAK menimpa dokumen lama, TIDAK deploy, TIDAK mengubah dokumen asli.",
             "Gerbang Audit Bumerang berlaku untuk semua draf.", ""]
    ada = ", ".join(f"{d}:{'ADA' if v['ada'] else 'HILANG'}" for d, v in item["docs"].items())
    lines.append(f"- **{item['nama']}**: {ada}"
                 + (" — CHANGELOG TERTINGGAL, draf: " + item["draft"] if item.get("draft")
                    else (" — CHANGELOG TERTINGGAL (tanpa draf)" if item["changelog_tertinggal"] else " — sinkron")))
    if item.get("catatan"):
        lines.append(f"- Catatan: {item['catatan']}")
    lines += ["", f"Ditahan gate: {len(report['held'])} item."]
    (out / "report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    (out / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    return report

def selftest():
    """Uji negatif: secret & kalimat eksploitasi WAJIB ditahan."""
    # Nilai di bawah ini SENGAJA palsu/sintetis (nol & contoh) — jangan pernah
    # ganti dengan ID/kunci asli, karena script ini ikut masuk repo publik.
    cases = {
        "secret": "apiKey: 'AIzaSy00000000000000000000000000000000'",
        "exploit": "Celahnya adalah bisa dibypass dengan cukup lakukan X maka Y, payload: {...}",
        "vercel_id": "deployment dpl_00000000000000000000",
        "email": "hubungi admin@internal.example",
    }
    bad = []
    for name, txt in cases.items():
        if not gate_check(txt):
            bad.append(name)
    # Uji positif: teks dokumentasi normal WAJIB lolos
    ok_text = "Web gratis untuk mengubah foto jadi burik ala HP jadul; file diproses di perangkat pengguna."
    if gate_check(ok_text):
        bad.append("false_positive_normal_text:" + str(gate_check(ok_text)))
    return bad

def main():
    if "--selftest" in sys.argv:
        bad = selftest()
        print("SELFTEST gate:", "GAGAL pada: " + ", ".join(bad) if bad else "LOLOS semua (4 negatif ditahan, 1 normal lolos)")
        if bad:
            sys.exit(1)
    if "--mode" in sys.argv:
        mode = sys.argv[sys.argv.index("--mode") + 1]
        root = sys.argv[sys.argv.index("--root") + 1] if "--root" in sys.argv else "."
        if mode == "repo":
            rep = audit_repo(root)
            print(f"Mode repo: {rep['projects'][0]['nama']}")
            print("- " + ", ".join(f"{d}={'ADA' if v['ada'] else 'HILANG'}" for d, v in rep["projects"][0]["docs"].items()))
            print(f"Ditahan gate: {len(rep['held'])}")
            print(f"Laporan: {Path(root) / 'dokumentasi-otomatis' / 'report.md'}")
            return
    rep = audit()
    print(f"Proyek diaudit: {len(rep['projects'])}")
    for it in rep["projects"]:
        print(f"- {it['nama']}: " + ", ".join(f"{d}={'ADA' if v['ada'] else 'HILANG'}" for d, v in it["docs"].items())
              + (f" | CHANGELOG TERTINGGAL -> {it['draft']}" if it.get("draft") else ""))
    print(f"Ditahan gate: {len(rep['held'])}")
    print(f"Laporan: {OUT/'report.md'} dan {OUT/'report.json'}")

if __name__ == "__main__":
    main()
