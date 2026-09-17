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

sites = [
  ("南院区", "p:mytest:r:323941c3-8698da6e"),
  ("西院区", "p:mytest:r:323941c3-1a9a3819"),
  ("东院区", "p:mytest:r:323941c3-0060fb1b"),
  ("某医院", "p:mytest:r:3232ede5-bd4bda85"),
]

with open_haystack_client(URI, "su", "su") as ph:
    for name, ref in sites:
        print("==== %s meters ====" % name)
        ms = rows_of(ph.read_all('energyMatrix and meter and siteRef==@%s' % ref))
        for m in ms:
            flags = []
            if m.get("emVirtual"): flags.append("V")
            if m.get("emSynthetic"): flags.append("S")
            role = str(m.get("emMeterRole") or m.get("emRole") or "")
            print("  %-38s med=%-6s role=%-10s %s" % (str(m.get("id")), str(m.get("emMedium")), role, ",".join(flags)))
        print("  -- quotas --")
        out = evalz(ph, "emQuotaProgressAll(@%s, emThisMonthSpan())" % ref)
        for line in out.splitlines():
            print("   ", line.strip()[:220])
        print()
