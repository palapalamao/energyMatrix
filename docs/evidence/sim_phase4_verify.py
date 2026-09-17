# -*- coding: utf-8 -*-
# 阶段4: 全量验收
import sys, urllib.request, re
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

SITES = [("南院区","323941c3-8698da6e"),("西院区","323941c3-1a9a3819"),
         ("东院区","323941c3-0060fb1b"),("本部院区","3232ede5-bd4bda85")]
KPIS = ["EUI_TOTAL","EUI_ELEC","EUI_PC","EUI_BED","WUI","WATER_PER_BED","CARBON_INTENSITY"]

with open_haystack_client(URI, "su", "su") as ph:
    for name, ref in SITES:
        print("==== %s ====" % name)
        for k in KPIS:
            out = evalz(ph, 'emKpiComputeAll("%s", [@p:mytest:r:%s], emThisMonthSpan())' % (k, ref))
            m = re.search(r'^"%s",([^,]*),' % k, out, re.M)
            val = m.group(1) if m else "?"
            unit = re.search(r'unit:"([^"]+)"', out)
            print("  %-16s %s %s" % (k, val, unit.group(1) if unit else ""))
        out = evalz(ph, "emQuotaProgressAll(@p:mytest:r:%s, emThisMonthSpan())" % ref)
        for line in out.splitlines()[2:]:
            cells = [c.strip().strip('"') for c in line.split(",")]
            if len(cells) >= 11:
                print("  quota %-22s limit=%-9s used=%-12s ratio=%.3f level=%s" %
                      (cells[0], cells[1], cells[10], float(cells[9] or 0), cells[8]))
        print()
