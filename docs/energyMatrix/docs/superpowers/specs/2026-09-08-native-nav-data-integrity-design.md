# energyMatrix 原生设备树与示范数据完整性修复设计

日期：2026-09-08

状态：已确认，待实现

目标运行时：FIN Framework 5.3.0.2761 / FIN 项目 `mytest`

## 1. 背景与已验证事实

`emModelTree()` 使用 energyMatrix 自己的语义关系，当前可返回 51 个节点；FIN 原生设备树使用 `navMeta.equipPath` 与 Haystack 祖先引用，两者不是同一棵树。现场只显示 site/floor、看不到 equip/point 的直接原因如下：

1. 当前 `navMeta.equipPath` 为 `/site/floor/equip/point`，要求设备和点都具备完整的楼层祖先引用。
2. `mytest` 中 35 个 equip 全部缺少 `floorRef`；223 个 point 全部缺少 `floorRef`。
3. 223 个 point 的 `equipRef` 均有效，没有悬空引用；因此问题不是点与设备断链，而是原生导航祖先链不完整。
4. FIN 5.3 随附的 `legacy::NavPath` 文档和测试支持可选段 `[floor]`，合法路径为 `/site/[floor]/equip/point`。
5. 现有数据包含站级、跨楼层设备，不能为满足导航而伪造楼层。

现场数据完整性审计还发现：

- 31 块表中 28 块物理表都有唯一 L1 累积点。
- 28 个 L1 历史中 27 个有数据，每个 336 条逐小时样本；`1F 主力店考核表` 缺历史。
- 已有历史截止到 2026-09-06 23:00，不能支撑当前日页面。
- 298 条示范记录都没有持久化的 Synthetic/Mock 标签和来源说明。
- 台账、异常、工单、关账记录均为空，导致部分业务页面虽有主数据却不可演示。
- 3 个缺口差值点缺少介质单位；22 个功率因数点无单位是合理的无量纲表达。

## 2. 目标

1. FIN 原生设备树能够同时显示楼层内设备与站级/跨楼层设备，并展开到 point。
2. 新建 meter、virtual meter、gap meter、load group 时可选楼层；已有 `emSpaceRef` 时可安全推导楼层。
3. floor-bound equip 的所有 point 自动继承 `floorRef`；site-level equip 保持无 `floorRef`。
4. `emDemoBuild` 生成的数据有明确来源、完整近期历史，并可直接驱动台账与诊断页面。
5. 提供只读完整性审计和可审查的一次性 `mytest` 迁移脚本。

## 3. 非目标与安全边界

- 不改变 energyMatrix 自定义计量树的 `submeterOf` 语义。
- 不把跨楼层设备强行归入任意楼层。
- 不自动关账；关账具有业务冻结含义，必须由操作者显式执行。
- 不在源码、测试、日志或文档中保存现场凭据。
- 仓库规则只允许对上游执行 `read`、`hisRead` 和有限 Watch；实现阶段不会由 Codex 调用 Haystack 写入、`eval` 或控制接口。迁移脚本由操作者在 FIN 内审阅并执行，执行前后由只读查询验收。

## 4. 导航模型

将 `navMeta.equipPath` 改为：

```text
/site/[floor]/equip/point
```

行为如下：

```text
site
├─ floor
│  └─ equip（siteRef + floorRef）
│     └─ point（siteRef + floorRef + equipRef）
└─ equip（只有 siteRef，站级或跨楼层）
   └─ point（siteRef + equipRef）
```

`[floor]` 是可选导航段，不改变记录的 Haystack 类型。是否显示在楼层下只由真实的 `floorRef` 决定。

## 5. 后端模型与创建规则

### 5.1 模板

以下 equip 模板新增可选参数 `floorRef`：

- `EmMeterBase.trio`
- `EmVirtualMeter.trio`
- `EmGapMeter.trio`
- `EmLoad.trio`

所有 point 子模板在现有 `siteRef:Walk("equipRef>siteRef")` 旁增加：

```text
floorRef:Walk("equipRef>floorRef")
```

父 equip 无楼层时不产生 `floorRef`，不能写入空引用或伪造值。

### 5.2 创建服务

`emAddMeter`、`emAddVirtualMeter`、`emAddLoadGroup` 统一使用楼层归属解析器：

1. 参数显式提供 `floorRef` 时优先使用。
2. 未显式提供但存在 `emSpaceRef` 时，读取该空间/分区的 `floorRef`。
3. 两者都没有时保持站级。
4. 写入前验证目标记录确实是 `floor`，且 `floor.siteRef` 与目标 `siteRef` 一致。
5. 显式值与 `emSpaceRef` 推导值冲突时拒绝创建并返回可理解的错误，不静默选边。

该解析器位于 Fantom 模型/CRUD 层，前端不能成为唯一校验点。

## 6. 前端创建与编辑

在 Model 页面为 meter、virtual meter 和 load group 增加可选“所在楼层”字段：

- `fieldSchema.ts`：METER、LOAD 字段集加入 `floorRef`。
- `CreateDialog.tsx`：meter/load 创建参数允许提交 `floorRef`。
- `emApi.ts`：相关 `changesExpr` 引用白名单加入 `floorRef`；virtual meter 同时保留 `submeterOf`。
- 编辑已有 equip 时允许添加、修改或移除 `floorRef`，并通过后端校验同站关系。

UI 明确提示：不选楼层表示站级或跨楼层设备。

## 7. 示范数据

### 7.1 楼层映射

`emDemoBuild` 只为确定性对象设置楼层：

- 带 `emSpaceRef` 且空间已有 `floorRef` 的设备自动推导。
- 厨房动力支路 → 3F。
- 影院支路 → 4F。
- 车库充电桩支路 → B1。
- 厨房燃气表 → 3F。
- 总表、冷站、给排水等站级或跨楼层设备不设置楼层。

### 7.2 历史与业务派生

- 保存 `1F 主力店考核表` 的返回引用并调用 `emDemoHis`，补齐第 28 个 L1 历史。
- 历史终点改为“最近一个已完成整点”，保证 Today 页面有近期数据，同时避免写未来值。
- 缺口差值点按介质写入正确单位。
- `emDemoBuild(siteName, days, finalize)` 增加第三参数，默认 `finalize=true`：
  - `true`：建模、写历史、构建可用账期台账并运行诊断。
  - `false`：只建主数据和历史，便于快速结构测试。
- 不自动执行关账，不自动生成虚假的已确认工单。

### 7.3 来源标识

所有 demo 生成记录持久化写入：

```text
emSynthetic
emDataProvenance: "emDemoBuild"
```

派生台账、异常和后续 demo 工单继续携带相同来源。读取端不得把带该标识的数据呈现成真实现场数据。

## 8. 只读审计

新增 `emDataAudit(siteRef)`，返回问题网格而不是直接修复。每行至少包含：

- `severity`：error / warn / info
- `code`：稳定问题码
- `recRef`、`dis`
- `message`
- `suggestedAction`

覆盖规则：

- equip/point 祖先引用完整性与同站校验。
- point 的 `equipRef` 悬空检查。
- meter 拓扑环、跨介质父子关系、L1 点数量。
- his 标记与实际历史可读性、最新时间、采样顺序。
- point 单位合理性。
- Synthetic 标签与来源完整性。
- 台账/诊断/工单等业务派生数据是否存在及其来源。

审计函数只读，不在检查过程中提交 Diff。

## 9. `mytest` 一次性迁移

提供单独的、幂等的 Axon 迁移函数/脚本，分为预览和执行两个阶段：

1. 预览：列出将修改的 equip、point、navMeta、历史和派生记录，不提交。
2. 执行：仅在操作者在 FIN 内显式调用时提交。
3. 再次执行时跳过已经正确的记录，不重复生成台账/异常。
4. 只映射可证明的楼层；其余保留站级。
5. 给现有 298 条 demo 记录补 `emSynthetic` 和 `emDataProvenance`。
6. 补齐缺失的考核表历史并把 demo 历史滚动到最近完成整点。
7. 重建未关账的 demo 台账并运行诊断；不触碰真实来源或已关账记录。

迁移前导出 `mytest` 项目备份；回滚以该备份为准。源码同时提供删除本次派生 demo 数据的精确预览，但不自动执行删除。

## 10. 测试与验收

### 10.1 自动测试

- Fantom 模板测试：可选 `floorRef`、point 继承、无楼层时不生成空引用。
- CRUD 测试：显式楼层、空间推导、跨站拒绝、冲突拒绝。
- NavPath 兼容守卫：固定 `/site/[floor]/equip/point`，并记录 FIN 5.3 依据。
- Demo 测试：28 个物理 L1 均写历史、历史截止到最近完成整点、来源标签齐全、gap 单位齐全。
- 审计测试：对缺失祖先、悬空引用、陈旧历史和缺失来源产生稳定问题码。
- TypeScript 测试：meter/load 创建参数正确序列化 `floorRef`。

### 10.2 编译与静态门禁

在 `energy/energyMatrix` 执行：

```text
fan build.fan
```

在 `energy/energyMatrix/ts` 执行：

```text
npm test
npm run build
```

同时执行仓库要求的 tracked-secret 检查；不把凭据或现场响应写入测试产物。

### 10.3 `mytest` 只读验收

迁移由操作者执行后，使用 `read`/`hisRead` 验证：

- `navMeta.equipPath == "/site/[floor]/equip/point"`。
- floor-bound equip 同时有 `siteRef`、`floorRef`；其 point 具有相同两项与有效 `equipRef`。
- site-level equip 及 point 不含伪造 `floorRef`，仍能通过可选路径显示。
- 28/28 个物理 L1 均有历史，最新时间达到最近完成整点。
- 所有 demo 记录带 Synthetic 与 provenance。
- 未关账台账与诊断结果存在，且没有把缺失/陈旧数据当成 0 或正常。
- `emDataAudit(siteRef)` 无 error；允许保留经过解释的 info/warn。

## 11. 实施顺序

1. 先补失败测试与语法/兼容守卫。
2. 修改模板、Fantom 创建规则和导航配置。
3. 修改 TypeScript 创建/编辑链路。
4. 修复 demo 历史、来源、单位和 finalize 流程。
5. 实现只读审计及幂等迁移脚本。
6. 完成编译、测试和 FIN Expert 离线验证。
7. 输出迁移预览与操作者执行步骤。
8. 操作者在 FIN 内执行后，Codex 仅用只读接口完成最终验收。
