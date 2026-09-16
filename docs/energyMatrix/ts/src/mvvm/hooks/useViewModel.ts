import { useState } from "react";
import { useClient } from "haystack-react";
import { useI18n, type I18n } from "@/i18n/I18NProvider";
import type { BaseStore } from "../base/BaseStore";
import type { BaseViewModel } from "../base/BaseViewModel";

/**
 * useViewModel（docs/fin/09-frontend-ts-vite.md §3.2）。
 *
 * 只构造一次 Store，注入 Client（`store.initialize(client)`），返回绑定了
 * 该 Store 与当前 i18n 的 ViewModel。
 */
export function useViewModel<S extends BaseStore, VM extends BaseViewModel<S>>(
  StoreCtor: new () => S,
  ViewModelCtor: new (store: S, i18n: I18n) => VM
): VM {
  const client = useClient();
  const i18n = useI18n();
  const [viewModel] = useState<VM>(() => {
    const store = new StoreCtor();
    store.initialize(client);
    return new ViewModelCtor(store, i18n);
  });
  return viewModel;
}
