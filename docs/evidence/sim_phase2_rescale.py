# -*- coding: utf-8 -*-
# 优秀大型三甲 KPI 数据重模拟 —— 主脚本: 重写L1 + 重建L2 + 二遍校准
import sys, urllib.request, json
sys.stdout.reconfigure(encoding="utf-8")
from phable import open_haystack_client
URI = "http://172.18.176.1:8080/api/mytest"

def evalz(ph, expr):
    zinc = expr.replace("\\", "\\\\").replace('"', '\\"')
    body = "ver:\"3.0\"\nexpr\n\"" + zinc + "\""
    req = urllib.request.Request(URI + "/eval", data=body.encode(),
        headers={"Content-Type": "text/zinc", "Authorization": "BEARER authToken=" + ph._auth_token})
    try:
        return urllib.request.urlopen(req, timeout=180).read().decode()
    except urllib.error.HTTPError as e:
        return "HTTP %s: %s" % (e.code, e.read().decode()[:300])

def num(z):
    tail = z.replace("\n", " ").split("val", 1)[-1].strip()
    if tail.startswith("N"): return None
    token = tail.split()[0]
    digits = "".join(c for c in token if c.isascii() and (c.isdigit() or c in ".-"));  return float(digits) if digits else None

def rows_of(g):
    if hasattr(g, "to_dicts"): return g.to_dicts()
    names = [c.name for c in g.cols]
    return [r if isinstance(r, dict) else dict(zip(names, r)) for r in g.rows]

TARGET = {
  "南院区": {"ref":"p:mytest:r:323941c3-8698da6e", "area":76000,  "elec":6.6, "water":0.13, "gas":0.10},
  "西院区": {"ref":"p:mytest:r:323941c3-1a9a3819", "area":98000,  "elec":6.9, "water":0.14, "gas":0.10},
  "东院区": {"ref":"p:mytest:r:323941c3-0060fb1b", "area":132000, "elec":6.3, "water":0.13, "gas":0.09},
  "本部院区": {"ref":"p:mytest:r:3232ede5-bd4bda85", "area":180000, "elec":7.2, "water":0.15, "gas":0.11, "cool":2.4, "heat":0.25, "steam":1.2},
}
MEDS = ["elec","water","gas","cool","heat","steam"]
KIND = {"elec":"flat","water":"flat","gas":"flat","heat":"flat","steam":"flat","cool":"hvac"}
DAYS = 48

with open_haystack_client(URI, "su", "su") as ph:
    # ---- 基线: 物理表清单 + 各表当前月内至今 ----
    for name, cfg in TARGET.items():
        ms = rows_of(ph.read_all("meter and siteRef==@%s and not emVirtual" % cfg["ref"]))
        cfg["meters"] = [(str(m["id"]), str(m.get("emMedium"))) for m in ms]
        cfg["cur_site"] = {}
        cfg["cur_meter"] = {}
        for m in MEDS:
            if m not in cfg: continue
            cfg["cur_site"][m] = num(evalz(ph, 'emLedgerTotal(@%s, emThisMonthSpan(), "%s")' % (cfg["ref"], m)))
    for name, cfg in TARGET.items():
        for mid, med in cfg["meters"]:
            if med not in cfg: continue
            v = num(evalz(ph, 'emLedgerTotal(@%s, emThisMonthSpan(), "%s")' % (mid, med)))
            cfg["cur_meter"][mid] = v
        print(name, "meters=%d" % len(cfg["meters"]), {m: cfg["cur_site"][m] for m in cfg["cur_site"]})

    # ---- 第一遍: 按 f=目标/当前 缩放每表日用量并写历史 ----
    import datetime
    eff_days = 16 + (datetime.datetime.now().hour) / 24.0   # 16整天+今天已过占比
    print("effective mtd days ≈ %.2f" % eff_days)
    for name, cfg in TARGET.items():
        for mid, med in cfg["meters"]:
            if med not in cfg: continue
            cur_m = cfg["cur_meter"].get(mid) or 0.0
            cur_s = cfg["cur_site"][med] or 0.0
            if cur_m <= 0 or cur_s <= 0:
                print("  SKIP %s %s (cur=%s)" % (name, mid, cur_m)); continue
            tgt_site = cfg[med] * cfg["area"]
            f = tgt_site / cur_s
            daily = cur_m / eff_days * f
            out = evalz(ph, 'emDemoHis(@%s, %d, "%s", %d)' % (mid, round(daily), KIND[med], DAYS))
            print("  his %-8s %-6s f=%.3f daily=%.0f -> %s" % (name, med, f, daily, out.strip().replace("\n"," ")[:80]))

    # ---- 重建台账(8/1至今, 日粒度幂等) ----
    for name, cfg in TARGET.items():
        out = evalz(ph, 'emLedgerBuild(@%s, toSpan((today() - %dday)..today()), "daily")' % (cfg["ref"], DAYS))
        written = out.count("written"); skipped = out.count("skipped"); err = out.count("error")
        print("ledger %-8s written=%d skipped=%d error=%d" % (name, written, skipped, err))

    # ---- 实测并二遍校准 ----
    for name, cfg in TARGET.items():
        for m in MEDS:
            if m not in cfg: continue
            meas = num(evalz(ph, 'emLedgerTotal(@%s, emThisMonthSpan(), "%s")' % (cfg["ref"], m)))
            tgt = cfg[m] * cfg["area"]
            corr = tgt / meas if meas else None
            print("measure %-8s %-6s meas=%.0f tgt=%.0f corr=%s" % (name, m, meas or 0, tgt, ("%.4f" % corr) if corr else "NA"))
            cfg["corr_" + m] = corr
    # 第二遍写历史(乘校正系数) + 重建
    for name, cfg in TARGET.items():
        for mid, med in cfg["meters"]:
            if med not in cfg: continue
            corr = cfg.get("corr_" + med)
            if not corr or abs(corr - 1) < 0.02: continue
            cur_m = cfg["cur_meter"].get(mid) or 0.0
            cur_s = cfg["cur_site"][med] or 0.0
            if cur_m <= 0 or cur_s <= 0: continue
            daily = cur_m / eff_days * (cfg[med] * cfg["area"] / cur_s) * corr
            evalz(ph, 'emDemoHis(@%s, %d, "%s", %d)' % (mid, round(daily), KIND[med], DAYS))
    for name, cfg in TARGET.items():
        evalz(ph, 'emLedgerBuild(@%s, toSpan((today() - %dday)..today()), "daily")' % (cfg["ref"], DAYS))
    print("== final measures ==")
    for name, cfg in TARGET.items():
        row = {}
        for m in MEDS:
            if m not in cfg: continue
            meas = num(evalz(ph, 'emLedgerTotal(@%s, emThisMonthSpan(), "%s")' % (cfg["ref"], m)))
            row[m] = "%.0f/%.0f" % (meas or 0, cfg[m] * cfg["area"])
        print(" ", name, row)



