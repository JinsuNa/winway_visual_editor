import { useMemo, useState, type CSSProperties, type RefObject } from "react";
import type { CommonHandle, CommonProps, BorderSpec, FontSpec } from "./types";
import { getStyle } from "./styleRegistry";
import { resolveBorder, resolveColor, resolveFont } from "./styleUtils";

// 테마별 디자인 토큰(CSS 변수)을 루트 style에 주입 → 그 컴포넌트 하위가 해당 테마로 렌더된다.
const THEME_VARS: Record<"light" | "dark", Record<string, string>> = {
  light: {
    "--rve-bg": "#ffffff", "--rve-surface": "#ffffff", "--rve-fg": "#191f28",
    "--rve-muted": "#8b95a1", "--rve-border": "#e5e8eb", "--rve-fill": "#f2f4f6",
    "--rve-fill-hover": "#e8ebed", "--rve-primary": "#3182f6",
    "--rve-primary-hover": "#2b74dd", "--rve-primary-active": "#1b64da",
    "--rve-danger": "#f04452", "--rve-focus-ring": "rgba(49,130,246,0.35)",
  },
  dark: {
    "--rve-bg": "#17171c", "--rve-surface": "#1e1e24", "--rve-fg": "#e9ecef",
    "--rve-muted": "#8b95a1", "--rve-border": "#33363d", "--rve-fill": "#26272e",
    "--rve-fill-hover": "#30323a", "--rve-primary": "#4593fc",
    "--rve-primary-hover": "#5a9ffc", "--rve-primary-active": "#6faafd",
    "--rve-danger": "#ff6b78", "--rve-focus-ring": "rgba(69,147,252,0.4)",
  },
};

function themeVars(theme?: "light" | "dark"): CSSProperties {
  if (!theme) return {};
  return THEME_VARS[theme] as CSSProperties;
}

export interface UseCommonResult {
  /** 병합된 최종 인라인 스타일 (컴포넌트 자체 스타일보다 뒤에 병합) */
  style: CSSProperties;
  /** 현재 읽기 전용 여부 */
  readOnly: boolean;
  /** 현재 비활성 여부 */
  disabled: boolean;
  /** useImperativeHandle에 펼쳐 넣을 공통 핸들 */
  handle: CommonHandle;
}

/**
 * 모든 컴포넌트가 공유하는 공통 로직.
 * - 선언형 props(readOnly/disabled/background/border/font/styleName)를 초기값으로
 * - imperative 핸들(readOnly()/enable()/disable()/background()/setBorder()/setFont())로 런타임 변경
 *
 * 에디터는 매 편집마다 컴포넌트를 리마운트하므로 props가 항상 최신 초기값이 되고,
 * 한 번의 마운트 동안에는 imperative 변경이 우선한다.
 */
export function useCommonComponent(
  props: CommonProps,
  elementRef: RefObject<HTMLElement | null>
): UseCommonResult {
  const [readOnly, setReadOnly] = useState<boolean>(!!props.readOnly);
  const [enabled, setEnabled] = useState<boolean>(!props.disabled);
  const [font, setFont] = useState<FontSpec | undefined>(props.font);
  const [background, setBackground] = useState<string | undefined>(props.background);
  const [border, setBorder] = useState<BorderSpec | undefined>(props.border);

  const style = useMemo<CSSProperties>(() => {
    const named = getStyle(props.styleName) ?? {};
    const bg = resolveColor(background);
    return {
      ...themeVars(props.theme),
      ...named,
      ...resolveFont(font),
      ...(bg ? { background: bg } : {}),
      ...resolveBorder(border),
      ...props.style,
    };
  }, [props.styleName, props.style, props.theme, font, background, border]);

  const handle = useMemo<CommonHandle>(
    () => ({
      readOnly: (v: boolean) => setReadOnly(v),
      enable: () => setEnabled(true),
      disable: () => setEnabled(false),
      setFont: (f: FontSpec) => setFont((prev) => ({ ...prev, ...f })),
      background: (rgb: string) => setBackground(rgb),
      setBorder: (b: BorderSpec) => setBorder((prev) => ({ ...prev, ...b })),
      isEnabled: () => enabled,
      isReadOnly: () => readOnly,
      getElement: () => elementRef.current,
    }),
    [enabled, readOnly, elementRef]
  );

  return { style, readOnly, disabled: !enabled, handle };
}
