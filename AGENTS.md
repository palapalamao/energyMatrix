# AGENTS.md — energyMatrix 工程约定

## 数据建模结构红线（2026-09-18 起生效，所有新增数据必须满足）

任何**新增**的设备（meter / equip）或点位（point），无论来源（手工建模、
Axon 脚本、建数/演示脚本、测试数据），都必须满足：

| 记录类型 | 必备标签 |
|---|---|
| 点位 point | `equipRef` + `floorRef` + `siteRef` |
| 设备 meter / equip | `floorRef` + `siteRef` |
| 楼层 floor | `siteRef` |

落地方式（按优先级）：

1. **显式 `floorRef`**：创建参数直接指定楼层；
2. **`emSpaceRef` 推导**：分区（zone）挂了 `floorRef` 时，由
   `EmFloorResolver` 自动继承（explicit 与推导冲突会报错，以 explicit 为准）；
3. TRIO 模板中 `siteRef` 用 `Walk(...)` 自动继承的链路必须保持可用
   （如 `Walk("equipRef>siteRef")`），不得改回手工传参。

注意：原说明书 OI-04 允许"跨楼层分区"（分区本身不强制挂楼层），但**分区之下
的设备/点位仍必须挂到单一楼层**（挂主楼层）。

## 已知存量缺口（规则生效前遗留，回填前不算违规）

2026-09-18 全量体检（FIN mytest）：点位 1469 条中 1047 条缺 `floorRef`，
设备 167 条中 100 条缺 `floorRef`；`siteRef` / `equipRef` 全量齐。
回填方案：设备按空间就近挂楼层（手术室→手术 ICU 9F、急诊→门急诊医技 1F 等），
点位从设备 Walk 继承。回填完成后此缺口应清零。
