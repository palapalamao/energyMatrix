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

## 存量缺口：已清零（2026-09-18 回填完成）

2026-09-18 基线：点位 1469 条中 1047 条缺 `floorRef`，设备 167 条中 100 条缺
`floorRef`。当日已按方案 A 全量回填并终审 **ALL PASS**（1199 点位 / 全部设备 /
全部楼层满足红线；脚本与证据在 `docs/evidence/floorref_*.py`）：

- TRIO 点位级 `floorRef` 由 `Arg("floorRef:N")` 改为
  `Walk("equipRef>floorRef")`（9 个计量模板共 36 处；equip 级 Arg 保留）；
- 创建层 `EmEntityCrud.withFloor` 强制：无 `floorRef` 且无法从 `emSpaceRef`
  推导时直接 `ArgErr`；demo.trio 建数脚本已同步补楼层；
- 东/南/西院区与旧隔离医院原本**没有楼层记录**，已按本部院区楼层结构补建
  （各 6 层：地下能源中心 B1 / 门急诊医技 1F·2F / 住院护理 6F / 手术 ICU 9F /
  屋面能源设施），设备再按空间就近回填；
- 清理了 270 条 equipRef 悬空的孤儿点位（历史删除设备未级联的遗留）。

## 关键机制（实测结论，修改建模链路前必读）

1. **`Walk` 是构造期硬解析**：`ModelEntity.makeFromTrio` 时若 equip 没有
   `floorRef` 直接抛 `sys::Err: Missing currentStep:'floorRef'`（不是软失败）。
   因此存量设备未回填前，对老表执行任何会触发模型展开的操作（编辑页加载等）
   都会报错 —— 回填必须先于模板切换完成（本次已按此顺序执行）。
2. **Axon 里记录删除用 `wrappedDiffRemove(@ref)`**（finTools，内部自提交）。
   `diff(rec, {id:...})` 会被 folio 拒绝（Cannot set tag "id"）；
   `{remove}` 字典字面量只会加一个名叫 remove 的 marker 标签，不是删除。
3. 前端建模页 `floorRef` 已标记 `required: true`（真正强制在后端 withFloor）。
