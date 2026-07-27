import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

/**
 * 화면 컨트롤러 — SpiderGen/AFC의 `this` 역할.
 * 컴포넌트들이 자기 id로 인스턴스(핸들)를 등록하므로
 * 화면 로직에서 this.<id>.method() 형태로 접근할 수 있다.
 *
 *   const screen = useScreen();
 *   <ScreenProvider controller={screen}>
 *     <Button id="save" ... />
 *   </ScreenProvider>
 *   // 이후: screen.save.setLoading(true)  (== this.save.setLoading(true))
 */
export type ScreenController = Record<string, any>;

const ScreenContext = createContext<ScreenController | null>(null);

/**
 * 화면 컨트롤러를 얻는다.
 * - 상위에 ScreenProvider가 있으면 그 컨트롤러를 반환(컴포넌트들이 id로 등록한 인스턴스 공유).
 *   → 에디터 미리보기는 자동으로 ScreenProvider로 감싸므로 screen.<id>.method()가 바로 동작.
 * - 없으면 로컬 컨트롤러를 만들어 반환(이 경우 <ScreenProvider controller={screen}>로 감싸야 등록됨).
 */
export function useScreen<T = ScreenController>(): T {
  const ctx = useContext(ScreenContext);
  const local = useRef<ScreenController>({});
  // T로 id→핸들 타입을 지정하면 win.<id>.메서드() 자동완성이 뜬다.
  return (ctx ?? local.current) as unknown as T;
}

/** 하위 컴포넌트들이 id로 등록될 컨트롤러를 제공 */
export function ScreenProvider({
  controller,
  children,
}: {
  controller?: ScreenController;
  children: ReactNode;
}) {
  const fallback = useRef<ScreenController>({});
  const ctrl = controller ?? fallback.current;
  return <ScreenContext.Provider value={ctrl}>{children}</ScreenContext.Provider>;
}

/**
 * 에디터 미리보기에서는 메서드 호출을 console.log로 찍어 디버그 패널에 보이게 한다.
 * (window.__RVE_EDITOR__는 에디터 번들만 세팅 → 실제 배포 앱에는 로깅 없음)
 */
function wrapForEditor(id: string, handle: any): any {
  if (typeof window === "undefined" || !(window as any).__RVE_EDITOR__) return handle;
  return new Proxy(handle, {
    get(target, prop) {
      const v = target[prop as any];
      if (typeof v !== "function") return v;
      return (...args: any[]) => {
        try {
          const a = args
            .map((x) => {
              try {
                return JSON.stringify(x);
              } catch {
                return String(x);
              }
            })
            .join(", ");
          console.log(`▶ ${id}.${String(prop)}(${a})`);
        } catch {
          /* 로깅 실패는 무시 */
        }
        return v.apply(target, args);
      };
    },
  });
}

/** 컴포넌트가 자기 id로 핸들을 컨트롤러에 등록 (언마운트 시 해제) */
export function useRegister(id: string | undefined, handle: any): void {
  const ctrl = useContext(ScreenContext);
  useEffect(() => {
    if (!ctrl || !id) return;
    const inst = wrapForEditor(id, handle);
    ctrl[id] = inst;
    return () => {
      if (ctrl[id] === inst) delete ctrl[id];
    };
  }, [ctrl, id, handle]);
}

/** useImperativeHandle에 넣을 api를 만들고 동시에 id 등록까지 한 번에 */
export function useInstance<T>(id: string | undefined, factory: () => T, deps: any[]): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const api = useMemo(factory, deps);
  useRegister(id, api);
  return api;
}
