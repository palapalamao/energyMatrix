# -*- coding: utf-8 -*-
import sys, urllib.request
sys.stdout.reconfigure(encoding="utf-8")
from phable import open_haystack_client
URI = "http://172.18.176.1:8080/api/mytest"

def rows_of(g):
    if hasattr(g, "to_dicts"): return g.to_dicts()
    names = [c.name for c in g.cols]
    return [r if isinstance(r, dict) else dict(zip(names, r)) for r in g.rows]

def evalz(ph, expr):
    zinc = expr.replace("\\", "\\\\").replace('"', '\\"')
    body = "ver:\"3.0\"\nexpr\n\"" + zinc + "\""
    req = urllib.request.Request(URI + "/eval", data=body.encode(),
        headers={"Content-Type": "text/zinc", "Authorization": "BEARER authToken=" + ph._auth_token})
    try:
        return urllib.request.urlopen(req, timeout=60).read().decode()
    except urllib.error.HTTPError as e:
        return "HTTP %s: %s" % (e.code, e.read().decode()[:300])

with open_haystack_client(URI, "su", "su") as ph:
    print("=== SITES ===")
    sites = rows_of(ph.read_all("energyMatrix and site"))
    for s in sites:
        print("id:", str(s.get("id")), "| name:", str(s.get("navName") or s.get("dis")),
              "| area:", str(s.get("area")), "| occ:", str(s.get("emOccupancy")),
              "| beds:", str(s.get("emBeds")), "| coolArea:", str(s.get("emCoolArea")),
              "| usage:", str(s.get("emUsageType")), "| zone:", str(s.get("emClimateZone")))
    print()
    print("=== KPI DEFS ===")
    for k in rows_of(ph.read_all("emKpi")):
        print(str(k.get("emKpiCode")), "|", str(k.get("dis")), "| unit:", str(k.get("unit")),
              "| gran:", str(k.get("emGranularity")), "| formula:", str(k.get("emFormula")))
