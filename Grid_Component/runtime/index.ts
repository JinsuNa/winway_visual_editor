// Grid 런타임 배럴 — 원본 packages/components/src/index.ts 에서 Grid 관련만 남긴 것.
// 디자인 토큰을 부수효과로 주입 (한 번만)
import "./tokens/tokens.css";

// ---- 컴포넌트 ----
export { Grid } from "./components/Grid/Grid";
export type { GridProps, GridHandle } from "./components/Grid/Grid";
export type {
  Column,
  LeafColumn,
  GroupColumn,
  FooterDef,
  CellType,
  SortState,
  SelectionMode,
  Row as GridRow,
} from "./components/Grid/_lib/types";

// ---- core (공용 유틸/타입) ----
export type {
  CommonProps,
  CommonHandle,
  FontSpec,
  BorderSpec,
} from "./core/types";
export {
  ScreenProvider,
  useScreen,
  useRegister,
  useInstance,
} from "./core/screen";
export type { ScreenController } from "./core/screen";
export { registerStyle, registerStyles, getStyle, unregisterStyle } from "./core/styleRegistry";
export { registerMask, getMask, applyMask } from "./core/mask";
export type { MaskType, MaskFn } from "./core/mask";
