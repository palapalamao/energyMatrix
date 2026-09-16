import type { HClient } from "@/api/client";

/**
 * MVVM 的 Store 基类（docs/fin/09-frontend-ts-vite.md §3.1）。
 *
 * 一个 Store 拥有一个功能的状态与取数逻辑。`initialize(client)` 由
 * `useViewModel` 调用，把 haystack-nclient 的 Client 注入进来 —— 这是
 * Store 的数据访问缝，别在 Store 内部自己 new Client。
 *
 * 具体子类在构造函数里调 `makeObservable(this, {...})` 显式标注：
 * MobX 6 的 `makeAutoObservable` 不支持子类。
 *
 * ⚠️ **每个 observable 字段都必须带初始化器**，可空字段写成
 * `foo: T | undefined = undefined`，**不要**写 `foo?: T`。
 *
 * 本项目的 tsconfig 是 `useDefineForClassFields: false`（装饰器需要），
 * 这时 TS 只为带初始化器的字段生成赋值；`foo?: T` 是纯类型声明，编译后
 * 实例上根本没有这个属性，`makeObservable` 会抛
 * `[MobX] minified error nr: 1 … Cannot decorate undefined property`——
 * 而且是生产构建下的压缩报错，从堆栈里看不出是哪个字段。
 *
 * `strict` 下的 `strictPropertyInitialization` 不会拦这种写法（可选属性豁免），
 * 所以类型检查是过的，只有运行时才炸。
 */
export abstract class BaseStore {
  initialized = false;

  abstract initialize(client: HClient): void;
}
