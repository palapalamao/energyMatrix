using haystack

**
** 计量树构建与校验 —— 纯函数，输入一批表计 Dict，输出树与问题清单。
**
** 不依赖 Folio / Context，因此可以在 `HaystackTest` 里直接单测
** （见 `fan/test/EmMeterTreeTest.fan`）。Folio 门面见 `EmMeterTree`。
**
** 落地说明书铁律 2：**表计层级用 `ph::submeterOf` 构成有向无环图，
** 禁止跨介质挂接（电表的父表只能是电表）**。这两条在这里是硬校验，
** 检出的环会被就地剪断，保证下游汇总不会无限递归。
**
const class EmMeterTreeBuilder
{
  ** 问题级别。
  static const Str levelErr  := "err"
  static const Str levelWarn := "warn"

  ** 环检测的向上遍历上限，防御性上界（正常项目层级 < 10）。
  private static const Int maxWalk := 128

  **
  ** 从一批表计记录建树。
  **
  ** 返回的 `EmMeterTreeResult` 里：
  **  - `roots`  无父表（或父引用被判定非法而剪断）的节点
  **  - `all`    全部节点
  **  - `issues` 校验问题，每条是 {level, code, msg, meterRef}
  **
  static EmMeterTreeResult build(Dict[] recs) {
    issues := Dict[,]
    nodes  := EmMeterNode[,]
    byId   := Ref:EmMeterNode[:]

    recs.each |Dict r| {
      n := EmMeterNode(r)
      if (byId.containsKey(n.id)) {
        issues.add(issue(levelErr, "meter.id.duplicate", "表计 id 重复：$n.dis", n.id))
      } else {
        byId[n.id] = n
        nodes.add(n)
      }
    }

    // ---- 1) 解析父引用 ----
    nodes.each |EmMeterNode n| {
      pid := n.parentId
      if (pid == null) return
      if (pid == n.id) {
        issues.add(issue(levelErr, "meter.parent.self",
          "submeterOf 指向自身：$n.dis", n.id))
        return
      }
      p := byId[pid]
      if (p == null) {
        issues.add(issue(levelErr, "meter.parent.dangling",
          "submeterOf 指向不存在的表 " + pid.toCode + "：$n.dis", n.id))
        return
      }
      n.parent = p
    }

    // ---- 2) 环检测：沿 parent 向上走，撞到路径里已出现的节点即为环 ----
    nodes.each |EmMeterNode n| {
      seen := Ref:Bool[:]
      seen[n.id] = true
      cur := n
      i := 0
      while (cur.parent != null && i < maxWalk) {
        p := cur.parent
        if (seen.containsKey(p.id)) {
          issues.add(issue(levelErr, "meter.cycle",
            "计量树出现环：$cur.dis → $p.dis（已剪断该父引用）", cur.id))
          cur.parent = null   // 就地剪断，保证下游递归可终止
          break
        }
        seen[p.id] = true
        cur = p
        i++
      }
      if (i >= maxWalk) {
        issues.add(issue(levelErr, "meter.depth.exceeded",
          "计量树层级超过 $maxWalk，疑似环：$n.dis", n.id))
        n.parent = null
      }
    }

    // ---- 3) 介质校验 + 跨介质挂接 ----
    nodes.each |EmMeterNode n| {
      if (n.medium == null) {
        issues.add(issue(levelErr, "meter.medium.unknown",
          "无法判定介质（缺 emMedium 标签且无可推断的标记）：$n.dis", n.id))
      }
      p := n.parent
      if (p != null && n.medium != null && p.medium != null && n.medium != p.medium) {
        issues.add(issue(levelErr, "meter.medium.mismatch",
          "跨介质挂接：$n.dis($n.medium) 的父表是 $p.dis($p.medium)", n.id))
      }
    }

    // ---- 4) 虚表必须有公式 ----
    nodes.each |EmMeterNode n| {
      if (n.isVirtual && (n.rec["emFormula"] as Str) == null) {
        issues.add(issue(levelErr, "meter.virtual.noFormula",
          "虚拟表缺少 emFormula：$n.dis", n.id))
      }
    }

    // ---- 5) 挂子节点 ----
    nodes.each |EmMeterNode n| {
      p := n.parent
      if (p != null) p.children.add(n)
    }
    nodes.each |EmMeterNode n| {
      n.children.sort |EmMeterNode a, EmMeterNode b -> Int| { return a.dis <=> b.dis }
    }

    // ---- 6) 根节点 + 每介质关口表唯一性 ----
    roots := EmMeterNode[,]
    nodes.each |EmMeterNode n| { if (n.isRoot) roots.add(n) }
    roots.sort |EmMeterNode a, EmMeterNode b -> Int| { return a.dis <=> b.dis }

    gatewayCount := Str:Int[:]
    nodes.each |EmMeterNode n| {
      if (n.role != EmMeterRole.gateway) return
      m := n.medium ?: "?"
      gatewayCount[m] = (gatewayCount[m] ?: 0) + 1
    }
    gatewayCount.each |Int c, Str m| {
      if (c > 1) issues.add(issue(levelWarn, "meter.gateway.multiple",
        "介质 $m 存在 $c 块关口表；关口表应是唯一权威源", null))
    }

    return EmMeterTreeResult(roots, nodes, issues)
  }

  ** 构造一条问题记录。
  static Dict issue(Str level, Str code, Str msg, Ref? meterRef) {
    Etc.makeDict([
      "level":    level,
      "code":     code,
      "msg":      msg,
      "meterRef": meterRef,
    ])
  }
}

**
** `EmMeterTreeBuilder.build` 的返回值。
**
class EmMeterTreeResult
{
  new make(EmMeterNode[] roots, EmMeterNode[] all, Dict[] issues) {
    this.roots  = roots
    this.all    = all
    this.issues = issues
    m := Ref:EmMeterNode[:]
    all.each |EmMeterNode n| { m[n.id] = n }
    this.byId = m
  }

  EmMeterNode[] roots
  EmMeterNode[] all
  Dict[] issues
  Ref:EmMeterNode byId

  ** 是否存在 err 级问题（存在时不应进入关账）。
  Bool hasErrors() {
    found := false
    issues.each |Dict i| { if (i["level"] == EmMeterTreeBuilder.levelErr) found = true }
    return found
  }

  ** 只保留某介质的子树根。
  EmMeterNode[] rootsOf(Str medium) {
    out := EmMeterNode[,]
    roots.each |EmMeterNode n| { if (n.medium == medium) out.add(n) }
    return out
  }

  ** 按 id 取节点。
  EmMeterNode? node(Ref id) { byId[id] }

  ** 扁平化成前端可渲染的行（前序，带 emDepth）。
  Dict[] toRows() {
    out := Dict[,]
    roots.each |EmMeterNode r| {
      r.descendants.each |EmMeterNode n| { out.add(n.toRow) }
    }
    return out
  }
}
