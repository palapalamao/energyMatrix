# -*- coding: utf-8 -*-
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
with open_haystack_client(URI, "su", "su") as ph:
    out = evalz(ph, "commit(diff(readById(@p:mytest:r:3239429a-1b7d24b5), {emRetired, dis: \"东院区 2026 绿电交易已注销\"}))")
    print("retire:", "errType" not in out)
    out = evalz(ph, 'emKpiComputeAll("CARBON_INTENSITY", [@p:mytest:r:323941c3-0060fb1b], emThisMonthSpan())')
    m = re.search(r'^"CARBON_INTENSITY",([^,]*),', out, re.M)
    print("东 CARBON_INTENSITY =", m.group(1) if m else out[:200])
