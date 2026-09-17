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
    for r in rows_of(ph.read_all('emQuota and id==@p:mytest:r:32394268-972a9fec')):
        for k in sorted(r.keys()):
            print(" ", k, "=", str(r[k]))
