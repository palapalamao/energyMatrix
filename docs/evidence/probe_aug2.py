# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding="utf-8")
from phable import open_haystack_client
URI = "http://172.18.176.1:8080/api/mytest"

def rows_of(g):
    if hasattr(g, "to_dicts"): return g.to_dicts()
    names = [c.name for c in g.cols]
    return [r if isinstance(r, dict) else dict(zip(names, r)) for r in g.rows]

with open_haystack_client(URI, "su", "su") as ph:
    rows = rows_of(ph.read_all('emLedger and siteRef==@p:mytest:r:323941c3-0060fb1b and emPeriod=="2026-08-10"'))
    print("东院区 2026-08-10 entries:", len(rows))
    for r in rows:
        print("  ", str(r.get("emMeterRef")), str(r.get("emMedium")), str(r.get("val")), "closed:", str(r.get("emClosed")), "rev:", str(r.get("emReversalOf")))
    # 再看 9/10 (新数据) 对比
    rows = rows_of(ph.read_all('emLedger and siteRef==@p:mytest:r:323941c3-0060fb1b and emPeriod=="2026-09-10"'))
    print("东院区 2026-09-10 entries:", len(rows))
    for r in rows:
        print("  ", str(r.get("emMeterRef")), str(r.get("emMedium")), str(r.get("val")))
