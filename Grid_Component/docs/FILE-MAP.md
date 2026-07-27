# 파일 대응표 (이 폴더 ↔ 원본)

원본 프로젝트: `Winway_Visual_Editor` (VS Code 확장 + `@rve/components` 컴포넌트 라이브러리)

## 런타임 — 원문 그대로 복사

| 이 폴더 | 원본 경로 | 비고 |
| --- | --- | --- |
| `runtime/components/Grid/Grid.tsx` | `packages/components/src/components/Grid/Grid.tsx` | 래퍼 |
| `runtime/components/Grid/Grid.module.css` | 같은 폴더 | |
| `runtime/components/Grid/_lib/**` (9개 파일) | `packages/components/src/components/Grid/_lib/**` | winGrid 본체 |
| `runtime/core/cx.ts` | `packages/components/src/core/cx.ts` | |
| `runtime/core/types.ts` | `packages/components/src/core/types.ts` | `CommonProps`/`CommonHandle` |
| `runtime/core/useCommonComponent.ts` | 같은 폴더 | |
| `runtime/core/screen.tsx` | 같은 폴더 | `ScreenProvider`/`useInstance` |
| `runtime/core/styleUtils.ts` | 같은 폴더 | |
| `runtime/core/styleRegistry.ts` | 같은 폴더 | |
| `runtime/core/mask.ts` | 같은 폴더 | |
| `runtime/core/domEvents.ts` | 같은 폴더 | 공통 레이어 유지용 |
| `runtime/tokens/tokens.css` | `packages/components/src/tokens/tokens.css` | 디자인 토큰 |
| `runtime/css-modules.d.ts` | `packages/components/src/css-modules.d.ts` | |

## 런타임 — 새로 쓴 파일

| 이 폴더 | 근거 |
| --- | --- |
| `runtime/index.ts` | `packages/components/src/index.ts` 에서 Grid + core만 남긴 배럴 |

## 에디터 — 원문 그대로 복사

| 이 폴더 | 원본 경로 |
| --- | --- |
| `editor/extension/dataBinding.ts` | `src/dataBinding.ts` (전체) |
| `editor/extension/ast.ts` | `src/ast.ts` (전체) |

## 에디터 — 원문 발췌 (행 번호 = 원본 기준)

| 이 폴더 | 원본 경로 · 행 |
| --- | --- |
| `editor/extension/mutate.grid.ts` | `src/mutate.ts` 1-3, 5-10, 36-47, 70-100, 315-318, 348-354, 398-475 |
| `editor/extension/panel.grid-handlers.ts` | `src/panel.ts` 364-386(setProp/setProps), 412-477(scanJson/fetchJson), 587-609(applyEdits) |
| `editor/webview/webview.grid.js` | `media/webview.js` 11-29(A), 375-397(B), 104-107·546-566·1525-1529·2236-2241(C), 2174-2200(D), **2925-4102(E, Grid 본체 전체)** |
| `editor/webview/webview.grid.css` | `media/webview.css` 1290-1557 (파일 끝까지) |

## 에디터 — 재구성한 파일 (Grid 항목만 남김)

| 이 폴더 | 원본에서 가져온 부분 |
| --- | --- |
| `editor/extension/palette.grid.ts` | `src/palette.ts` — `PaletteComponent` 인터페이스 + `PALETTE`의 Grid 항목 |
| `editor/extension/methods.grid.ts` | `src/methods.ts` — `MethodDoc`, `COMMON_METHODS`, `MASK_METHOD`, `GRID`, `methodsFor`, `allMethods` |
| `editor/extension/events.grid.ts` | `src/events.ts` — `EventDoc`, `COMPONENT_EVENTS`의 Grid 항목, `eventsFor`, `allEvents` |

## 원본에 남아 있는 Grid 관련 흔적 (이식 시 참고)

이 폴더로 옮기지 않은, 원본의 다른 컴포넌트와 공유되는 지점입니다.

| 원본 위치 | 내용 |
| --- | --- |
| `src/registry.ts` `BUILTINS` | `"Grid"` 가 삭제 불가 기본 컴포넌트 목록에 포함 |
| `src/methods.ts` `MASK_METHOD` 주석 | 마스크 지원 컴포넌트 목록에 Grid 포함 |
| `media/webview.js` 961-966행 | 리프 컴포넌트 목록 `LIB_LEAVES`에 `"Grid"` 포함 → 드롭 시 자식을 받지 않는 컴포넌트로 판정 |
| `packages/components/src/index.ts` | Grid + Grid 타입 export |
| `packages/components/src/core/mask.ts` | 마스크 구현 (Grid도 사용) |

> `media/webview.js`·`media/webview.css`의 `grid`/`gridTemplateColumns` 등은 CSS 속성
> 이름이거나 팝업 레이아웃용이며 Grid 컴포넌트와 무관합니다.
> 다만 `webview.grid.js`/`webview.grid.css`에 포함된 `.rve-ms-*`, `.rve-gp-*` 격자 스타일은
> Grid 팝업 UI의 일부이므로 함께 옮겨야 합니다.
