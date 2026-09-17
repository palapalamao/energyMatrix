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
        raw = urllib.request.urlopen(req, timeout=60).read().decode()
        return raw
    except urllib.error.HTTPError as e:
        return "HTTP %s: %s" % (e.code, e.read().decode()[:300])

with open_haystack_client(URI, "su", "su") as ph:
    print("=== sites beds now ===")
    for s in rows_of(ph.read_all("energyMatrix and site")):
        print(" ", str(s.get("navName") or s.get("dis")), "beds:", str(s.get("emBeds")))
    print("=== EUI_BED 南院区 this month ===")
    print(evalz(ph, "emKpiComputeAll(\"EUI_BED\", [ @p:mytest:r:323941c3-8698da6e ], emThisMonthSpan())"))
    print("=== EUI_TOTAL 南院区 this month ===")
    print(evalz(ph, "emKpiComputeAll(\"EUI_TOTAL\", [ @p:mytest:r:323941c3-8698da6e ], emThisMonthSpan())"))
    print("=== EUI_BED 示范商业综合体 (retail, no beds) ===")
    print(evalz(ph, "emKpiComputeAll(\"EUI_BED\", [ @p:mytest:r:323822d3-5cd24db4 ], emThisMonthSpan())"))