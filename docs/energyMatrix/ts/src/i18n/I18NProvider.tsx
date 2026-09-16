import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import zh from "./zh.json";
import en from "./en.json";

/**
 * SPA 侧的国际化。
 *
 * 注意：pod 里还有一份 `locale/{en,zh}.props` 供 Fantom / Folio 层使用
 * （Axon 函数名与菜单显示名）。两边是**独立的两份**，需要人工保持同步 ——
 * 改了这里记得去改 locale/*.props，反之亦然。
 */

export type Lang = "zh" | "en";

const BUNDLES: Record<Lang, Record<string, string>> = { zh, en };

export interface I18n {
  lang: Lang;
  setLang: (lang: Lang) => void;
  /** 查不到 key 时返回 fallback，再退到 key 本身 —— 绝不返回空串。 */
  translate: (key: string, fallback?: string) => string;
}

const I18NContext = createContext<I18n | null>(null);

export function I18NProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    // FIN 外壳的语言优先；取不到时按浏览器语言，最后退到中文。
    const nav = typeof navigator !== "undefined" ? navigator.language : "zh-CN";
    return nav.toLowerCase().startsWith("en") ? "en" : "zh";
  });

  const value = useMemo<I18n>(
    () => ({
      lang,
      setLang,
      translate: (key, fallback) => BUNDLES[lang][key] ?? fallback ?? key,
    }),
    [lang]
  );

  return <I18NContext.Provider value={value}>{children}</I18NContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18NContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18NProvider>");
  return ctx;
}

/** 组件里的翻译快捷方式。 */
export function useT() {
  return useI18n().translate;
}
