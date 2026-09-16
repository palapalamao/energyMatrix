import type { I18n } from "@/i18n/I18NProvider";
import type { BaseStore } from "./BaseStore";

/**
 * MVVM 的 ViewModel 基类（docs/fin/09-frontend-ts-vite.md §3.1）。
 *
 * ViewModel 包住 Store 与当前 i18n 句柄，向 View 暴露展示逻辑与事件处理。
 * View 通过 `useViewModel(StoreCtor, ViewModelCtor)` 拿到它，并用
 * `observer(...)` 包住自己，这样 Store/ViewModel 的 observable 变化会触发重渲染。
 */
export abstract class BaseViewModel<S extends BaseStore> {
  store: S;
  i18n: I18n;

  constructor(store: S, i18n: I18n) {
    this.store = store;
    this.i18n = i18n;
  }

  /** 翻译快捷方式。 */
  t(key: string, fallback?: string): string {
    return this.i18n.translate(key, fallback);
  }
}
