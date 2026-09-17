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
with open_haystack_client(URI, "su", "su") as ph:
    print("== 东 carbon =="); print(evalz(ph, "emCarbonAccount(@p:mytest:r:323941c3-0060fb1b, emThisMonthSpan())")[:900])
    print("== 本部 carbon =="); print(evalz(ph, "emCarbonAccount(@p:mytest:r:3232ede5-bd4bda85, emThisMonthSpan())")[:900])
