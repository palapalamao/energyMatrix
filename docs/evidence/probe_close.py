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
    print("== close periods ==")
    for r in rows_of(ph.read_all("emClosePeriod")):
        print("  span:", str(r.get("span")), "| dis:", str(r.get("dis")))
    for name, ref in [("南院区","323941c3-8698da6e"),("西院区","323941c3-1a9a3819"),("东院区","323941c3-0060fb1b"),("本部","3232ede5-bd4bda85")]:
        rows = rows_of(ph.read_all("emLedger and emClosed and siteRef==@p:mytest:r:%s" % ref))
        days = sorted(set(str(r.get("emPeriod")) for r in rows))
        print(name, "closed entries:", len(rows), "days:", days[:3], "...", days[-3:] if len(days)>3 else "")
