# -*- coding: utf-8 -*-
# 清理悬空点位 v3：wrappedDiffRemove(@ref)（finTools，内部提交；验证记录消失）
import sys, re, urllib.request
sys.stdout.reconfigure(encoding="utf-8")
from phable import open_haystack_client
URI = "http://172.18.176.1:8080/api/mytest"
def evalz(ph, expr):
    zinc = expr.replace("\\", "\\\\").replace('"', '\\"')
    body = 'ver:"3.0"\nexpr\n"' + zinc + '"'
    req = urllib.request.Request(URI + "/eval", data=body.encode(),
        headers={"Content-Type": "text/zinc", "Authorization": "BEARER authToken=" + ph._auth_token})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.read().decode()
    except urllib.error.HTTPError as e:
        return "HTTPError %s" % e.code
def grid(txt):
    lines = [l for l in txt.splitlines() if l]
    return lines[1].split(","), lines[2:]
def ref_of(c):
    if not c: return None
    m = re.match(r"@?(p:[^ \"，,]+)", c.strip())
    return m.group(1) if m else None
with open_haystack_client(URI, "su", "su") as ph:
    ecols, erows = grid(evalz(ph, "readAll(equip)"))
    equip_ids = set(ref_of(r.split(",")[0]) for r in erows)
    pcols, prows = grid(evalz(ph, "readAll(point and energyMatrix)"))
    i_eq = pcols.index("equipRef")
    i_fl = pcols.index("floorRef") if "floorRef" in pcols else None
    deleted = failed = 0
    for r in prows:
        parts = r.split(",")
        eq = ref_of(parts[i_eq]) if i_eq < len(parts) else None
        dangling = eq is None or eq not in equip_ids
        has_floor = i_fl is not None and i_fl < len(parts) and parts[i_fl].strip() != ""
        if not dangling:
            continue
        if has_floor:
            print("NOTE dangling but has floorRef (kept):", parts[0][:60])
            continue
        rid = ref_of(parts[0])
        evalz(ph, "wrappedDiffRemove(@%s)" % rid)
        gone = "val N" in evalz(ph, "readById(@%s, false)" % rid)
        if gone: deleted += 1
        else:
            print("FAIL:", rid); failed += 1
    print("orphan points deleted=%d failed=%d" % (deleted, failed))