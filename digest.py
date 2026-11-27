"""Ringkasan kinerja berkala (mingguan/bulanan) UP3 Mamuju.

Membaca Supabase (kunci service), menghitung capaian s.d. 31 Desember seperti di Beranda dashboard
(susut, perolehan P2TL, peremajaan kWh tua) + hitrate pemeriksaan TO, lalu:
  - selalu mencetak ke log dan ke ringkasan job GitHub Actions;
  - bila secret TELEGRAM_BOT_TOKEN dan TELEGRAM_CHAT_ID ada, mengirim ke grup/obrolan Telegram.
WhatsApp tidak bisa dikirim otomatis tanpa layanan API berbayar; teks yang sama bisa disalin dari Beranda (Bagikan WhatsApp).
"""
from __future__ import annotations

import os
import re
import sys
from datetime import date

import requests

from sync_drive import Supa

YEAR = date.today().year
ULPS = ["Manakarra", "Pasangkayu", "Majene", "Wonomulyo", "Polewali", "Mamasa"]
UNIT = {"32910": "Manakarra", "32920": "Pasangkayu", "32930": "Majene", "32940": "Wonomulyo", "32950": "Polewali", "32960": "Mamasa"}


def key(n) -> str:
    return re.sub(r"^ULP\s+", "", str(n or "").upper()).strip()


def fmt(v, d=0) -> str:
    s = f"{v:,.{d}f}"
    return s.replace(",", "X").replace(".", ",").replace("X", ".")


def select_all(sb: Supa, table: str, cols: str, extra: str = "") -> list:
    out, off = [], 0
    while True:
        rows = sb.select(table, f"select={cols}&limit=1000&offset={off}{extra}")
        out += rows
        if len(rows) < 1000:
            return out
        off += 1000


def tul(sb: Supa, id_: str):
    r = sb.select("tul_data", f"select=data&id=eq.{id_}")
    return r[0]["data"] if r else None


def line(name, r, t, unit) -> str:
    return f"{name}: {fmt(r)} {unit}" + (f" dari {fmt(t)} ({fmt(r / t * 100, 1)}%)" if t else " (target belum diisi)")


def build(sb: Supa) -> str:
    frac = (date.today() - date(YEAR, 1, 1)).days / 365
    L = [f"*Kinerja UP3 Mamuju* — {date.today().strftime('%d/%m/%Y')}", f"Target s.d. 31 Des {YEAR} · waktu berjalan {fmt(frac * 100)}%", ""]

    # susut distribusi
    try:
        rep = sb.select("susut_reports", "select=file&order=file.asc")
        f = rep[-1]["file"]
        sm = sb.select("susut_sheets", f"select=data&file=eq.{f}&idx=eq.-1")[0]["data"]
        up = sm["up3"]
        kum = up.get("kum") if up.get("kum") is not None else up["kumulatif"][sm["last"]]
        cap = up["trg"] / kum * 100 if kum and up.get("trg") else None
        L.append(f"1. Susut distribusi: {fmt(kum, 2)}% (target {fmt(up['trg'], 2)}%)" + (f" → capaian {fmt(cap, 1)}%" if cap else ""))
        over = [u["name"] for u in sm["units"] if u.get("gap") is not None and u["gap"] > 0.005]
        if over:
            L.append("   ULP di atas target: " + ", ".join(n.title() for n in over))
    except Exception as e:  # satu sumber gagal tidak menghalangi yang lain
        L.append(f"1. Susut distribusi: data belum tersedia ({e})")

    # P2TL
    ts = None
    try:
        ts = tul(sb, "p2tl_ts")
        tg = select_all(sb, "ts_targets", "ulp,bln,target")
        iu, ik, ig = (ts["cols"].index(c) for c in ("ulp", "kwh", "tgl"))
        T, R = {}, {}
        for x in tg:
            if str(x["bln"]).startswith(str(YEAR)):
                T[key(x["ulp"])] = T.get(key(x["ulp"]), 0) + float(x["target"])
        for r in ts["rows"]:
            if str(r[ig] or "").startswith(str(YEAR)):
                R[key(r[iu])] = R.get(key(r[iu]), 0) + (r[ik] or 0)
        tt, tr = sum(T.get(key(u), 0) for u in ULPS), sum(R.get(key(u), 0) for u in ULPS)
        L.append("2. " + line("Perolehan P2TL UP3", tr, tt, "kWh"))
        low = sorted(((R.get(key(u), 0) / T[key(u)] * 100, u) for u in ULPS if T.get(key(u))))[:2]
        if low:
            L.append("   Perlu dikejar: " + ", ".join(f"{u} {fmt(c, 1)}%" for c, u in low))
    except Exception as e:
        L.append(f"2. Perolehan P2TL: data belum tersedia ({e})")

    # ganti meter tua
    try:
        gm = tul(sb, "gm")
        tg = select_all(sb, "gm_targets", "ulp,bln,target")
        tt = sum(float(x["target"]) for x in tg if str(x["bln"]).startswith(str(YEAR)))
        tr = sum(u.get("tua", 0) for k, m in gm["months"].items() if k.startswith(str(YEAR)) for u in m["ulp"])
        L.append("3. " + line("Meter tua diganti", tr, tt, "meter"))
    except Exception as e:
        L.append(f"3. Peremajaan kWh tua: data belum tersedia ({e})")

    # hitrate TO
    try:
        ins = select_all(sb, "to_inspections", "idpel,hasil")
        done = [r for r in ins if r["hasil"] != "akses"]
        hit = [r for r in ins if r["hasil"] == "temuan"]
        ulang = sum(1 for r in ins if r["hasil"] == "akses")
        L.append(f"4. Hitrate TO: {len(hit)} temuan dari {len(done)} pemeriksaan selesai" + (f" ({fmt(len(hit) / len(done) * 100, 1)}%)" if done else "") + f" · {ulang} perlu kunjungan ulang")
    except Exception as e:
        L.append(f"4. Hitrate TO: data belum tersedia ({e})")
    return "\n".join(L)


def main() -> int:
    url, k = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_KEY")
    if not (url and k):
        print("SUPABASE_URL / SUPABASE_SERVICE_KEY belum diatur", file=sys.stderr)
        return 1
    text = build(Supa(url, k))
    print(text)
    summ = os.environ.get("GITHUB_STEP_SUMMARY")
    if summ:
        with open(summ, "a", encoding="utf-8") as fh:
            fh.write(text.replace("*", "**") + "\n")
    tok, chat = os.environ.get("TELEGRAM_BOT_TOKEN"), os.environ.get("TELEGRAM_CHAT_ID")
    if tok and chat:
        r = requests.post(f"https://api.telegram.org/bot{tok}/sendMessage", json={"chat_id": chat, "text": text, "parse_mode": "Markdown"}, timeout=30)
        print("Telegram:", r.status_code, "" if r.ok else r.text[:200])
        return 0 if r.ok else 1
    print("(Telegram tidak dikonfigurasi, hanya dicetak ke log)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
