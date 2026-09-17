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
    for r in rows_of(ph.read_all('site and id==@p:mytest:r:323941c3-8698da6e')):
        print("南 emRegion:", str(r.get("emRegion")), "| emClimateZone:", str(r.get("emClimateZone")))
    for r in rows_of(ph.read_all("emEmissionFactor")):
        print(str(r.get("emMedium")), str(r.get("emRegion")), str(r.get("emYear")), "| srcDoc:", str(r.get("emSourceDoc")), "| locked:", str(r.get("emLocked")))
