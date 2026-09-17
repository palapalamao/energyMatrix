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
        return "HTTP %s: %s" % (e.code, e.read().decode()[:200])
with open_haystack_client(URI, "su", "su") as ph:
    for name, ref in [("南院区","323941c3-8698da6e"),("西院区","323941c3-1a9a3819")]:
        out = evalz(ph, 'emLedgerTotal(@p:mytest:r:%s, toSpan(2026-08-01..2026-08-31), "elec")' % ref)
        print(name, "Aug elec:", out.strip().replace("\n"," "))
