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
import re
with open_haystack_client(URI, "su", "su") as ph:
    for name, ref in [("南院区","323941c3-8698da6e"),("西院区","323941c3-1a9a3819"),
                      ("东院区","323941c3-0060fb1b"),("本部院区","3232ede5-bd4bda85")]:
        out = evalz(ph, 'emEntityUpdate(@p:mytest:r:%s, {emRegion: "华东"})' % ref)
        ok = "errType" not in out
        print(name, "emRegion set:", ok)
        out = evalz(ph, 'emKpiComputeAll("CARBON_INTENSITY", [@p:mytest:r:%s], emThisMonthSpan())' % ref)
        m = re.search(r'^"CARBON_INTENSITY",([^,]*),', out, re.M)
        print("   CARBON_INTENSITY =", m.group(1) if m else out[:150])
        out = evalz(ph, 'emKpiComputeAll("CBEI", [@p:mytest:r:%s], emThisMonthSpan())' % ref)
        m = re.search(r'^"CBEI",([^,]*),', out, re.M)
        print("   CBEI =", m.group(1) if m else out[:150])
