# emDiagRun 只读规则列表修复设计

## 背景

在 FIN 5.3.0.2761 项目中执行 `emDemoBuild("某医院", 14)` 时，最终调用
`emDiagRun(site, emThisMonthSpan())`，并抛出：

```text
sys::ReadonlyErr: List is readonly
```

问题位于 `EmDiagRuleEngine.activeRules`：`cx.proj.readAllList(...)` 返回的列表可能
为只读列表，而当前实现直接调用原地 `sort`。

## 修复设计

保持查询、规则排序和公开 Axon API 不变，只在排序前创建列表的可写浅副本：

```fan
all := cx.proj.readAllList(filter).dup
all.sort(...)
```

浅复制只复制列表容器，不修改其中的不可变 `Dict` 记录，适合当前按严重度排序的用途。
不调整 Folio、诊断判据、异常写入或 `emDemoBuild` 的业务流程。

## 测试

先增加一个回归测试，要求诊断规则排序不能直接修改 Folio 返回的列表，并验证规则仍按
`critical`、`warn`、`info` 降序排列。观察测试在旧实现上失败后，再完成最小代码修改。

修复后运行：

1. 聚焦的诊断规则回归测试；
2. energyMatrix Fantom 测试集；
3. energyMatrix Pod 构建；
4. FIN Expert 离线代码校验。

## 边界与发布

- 当前只修改源码和测试，不自动部署或重启运行中的 FIN。
- 不触碰工作区已有的前端及其他未提交改动。
- 编译通过只证明本地目标工作区兼容；部署后仍需在授权环境重新执行
  `emDemoBuild("某医院", 14)` 做运行验证。
