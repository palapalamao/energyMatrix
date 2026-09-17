# -*- coding: utf-8 -*-
# 电气安全监测（需求 7.3）mytest 四院区运行时数据构建
# 结构: 医疗场所 zone + 监测回路/馈线电表(emMeterRole=check 不参与汇总) + 安全点位
#       + IT 隔离电源柜(equip emItIsolation) + 今日 24h his(10min) + 域11 规则注册
# 幂等: 按 navName(ES-*) / dis 查重, 重复执行只重写 his。
# 修复记录: diff(null,...) 必须带 {add}; phable Grid 用 .rows 而非 to_dicts;
#           hisWrite 走 phable his_write_by_ids; 时区固定 Asia/Shanghai。
import sys, random, math, inspect
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
sys.stdout.reconfigure(encoding="utf-8")
from phable import open_haystack_client, Ref, Number, Grid, GridCol
URI = "http://172.18.176.1:8080/api/mytest"
TZ = ZoneInfo("Asia/Shanghai")

SITES = {
    "本部院区": "p:mytest:r:3232ede5-bd4bda85",
    "南院区":   "p:mytest:r:323941c3-8698da6e",
    "西院区":   "p:mytest:r:323941c3-1a9a3819",
    "东院区":   "p:mytest:r:323941c3-0060fb1b",
}

SCEN = {
    "本部院区": {"ER-1":  {"temp": 74.6, "leak": 520.0},
                 "OR-2":  {"temp": 63.2, "leak": 185.0},
                 "IT-ICU1": {"ir": 42.8},
                 "CT-1":  {"thdV": 5.2},
                 "MRI-1": {"thdV": 4.6, "thdI": 19.8, "unb": 1.8}},
    "西院区": {"OR-1": {"temp": 61.5}},
    "南院区": {"IT-ICU1": {"ir": 48.2}},
    "东院区": {},
}

ZONES = [("手术室", "OR"), ("ICU", "ICU"), ("急诊抢救", "ER"), ("影像科", "IMG")]
CIRCUITS = [  # key, dis, zone, 电流基线A, 功率基线kW, 温度基线C
    ("OR-1",  "手术室 1# 配电回路", "手术室", 38.0, 8.4,  46.5),
    ("OR-2",  "手术室 2# 配电回路", "手术室", 53.0, 11.6, 49.0),
    ("ICU-1", "ICU 配电回路 A",     "ICU",    62.0, 13.6, 51.3),
    ("ER-1",  "急诊抢救室回路",     "急诊抢救", 74.0, 16.1, 52.0),
]
FEEDERS = [("CT-1", "CT 机馈线", "影像科"), ("MRI-1", "MRI 馈线", "影像科"), ("MAIN-1", "院区主进线", None)]
ITPANELS = [("IT-OR1", "手术室 IT 隔离电源柜", "手术室"), ("IT-ICU1", "ICU IT 隔离电源柜", "ICU")]

POINT_KINDS = {
    "volt": ("elec, volt", "V"), "current": ("elec, current", "A"),
    "power": ("elec, power", "kW"), "temp": ("temp", "°C"),
    "leak": ("elec, emResidualCurrent", "mA"), "thdV": ("elec, emThd, emThdV", "%"),
    "thdI": ("elec, emThd, emThdI", "%"), "unb": ("elec, emUnbalance", "%"),
    "ir": ("elec, emInsulation", "kΩ"),
}
POINT_DIS = {"volt": "电压", "current": "电流", "power": "有功功率", "temp": "线缆温度",
             "leak": "剩余电流", "thdV": "电压 THD", "thdI": "电流 THD", "unb": "三相不平衡度", "ir": "绝缘电阻"}


def evalz(ph, expr):
    zinc = expr.replace("\\", "\\\\").replace('"', '\\"')
    body = 'ver:"3.0"\nexpr\n"' + zinc + '"'
    req = urllib.request.Request(URI + "/eval", data=body.encode(),
        headers={"Content-Type": "text/zinc", "Authorization": "BEARER authToken=" + ph._auth_token})
    try:
        return urllib.request.urlopen(req, timeout=120).read().decode()
    except urllib.error.HTTPError as e:
        return "HTTP %s: %s" % (e.code, e.read().decode()[:300])


import urllib.request

def rows_of(g):
    return list(g.rows)


def ref_str(v):
    s = str(v)
    return s.lstrip("@") if not s.startswith("p:") else s


def find_one(ph, filter_expr, pred):
    for r in rows_of(ph.read_all(filter_expr)):
        if pred(r):
            return r
    return None


def ensure_zone(ph, site_ref, dis, tag):
    nav = "ES-" + tag
    z = find_one(ph, 'space and energyMatrix and siteRef==@' + site_ref,
                 lambda r: str(r.get("navName", "")) == nav)
    if z is not None:
        return ref_str(z["id"]), False
    out = evalz(ph, 'commit(diff(null, {energyMatrix, space, emZone, siteRef:@%s, navName:"%s", dis:"%s", area:800, tz:"Shanghai"}, {add}))' % (site_ref, nav, dis))
    if " err" in out[:60] or "errType" in out[:60]:
        print("   !! zone %s: %s" % (dis, out[:160]))
        return None, True
    r = ref_of(out)
    if not r:
        z = find_one(ph, 'space and energyMatrix and siteRef==@' + site_ref,
                     lambda r2: str(r2.get("navName", "")) == nav)
        r = ref_str(z["id"]) if z is not None else None
    print("   + zone %s -> %s" % (dis, r))
    return r, True


def ref_of(zinc_out):
    i = zinc_out.find("@p:mytest:r:")
    if i < 0: return None
    return zinc_out[i+1:].split()[0].rstrip(",")


def patch_meter(ph, m, ref, nav, zone_ref, dis):
    changes = []
    if not m.get("navName"): changes.append('navName:"%s"' % nav)
    if zone_ref and not m.get("emSpaceRef"): changes.append('emSpaceRef:@%s' % zone_ref)
    if changes:
        out = evalz(ph, 'commit(diff(readById(@%s), {%s}))' % (ref, ", ".join(changes)))
        print("   ~ meter %s patched: %s" % (dis, "ok" if "errType" not in out[:80] else out[:120]))


def ensure_meter(ph, site_ref, dis, nav, zone_ref):
    for m in rows_of(ph.read_all('meter and energyMatrix and siteRef==@' + site_ref)):
        # emAddMeter 将第3参数存为 navName(dis 由 disMacro 生成), 按 navName==dis 查重
        if str(m.get("navName", "")) == dis:
            ref = ref_str(m["id"])
            patch_meter(ph, m, ref, nav, zone_ref, dis)
            return ref, False
    args = 'navName:"%s", emMeterRole:"check", emSubItem:"d6", emMeterScope:"电气安全监测回路（只监测不控制）", emMaxReading:99999, emDataSource:"measured"' % nav
    if zone_ref: args += ', emSpaceRef:@' + zone_ref
    out = evalz(ph, 'emAddMeter(@%s, "elec", "%s", {%s})' % (site_ref, dis, args))
    r = ref_of(out)
    print("   + meter %s -> %s" % (dis, r))
    return r, True


def ensure_equip(ph, site_ref, dis, nav, zone_ref):
    e = find_one(ph, 'equip and emItIsolation and siteRef==@' + site_ref,
                 lambda r: str(r.get("navName", "")) == nav)
    if e is not None:
        return ref_str(e["id"]), False
    z = ', emSpaceRef:@' + zone_ref if zone_ref else ''
    out = evalz(ph, 'commit(diff(null, {energyMatrix, equip, elec, emItIsolation, siteRef:@%s, navName:"%s", dis:"%s", emSystemVolt:220, emIrAlarmThreshold:50, tz:"Shanghai"%s}, {add}))' % (site_ref, nav, dis, z))
    if "errType" in out[:60]:
        print("   !! itpanel %s: %s" % (dis, out[:160]))
        return None, True
    r = ref_of(out)
    if not r:
        e = find_one(ph, 'equip and emItIsolation and siteRef==@' + site_ref,
                     lambda r2: str(r2.get("navName", "")) == nav)
        r = ref_str(e["id"]) if e is not None else None
    print("   + itpanel %s -> %s" % (dis, r))
    return r, True


def ensure_point(ph, site_ref, equip_ref, meter_ref, kind, dis_prefix, nav):
    p = find_one(ph, 'point and energyMatrix and equipRef==@' + equip_ref,
                 lambda r: str(r.get("navName", "")) == nav)
    if p is not None:
        return ref_str(p["id"]), False
    markers, _u = POINT_KINDS[kind]
    out = evalz(ph, 'commit(diff(null, {energyMatrix, point, sensor, %s, equipRef:@%s, emMeterRef:@%s, siteRef:@%s, navName:"%s", dis:"%s %s", kind:"Number", his, tz:"Shanghai"}, {add}))' % (markers, equip_ref, meter_ref, site_ref, nav, dis_prefix, POINT_DIS[kind]))
    if "errType" in out[:60]:
        print("   !! point %s: %s" % (nav, out[:160]))
        return None, True
    r = ref_of(out)
    if not r:
        p = find_one(ph, 'point and energyMatrix and equipRef==@' + equip_ref,
                     lambda r2: str(r2.get("navName", "")) == nav)
        r = ref_str(p["id"]) if p is not None else None
    return r, True


def day_series(seed, base, amp, peak_hr, noise, override=None):
    """今日 0 点起 10min 间隔至当前, 末样本=当前值; override: 末 3h 线性爬坡到目标值"""
    rnd = random.Random(seed)
    now = datetime.now(TZ)
    t0 = now.replace(hour=0, minute=0, second=0, microsecond=0)
    n = int((now - t0).total_seconds() // 600)
    ts = [t0 + timedelta(minutes=10*i) for i in range(n+1)]
    vals = []
    for t in ts:
        hr = t.hour + t.minute/60.0
        d = hr - peak_hr
        v = base + amp*math.exp(-(d*d)/18.0) + (rnd.random()-0.5)*2*noise
        vals.append(v)
    if override is not None and len(vals) > 20:
        start = len(vals) - 19
        base_v = vals[start-1]
        for k in range(19):
            vals[start+k] = base_v + (override - base_v) * (k+1) / 19.0
    return [(t, v) for t, v in zip(ts, vals)]


def write_point_his(ph, seed, pref, kind, base, amp, peak, noise, override=None):
    if pref is None: return "no ref"
    pts = day_series(seed, base, amp, peak, noise, override)
    try:
        g = Grid({"ver": "3.0", "id": Ref(pref)},
                 [GridCol("ts"), GridCol("val")],
                 [{"ts": t, "val": Number(v)} for t, v in pts])
        ph.call("hisWrite", g)
        # hisWrite 不刷 curVal, 补 pointWrite 让实时值立即可读
        ph.point_write(Ref(pref), 8, Number(pts[-1][1]), who="energyMatrix-safety-demo")
        return "ok"
    except Exception as e:
        return "ERR %s" % str(e)[:160]


def main():
    with open_haystack_client(URI, "su", "su") as ph:
        for site_name, site_ref in SITES.items():
            scen = SCEN.get(site_name, {})
            print("== %s ==" % site_name)
            zones = {}
            for dis, tag in ZONES:
                zr, _ = ensure_zone(ph, site_ref, dis, tag)
                zones[dis] = zr
            # 监测回路
            for key, dis, zdis, ib, kw, tb in CIRCUITS:
                mr, _ = ensure_meter(ph, site_ref, dis, "ES-" + key, zones.get(zdis))
                sc = scen.get(key, {})
                for kind, base, amp, peak, noise in [
                        ("volt", 220.0, 2.0, 10, 0.6), ("current", ib, ib*0.35, 10, 1.5),
                        ("power", kw, kw*0.4, 10, 0.3), ("temp", tb, 3.0, 14, 0.5),
                        ("leak", 120.0, 25.0, 9, 12.0)]:
                    pr, _ = ensure_point(ph, site_ref, mr, mr, kind, dis, POINT_DIS[kind])
                    r = write_point_his(ph, hash(site_name+key+kind), pr, kind, base, amp, peak, noise, sc.get(kind))
                    if r != "ok": print("   !! his %s %s: %s" % (key, kind, r))
            # 馈线
            for key, dis, zdis in FEEDERS:
                mr, _ = ensure_meter(ph, site_ref, dis, "ES-" + key, zones.get(zdis))
                sc = scen.get(key, {})
                for kind, base, amp, peak, noise in [
                        ("thdV", 2.6, 0.9, 10, 0.15), ("thdI", 9.0, 4.0, 10, 0.6),
                        ("unb", 0.7, 0.4, 9, 0.08)]:
                    pr, _ = ensure_point(ph, site_ref, mr, mr, kind, dis, POINT_DIS[kind])
                    r = write_point_his(ph, hash(site_name+key+kind), pr, kind, base, amp, peak, noise, sc.get(kind))
                    if r != "ok": print("   !! his %s %s: %s" % (key, kind, r))
            # IT 隔离电源柜
            for key, dis, zdis in ITPANELS:
                er, _ = ensure_equip(ph, site_ref, dis, "ES-" + key, zones.get(zdis))
                sc = scen.get(key, {})
                for kind, base, amp, peak, noise in [
                        ("ir", 130.0, 25.0, 6, 8.0), ("current", 42.0, 12.0, 8, 1.2),
                        ("temp", 52.0, 4.0, 12, 0.5)]:
                    pr, _ = ensure_point(ph, site_ref, er, er, kind, dis, POINT_DIS[kind])
                    r = write_point_his(ph, hash(site_name+key+kind), pr, kind, base, amp, peak, noise, sc.get(kind))
                    if r != "ok": print("   !! his %s %s: %s" % (key, kind, r))
            # 域 11 规则注册（判据属未实现六类，emDiagRun 会列入 emSkipped 明示）
            for code, rdis, cat in [("SAFE-FIRE-TEMP", "电气火灾预警-线缆温度≥70℃", "overConsume"),
                                    ("SAFE-FIRE-LEAK", "电气火灾预警-剩余电流≥500mA", "overConsume"),
                                    ("SAFE-IT-IR",     "IT 绝缘电阻低于阈值",        "efficiency"),
                                    ("SAFE-PQ-THDV",   "电压 THD 越限",              "demandRisk")]:
                exists = [r for r in rows_of(ph.read_all('emDiagnostic and not disabled and siteRef==@' + site_ref)) if str(r.get("emRuleCode", "")) == code]
                if not exists:
                    out = evalz(ph, 'emAddDiagRule(@%s, "%s", "%s", "%s", "critical", 1)' % (site_ref, code, rdis, cat))
                    print("   + rule %s: %s" % (code, "ok" if "errType" not in out[:80] else out[:140]))
        # 跑一遍诊断，看异常产出
        for site_name, site_ref in SITES.items():
            out = evalz(ph, 'emDiagRun(@%s, toSpan(date(today().year, today().month, 1)..today()))' % site_ref)
            anom = out.count("emAnomaly") if "emAnomaly" in out else 0
            print("== diag %s: emAnomaly×%d" % (site_name, anom))
            sk = [l for l in out.splitlines() if "emSkipped" in l]
            for l in sk[:1]: print("   " + l[:200])


if __name__ == "__main__":
    main()
