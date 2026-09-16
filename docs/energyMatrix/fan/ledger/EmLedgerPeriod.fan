using haystack

**
** 账期键（`emPeriod`）与台账编码（`dis`）。
**
** 说明书把台账条目的账期建模成 `span`（Span，左闭右开）。Span 无法用 Haystack
** filter 直接做等值查询，而"同一块表 + 同一账期只能有一条有效条目"是幂等重建
** 与红冲链的前提，所以本 pod 额外落一个 **可索引的字符串账期键** `emPeriod`：
**
**   hourly   2026-07-15T13
**   daily    2026-07-15
**   monthly  2026-07
**   yearly   2026
**
** 这是对说明书模型的**增补**（不是修改）：`span` 仍是语义权威，`emPeriod`
** 只是它的索引投影，两者由本类保证一致。已在 README「与说明书的偏差」记录。
**
** 台账编码按说明书 §2.3 表 2-1：`L-年月-流水`，如 `L-2607-0142`。
**
const class EmLedgerPeriod
{
  ** 由账期起点与粒度算出账期键。用 span.start 而非 end —— 左闭右开区间的
  ** 归属是起点那一天/那个月。
  static Str key(Span span, Str granularity) {
    d := span.start.date
    if (granularity == EmGranularity.hourly) {
      return "" + d.toStr + "T" + span.start.hour.toStr.padl(2, '0')
    }
    if (granularity == EmGranularity.daily)   return d.toStr
    if (granularity == EmGranularity.monthly) return "" + d.year + "-" + (d.month.ordinal + 1).toStr.padl(2, '0')
    if (granularity == EmGranularity.yearly)  return d.year.toStr
    throw ArgErr("未知粒度：$granularity")
  }

  ** 台账编码 `L-yyMM-nnnn`。seq 从 1 起。
  static Str code(Span span, Int seq) {
    d := span.start.date
    yy := (d.year % 100).toStr.padl(2, '0')
    mm := (d.month.ordinal + 1).toStr.padl(2, '0')
    return "L-" + yy + mm + "-" + seq.toStr.padl(4, '0')
  }

  ** 关账批次编码 `C-yyMM`。
  static Str closeCode(Span span) {
    d := span.start.date
    yy := (d.year % 100).toStr.padl(2, '0')
    mm := (d.month.ordinal + 1).toStr.padl(2, '0')
    return "C-" + yy + mm
  }
}
