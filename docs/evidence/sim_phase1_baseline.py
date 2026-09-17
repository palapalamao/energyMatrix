# -*- coding: utf-8 -*-
# 优秀大型三甲标准 KPI 数据重模拟 —— 阶段1: 重写实测基线 + L1历史 + L2台账
import sys, urllib.request, json, time
sys.stdout.reconfigure(encoding="utf-8")
from phable import open_haystack_client
URI = "http://172.18.176.1:8080/api/mytest"

def evalz(ph, expr):
    zinc = expr.replace("\\", "\\\\").replace('"', '\\"')
    body = "ver:\"3.0\"\nexpr\n\"" + zinc + "\""
    req = urllib.request.Request(URI + "/eval", data=body.encode(),
        headers={"Content-Type": "text/zinc", "Authorization": "BEARER authToken=" + ph._auth_token})
    try:
        return urllib.request.urlopen(req, timeout=120).read().decode()
    except urllib.error.HTTPError as e:
        return "HTTP %s: %s" % (e.code, e.read().decode()[:300])

def num(z):
    # parse zinc scalar like: ver:"3.0" val 282750kWh  /  N
    tail = z.replace("\n", " ").split("val", 1)[-1].strip()
    if tail.startswith("N"): return None
    token = tail.split()[0]
    return float("".join(c for c in token if c.isdigit() or c in ".-"))

# 目标: 月度口径(界面显示的"本月"=月内至今, 按16.6天折算日用量)
# 优秀大型三甲(夏热冬冷,9月): 电耗 6.3-7.2 kWh/m2, 水耗 0.13-0.15 m3/m2, 天然气 0.09-0.11 m3/m2
# 本部(旗舰,有区域供冷/热/蒸汽): cool 2.4, heat 0.25, steam 1.2 kg/m2
TARGET = {
  "南院区": {"ref":"p:mytest:r:323941c3-8698da6e", "area":76000,
             "elec":6.6, "water":0.13, "gas":0.10},
  "西院区": {"ref":"p:mytest:r:323941c3-1a9a3819", "area":98000,
             "elec":6.9, "water":0.14, "gas":0.10},
  "东院区": {"ref":"p:mytest:r:323941c3-0060fb1b", "area":132000,
             "elec":6.3, "water":0.13, "gas":0.09},
  "本部院区": {"ref":"p:mytest:r:3232ede5-bd4bda85", "area":180000,
             "elec":7.2, "water":0.15, "gas":0.11, "cool":2.4, "heat":0.25, "steam":1.2},
}
MEDS = ["elec","water","gas","cool","heat","steam"]
DAYS = 48          # 覆盖8/1以来全部历史, 保证近30日趋势一致
KIND = {"elec":"flat","water":"flat","gas":"flat","heat":"flat","steam":"flat","cool":"hvac"}

with open_haystack_client(URI, "su", "su") as ph:
    # 1) 每院区每介质: 表计清单(跳过虚表) + 当前月内至今合计
    for name, cfg in TARGET.items():
        sref = cfg["ref"]
        meters = []
        out = evalz(ph, "emMeterTree(@%s)" % sref)
        print("== %s meter tree ==" % name)
        for line in out.splitlines()[2:]:
            parts = [p.strip().strip('"') for p in line.split(",")]
            if len(parts) < 7: continue
            mid, dis, med, role = parts[0], parts[1], parts[2], parts[3]
            isvirt = parts[6] == "M" or role == "virtual"
            if role == "virtual" or parts[6] == "M": continue
            meters.append((mid, med, dis))
            print("   meter %-36s %-5s %s" % (mid, med, dis[:40]))
        cfg["meters"] = meters
        cfg["cur"] = {}
        for m in MEDS:
            if m not in cfg: continue
            v = num(evalz(ph, 'emLedgerTotal(@%s, emThisMonthSpan(), "%s")' % (sref, m)))
            cfg["cur"][m] = v
            tgt = cfg[m] * cfg["area"]
            print("   %-6s cur=%s target=%.0f f=%.4f" % (m, v, tgt, (tgt/v) if v else 0))
    json.dump({k:{"ref":v["ref"],"meters":v["meters"],"cur":v["cur"]} for k,v in TARGET.items()},
              open(r"D:\mygithub\energyMatrix\docs\evidence\sim_baseline.json","w"), ensure_ascii=False, indent=1)
    print("baseline saved.")
