# -*- coding: utf-8 -*-
import io
p = r"D:\mygithub\energyMatrix\energyMatrix\ts\src\pages\Model\fieldSchema.ts"
s = io.open(p, encoding="utf-8").read()
old = 'hint: "\u4eba\u5747\u80fd\u8017\u6307\u6807\u4e0e\u300c\u6309\u4eba\u6570\u5206\u644a\u300d\u8981\u7528" },'
new = old + '\n  { tag: "emBeds", label: "\u6838\u5b9a\u5e8a\u4f4d\u6570", type: "num",\n    hint: "\u5355\u4f4d\u5e8a\u4f4d\u80fd\u8017\uff08CBEI\uff09\u7684\u5206\u6bcd\uff0c\u533b\u9662\u7c7b\u7ad9\u70b9\u8003\u6838\u5fc5\u586b" },'
assert s.count(old) == 1, "anchor count %d" % s.count(old)
s = s.replace(old, new)
io.open(p, "w", encoding="utf-8", newline="\n").write(s)
print("OK")