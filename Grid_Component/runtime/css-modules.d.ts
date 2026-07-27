/** CSS Modules 타입 선언 — import styles from "./x.module.css" */
declare module "*.module.css" {
  const classes: { readonly [key: string]: string };
  export default classes;
}

/** 전역 CSS 부수효과 import — import "./tokens.css" */
declare module "*.css";
