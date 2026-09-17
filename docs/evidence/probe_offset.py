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
    rows = rows_of(ph.read_all("emGreenCertificate or emOffset or emRetired"))
    print("offset-ish records:", len(rows))
    for r in rows:
        print(" ", {k: str(v) for k, v in r.items() if k in ("id","dis","emSubjectRef","emQuantity","val","emRetired","emYear","emScope")})
    rows = rows_of(ph.read_all("energyMatrix and siteRef"))
    print("all siteRef-bearing non-site records:", len(rows))
    tags = set()
    for r in rows[:200]: tags.update(r.keys())
    print(sorted(tags))
