# -*- coding: utf-8 -*-
# 结构红线终审：点位=equipRef+floorRef+siteRef 且 equipRef 可解析；
#             设备(equip+energyMatrix)=floorRef+siteRef；楼层=siteRef
import sys, re, urllib.request
sys.stdout.reconfigure(encoding="utf-8")
from phable import open_haystack_client
URI = "http://172.18.176.1:8080/api/mytest"
def evalz(ph, expr):
    zinc = expr.replace("\\", "\\\\").replace('"', '\\"')
    body = 'ver:"3.0"\nexpr\n"' + zinc + '"'
    req = urllib.request.Request(URI + "/eval", data=body.encode(),
        headers={"Content-Type": "text/zinc", "Authorization": "BEARER authToken=" + ph._auth_token})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read().decode()
def grid(txt):
    lines = [l for l in txt.splitlines() if l]
    return lines[1].split(","), lines[2:]
def ref_of(c):
    if not c: return None
    m = re.match(r"@?(p:[^ \"，,]+)", c.strip())
    return m.group(1) if m else None
def cell(parts, cols, name):
    if name not in cols: return None
    i = cols.index(name)
    return parts[i].strip() if i < len(parts) else None
def report(label, bad, sample=5):
    print("%s: %s" % (label, "PASS (0 missing)" if not bad else "FAIL %d" % len(bad)))
    for b in bad[:sample]:
        print("   ", b)
    return not bad
with open_haystack_client(URI, "su", "su") as ph:
    ok = True
    # floors
    cols, rows = grid(evalz(ph, "readAll(floor)"))
    bad = [r.split(",")[0] for r in rows if not ref_of(cell(r.split(","), cols, "siteRef"))]
    ok &= report("floor.siteRef", bad)
    # devices (energyMatrix equip)
    cols, rows = grid(evalz(ph, "readAll(equip and energyMatrix)"))
    bad = [r.split(",")[0] for r in rows if not ref_of(cell(r.split(","), cols, "siteRef"))]
    ok &= report("equip.siteRef", bad)
    bad = [r.split(",")[0] for r in rows if not ref_of(cell(r.split(","), cols, "floorRef"))]
    ok &= report("equip.floorRef", bad)
    # points
    cols, rows = grid(evalz(ph, "readAll(point and energyMatrix)"))
    print("total energyMatrix points:", len(rows))
    bad = [r.split(",")[0] for r in rows if not ref_of(cell(r.split(","), cols, "siteRef"))]
    ok &= report("point.siteRef", bad)
    bad = [r.split(",")[0] for r in rows if not ref_of(cell(r.split(","), cols, "floorRef"))]
    ok &= report("point.floorRef", bad)
    eq_missing = [r.split(",")[0] for r in rows if not ref_of(cell(r.split(","), cols, "equipRef"))]
    ok &= report("point.equipRef", eq_missing)
    # equipRef 可解析
    ecols, erows = grid(evalz(ph, "readAll(equip)"))
    equip_ids = set(ref_of(r.split(",")[0]) for r in erows)
    i_eq = cols.index("equipRef")
    dangling = [r.split(",")[0] for r in rows
                if ref_of(r.split(",")[i_eq] if i_eq < len(r.split(",")) else None) not in equip_ids]
    ok &= report("point.equipRef resolvable", dangling)
    print("AUDIT:", "ALL PASS" if ok else "HAS FAILURES")