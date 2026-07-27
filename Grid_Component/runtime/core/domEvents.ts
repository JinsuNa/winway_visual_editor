/**
 * DOM 이벤트 핸들러 전달 유틸.
 * 컴포넌트가 받은 props 중 `on*` 핸들러만 골라 루트 엘리먼트로 넘겨준다.
 * 내부 핸들러(예: Button의 hover 상태)와 겹치는 이벤트는 composeHandlers로 합성한다.
 */
export type AnyHandler = (...args: any[]) => void;

/** props에서 `onClick`/`onFocus` 같은 이벤트 핸들러만 추출 */
export function collectEventHandlers(
  props: Record<string, unknown>
): Record<string, any> {
  const out: Record<string, any> = {};
  for (const k in props) {
    if (/^on[A-Z]/.test(k) && typeof props[k] === "function") {
      out[k] = props[k] as AnyHandler;
    }
  }
  return out;
}

/** 여러 핸들러를 순서대로 호출하는 하나의 핸들러로 합성(내부 + 사용자) */
export function composeHandlers(
  ...fns: Array<AnyHandler | undefined>
): AnyHandler {
  return (...args: any[]) => {
    for (const f of fns) if (f) f(...args);
  };
}

/** 객체에서 특정 키들을 제외한 새 객체 */
export function omit(
  obj: Record<string, any>,
  keys: string[]
): Record<string, any> {
  const out: Record<string, any> = {};
  for (const k in obj) if (!keys.includes(k)) out[k] = obj[k];
  return out;
}
