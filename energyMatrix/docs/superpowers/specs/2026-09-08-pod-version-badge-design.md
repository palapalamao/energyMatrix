# energyMatrix Pod 版本显示设计

## 目标

将 energyMatrix pod 版本从 `0.1.0` 升级到 `0.1.1`，并在应用左侧栏最底部显示 FIN 当前实际加载的 pod 版本，便于开发和现场部署时快速判断缓存、复制或重启是否生效。

## 版本来源

版本唯一权威来源是 `build.fan` 中的 pod `version`。前端不写死版本，也不使用前端 `package.json` 的版本号。

前端通过现有只读 Axon 函数 `emInfo()` 获取版本。该函数返回 `EnergyMatrixExt#.pod.version.toStr`，因此显示值代表当前 FIN 进程实际加载的 pod，而不是磁盘上或源码中的预期版本。

## 前端组件

新增独立的 `PodVersionBadge` 组件：

- 通过 `haystack-react` 的 `useClient()` 复用全局 FIN 客户端。
- 通过现有 `emInfo(client)` 发起一次只读请求。
- 正常状态显示 `energyMatrix v0.1.1`。
- 加载状态显示 `energyMatrix v…`，保持布局稳定。
- 请求失败显示 `energyMatrix v?`，错误文本只通过 `title` 提供，不阻塞导航或业务页面。
- effect 卸载后不得继续更新状态。

组件放在 `AppShell` 左侧栏中，位于 `LedgerStatusBar` 下方，使用现有深色侧栏的低强调文字样式和顶部分隔线。它不参与导航，也不改变侧栏宽度。

## 数据流

```text
build.fan version 0.1.1
        ↓ pod 构建与 FIN 加载
EnergyMatrixLib.emInfo()
        ↓ 当前 Client /api/<project>/eval
PodVersionBadge
        ↓
左侧栏底部 energyMatrix v0.1.1
```

开发服务器通过 `VITE_FIN_PROJECT=mytest` 使用同一客户端和代理，因此外部 Vite 页面也显示 FIN 当前加载的版本。

## 测试与验收

- 为纯版本格式化函数增加 Node 测试：正常版本、缺失版本。
- 执行 `npm test`、`npm run typecheck`、`npm run build`。
- 使用 FIN 5.3.0.2761 执行完整 pod 构建。
- 安装并重启 FIN 后，`emInfo()->version` 与左下角文本均为 `0.1.1`。
- 未重启而仍加载旧 pod 时，界面应诚实显示旧版本，从而暴露部署未生效。
- FIN 不可达时页面保持可用，左下角显示 `energyMatrix v?`。

## 非目标

- 不修改前端 npm 包版本。
- 不增加轮询或自动刷新版本。
- 不新增全局状态管理。
- 不改变 `emInfo()` 返回结构或权限。
