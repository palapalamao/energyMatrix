# -*- coding: utf-8 -*-
import sys, urllib.request
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
def rows_of(g):
    if hasattr(g, "to_dicts"): return g.to_dicts()
    names = [c.name for c in g.cols]
    return [r if isinstance(r, dict) else dict(zip(names, r)) for r in g.rows]
with open_haystack_client(URI, "su", "su") as ph:
    print("== emission factors ==")
    for r in rows_of(ph.read_all("emEmissionFactor")):
        print("  ", str(r.get("emMedium")), "| factor:", str(r.get("emFactor")), str(r.get("emFactorUnit")),
              "| scope:", str(r.get("emScope")), "| region:", str(r.get("emRegion")), "| year:", str(r.get("emYear")))
    print("== 南院区 carbon ledger ==")
    print(evalz(ph, "emCarbonLedger(@p:mytest:r:323941c3-8698da6e, emThisMonthSpan())")[:1500])
