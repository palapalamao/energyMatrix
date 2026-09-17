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
        return urllib.request.urlopen(req, timeout=60).read().decode()
    except urllib.error.HTTPError as e:
        return "HTTP %s: %s" % (e.code, e.read().decode()[:300])

sites = {
  "南院区": "p:mytest:r:323941c3-8698da6e",
  "西院区": "p:mytest:r:323941c3-1a9a3819",
  "东院区": "p:mytest:r:323941c3-0060fb1b",
  "某医院": "p:mytest:r:3232ede5-bd4bda85",
}
meds = ["elec","water","gas","cool","heat","steam","diesel"]
kpis = ["EUI_TOTAL","EUI_ELEC","EUI_PC","EUI_BED","WUI","WATER_PER_BED","CARBON_INTENSITY"]

with open_haystack_client(URI, "su", "su") as ph:
    for name, ref in sites.items():
        r = "@p:" + ref.split(":",1)[1] if not ref.startswith("@") else ref
        print("==== %s ====" % name)
        for m in meds:
            out = evalz(ph, 'emLedgerTotal(%s, emThisMonthSpan(), "%s")' % (r, m)).strip()
            print("  ledger %-6s %s" % (m, out.replace("\n"," ")[:160]))
        codes = ",".join('"%s"' % k for k in kpis)
        out = evalz(ph, "emKpiComputeAll(%s, [%s], emThisMonthSpan())" % (codes, r))
        for line in out.splitlines()[2:]:
            print("  kpi", line.strip()[:150])
        print()
