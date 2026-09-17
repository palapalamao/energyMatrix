# -*- coding: utf-8 -*-
# 存量 floorRef 回填（结构红线：设备必备 floorRef，点位随设备）
# Pass1: equip/meter/loadGroup 缺 floorRef -> emSpaceRef 分区楼层 > 名称启发 > 面积最大楼层
# Pass2: point 缺 floorRef -> 照搬 equipRef 设备楼层（Walk 只覆盖新建，存量点位是旧模板物化的静态记录）
# 幂等: 只处理 not floorRef 的记录；可重复执行。
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
        return "HTTPError %s: %s" % (e.code, e.read().decode()[:300])

def grid(txt):
    lines = [l for l in txt.splitlines() if l]
    if not lines or not lines[0].startswith("ver:"):
        return [], []
    cols = lines[1].split(",")
    return cols, lines[2:]

def cell(row, cols, name):
    try:
        i = cols.index(name)
    except ValueError:
        return None
    parts = row.split(",")
    if i >= len(parts):
        return None
    v = parts[i].strip()
    return None if v == "" else v

def ref_of(cellv):
    if not cellv:
        return None
    m = re.match(r"@?(p:[^ \"，,]+)", cellv)
    return m.group(1) if m else None

def dis_of(cellv):
    if not cellv:
        return ""
    m = re.search(r'"(.*)"', cellv)
    return m.group(1) if m else cellv

def commit_floor(ph, rec_id, floor):
    r = evalz(ph, "commit(diff(readById(@%s), {floorRef:@%s}))" % (rec_id, floor))
    return "err" not in r.splitlines()[1] if len(r.splitlines()) > 1 else ("err" not in r)

# 名称启发：设备名关键词 -> 楼层 navName 关键词（按优先级）
HEUR = [
    (r"手术|ICU",            r"手术|ICU"),
    (r"急诊|门诊|医技|影像|CT|MRI|抢救", r"门急诊|医技"),
    (r"住院|护理",           r"住院"),
    (r"屋面|屋顶|光伏",      r"屋面"),
    (r"车库|停车|充电",      r"车库|停车"),
    (r"能源|冷站|冷水|冷冻|冷却|水泵|锅炉|换热|制冷|通风机", r"能源"),
    (r"厨房|餐饮",           r"餐饮"),
    (r"影院|健身",           r"影院|健身"),
    (r"办公",                r"办公"),
]

def pick_floor(name, floors):
    # floors: list of (ref, navName, area_float)
    for pat, fpat in HEUR:
        if re.search(pat, name):
            for f in floors:
                if re.search(fpat, f[1]):
                    return f[0]
    # 兜底：面积最大楼层
    best = max(floors, key=lambda f: (f[2], -abs(f[3])))
    return best[0]

def main(ph):
    # ── 各站点楼层表 ──────────────────────────────
    fcols, frows = grid(evalz(ph, "readAll(floor)"))
    site_floors = {}
    for r in frows:
        sref = ref_of(cell(r, fcols, "siteRef"))
        if not sref:
            continue
        fref = ref_of(cell(r, fcols, "id"))
        nav = dis_of(cell(r, fcols, "navName")) or dis_of(cell(r, fcols, "dis"))
        area_v = cell(r, fcols, "area")
        m = re.match(r"([\d.]+)", area_v or "")
        area = float(m.group(1)) if m else 0.0
        fn_v = cell(r, fcols, "floorNum")
        m2 = re.match(r"(-?\d+)", fn_v or "")
        fnum = int(m2.group(1)) if m2 else 0
        site_floors.setdefault(sref, []).append((fref, nav, area, fnum))
    print("sites with floors:", len(site_floors))

    # zone 楼层映射（一次性）
    zcols, zrows = grid(evalz(ph, "readAll(emZone)"))
    zone_floor = {}
    for r in zrows:
        zr = ref_of(cell(r, zcols, "id"))
        zf = ref_of(cell(r, zcols, "floorRef"))
        if zr and zf:
            zone_floor[zr] = zf

    # ── Pass 1: 设备 ──────────────────────────────
    dcols, drows = grid(evalz(ph, "readAll(equip and energyMatrix and not floorRef)"))
    print("pass1 devices missing floorRef:", len(drows))
    fixed_d = failed_d = 0
    for r in drows:
        rid = ref_of(cell(r, dcols, "id"))
        sref = ref_of(cell(r, dcols, "siteRef"))
        name = (dis_of(cell(r, dcols, "navName")) or "") + " " + (dis_of(cell(r, dcols, "dis")) or "")
        floor = None
        zref = ref_of(cell(r, dcols, "emSpaceRef"))
        if zref and zref in zone_floor:
            floor = zone_floor[zref]
        if floor is None and sref in site_floors:
            floor = pick_floor(name, site_floors[sref])
        if floor is None:
            print("  FAIL(no floor candidate):", rid, name)
            failed_d += 1
            continue
        if commit_floor(ph, rid, floor):
            fixed_d += 1
        else:
            print("  FAIL(commit):", rid, name)
            failed_d += 1
    print("pass1 fixed=%d failed=%d" % (fixed_d, failed_d))

    # ── Pass 2: 点位 ──────────────────────────────
    # 设备楼层快照（含刚回填的）
    ecols, erows = grid(evalz(ph, "readAll(equip and energyMatrix)"))
    equip_floor = {}
    for r in erows:
        er = ref_of(cell(r, ecols, "id"))
        ef = ref_of(cell(r, ecols, "floorRef"))
        if er and ef:
            equip_floor[er] = ef
    pcols, prows = grid(evalz(ph, "readAll(point and energyMatrix and not floorRef)"))
    print("pass2 points missing floorRef:", len(prows))
    fixed_p = failed_p = 0
    for r in prows:
        rid = ref_of(cell(r, pcols, "id"))
        eref = ref_of(cell(r, pcols, "equipRef"))
        floor = equip_floor.get(eref)
        if floor is None:
            print("  FAIL(no equip floor):", rid, eref)
            failed_p += 1
            continue
        if commit_floor(ph, rid, floor):
            fixed_p += 1
        else:
            print("  FAIL(commit):", rid)
            failed_p += 1
    print("pass2 fixed=%d failed=%d" % (fixed_p, failed_p))
    print("BACKFILL DONE")

with open_haystack_client(URI, "su", "su") as ph:
    main(ph)