# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding="utf-8")
from datetime import datetime
from zoneinfo import ZoneInfo
from phable import open_haystack_client, Ref, DateTimeRange
URI = "http://172.18.176.1:8080/api/mytest"
TZ = ZoneInfo("Asia/Shanghai")
SITES = {"本部院区":"3232ede5-bd4bda85","南院区":"323941c3-8698da6e","西院区":"323941c3-1a9a3819","东院区":"323941c3-0060fb1b"}
def last_his(ph, ref):
    rng = DateTimeRange(datetime.now(TZ).replace(hour=0,minute=0), datetime.now(TZ))
    g = ph.his_read_by_id(Ref(ref), rng)
    return (len(g.rows), float(g.rows[-1]["val"].val) if g.rows else None)
with open_haystack_client(URI, "su", "su") as ph:
    for name, s in SITES.items():
        site = "p:mytest:r:" + s
        z = ph.read_all('space and emZone and siteRef==@' + site)
        m = ph.read_all('meter and energyMatrix and siteRef==@' + site + ' and emMeterScope=="电气安全监测回路（只监测不控制）"')
        it = ph.read_all('equip and emItIsolation and siteRef==@' + site)
        pts = ph.read_all('point and energyMatrix and siteRef==@' + site + ' and his and (temp or emResidualCurrent or emInsulation or emThd or emUnbalance or volt or current or power)')
        print("%s: zone=%d meter=%d it=%d 安全点=%d" % (name, len(z.rows), len(m.rows), len(it.rows), len(pts.rows)))
    # 场景值抽查
    checks = [
        ("本部 急诊 temp",  "3232ede5-bd4bda85", "急诊抢救室回路", "线缆温度"),
        ("本部 急诊 leak", "3232ede5-bd4bda85", "急诊抢救室回路", "剩余电流"),
        ("本部 ICU-IT ir", "3232ede5-bd4bda85", "ICU IT 隔离电源柜", "绝缘电阻"),
        ("本部 CT thdV",   "3232ede5-bd4bda85", "CT 机馈线", "电压 THD"),
        ("西 OR-1 temp",   "323941c3-1a9a3819", "手术室 1# 配电回路", "线缆温度"),
        ("南 ICU-IT ir",   "323941c3-8698da6e", "ICU IT 隔离电源柜", "绝缘电阻"),
        ("东 OR-1 temp",   "323941c3-0060fb1b", "手术室 1# 配电回路", "线缆温度"),
    ]
    for label, s, dis, kind in checks:
        g = ph.read_all('point and energyMatrix and siteRef==@p:mytest:r:%s and navName=="%s"' % (s, kind))
        hit = [r for r in g.rows if dis in str(r.get("dis",""))]
        if not hit: print(label, "-> NOT FOUND"); continue
        n, v = last_his(ph, str(hit[0]["id"]).lstrip("@"))
        print("%s -> %s (%d samples today)" % (label, round(v,1) if v is not None else None, n))
