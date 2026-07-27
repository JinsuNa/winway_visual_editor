/**
 * Grid — 소스 코드 변형(mutate) 코드 (출처: src/mutate.ts, 원문 그대로 발췌)
 *
 * Grid Properties / Data Binding 팝업이 "적용"을 누를 때 웹뷰가 보내는
 * setProps / setProp 메시지를 실제 텍스트 편집(TextEdit[])으로 바꾸는 부분이다.
 * Grid 흐름에 필요한 함수만 모아 자체적으로 컴파일되도록 구성했다.
 *
 * 필요 패키지: @babel/parser, @babel/traverse, @babel/types
 */
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";

/** 오프셋 기반 텍스트 교체 하나 */
export interface TextEdit {
  start: number;
  end: number;
  newText: string;
}

export interface MutateResult {
  edits: TextEdit[];
  error?: string;
}

function parseFile(source: string): t.File {
  return parse(source, {
    sourceType: "module",
    plugins: ["jsx", "typescript"],
    errorRecovery: true,
  });
}

/** start-end로 JSXElement 찾기 + 부모가 JSX 컨테이너(형제 삽입 가능)인지 */
function findElementWithParent(
  ast: t.File,
  start: number,
  end: number
): { node: t.JSXElement; parentIsJsxContainer: boolean } | undefined {
  let found: { node: t.JSXElement; parentIsJsxContainer: boolean } | undefined;
  traverse(ast, {
    JSXElement(path) {
      const el = path.node;
      if (el.start === start && el.end === end) {
        const pt = path.parent.type;
        found = {
          node: el,
          parentIsJsxContainer: pt === "JSXElement" || pt === "JSXFragment",
        };
        path.stop();
      }
    },
  });
  return found;
}

/** start-end로 JSXElement 찾기 (원본 src/mutate.ts의 findElement — Grid 흐름에선 미사용) */
export function findElement(
  ast: t.File,
  start: number,
  end: number
): t.JSXElement | undefined {
  return findElementWithParent(ast, start, end)?.node;
}

export interface TargetRequest {
  targetStart: number;
  targetEnd: number;
}

/** 여는 태그에서 이름의 attribute 찾기 */
function findAttr(el: t.JSXElement, name: string): t.JSXAttribute | undefined {
  for (const a of el.openingElement.attributes) {
    if (t.isJSXAttribute(a) && t.isJSXIdentifier(a.name) && a.name.name === name) return a;
  }
  return undefined;
}

/**
 * prop을 원시 JS 표현식으로 set/교체한다. 예: items={[{ key: "a", value: "A" }]}
 * expr가 ""면 prop 제거. (computeSetAttr는 문자열 리터럴 전용이라 별도)
 */
export function computeSetProp(
  source: string,
  req: TargetRequest & { name: string; expr: string }
): MutateResult {
  let ast: t.File;
  try {
    ast = parseFile(source);
  } catch (e: any) {
    return { edits: [], error: "파싱 실패: " + String(e?.message ?? e) };
  }
  const info = findElementWithParent(ast, req.targetStart, req.targetEnd);
  if (!info) return { edits: [], error: "대상 요소를 찾지 못했습니다." };
  const el = info.node;
  const attr = findAttr(el, req.name);

  if (req.expr === "") {
    if (!attr) return { edits: [] };
    let s = attr.start!;
    if (source[s - 1] === " ") s -= 1;
    return { edits: [{ start: s, end: attr.end!, newText: "" }] };
  }

  const newText = `${req.name}={${req.expr}}`;
  if (attr) {
    return { edits: [{ start: attr.start!, end: attr.end!, newText }] };
  }
  const at = el.openingElement.name.end!;
  return { edits: [{ start: at, end: at, newText: " " + newText }] };
}

/**
 * 여러 prop을 한 번의 edit로 set/교체/제거 (오프셋 밀림 방지).
 * 각 항목: { name, expr } = 원시 표현식(name={expr}), { name, value } = 문자열(name="value"),
 * value가 ""/undefined이고 expr 없으면 제거.
 */
export function computeSetProps(
  source: string,
  req: TargetRequest & { props: Array<{ name: string; value?: string; expr?: string }> }
): MutateResult {
  let ast: t.File;
  try {
    ast = parseFile(source);
  } catch (e: any) {
    return { edits: [], error: "파싱 실패: " + String(e?.message ?? e) };
  }
  const info = findElementWithParent(ast, req.targetStart, req.targetEnd);
  if (!info) return { edits: [], error: "대상 요소를 찾지 못했습니다." };
  const el = info.node;
  const edits: TextEdit[] = [];
  let insertText = "";

  for (const pr of req.props) {
    const hasExpr = pr.expr != null && pr.expr !== "";
    const remove = !hasExpr && (pr.value == null || pr.value === "");
    const valText = hasExpr ? `={${pr.expr}}` : `=${JSON.stringify(pr.value ?? "")}`;
    const attr = findAttr(el, pr.name);
    if (attr) {
      if (remove) {
        let s = attr.start!;
        if (source[s - 1] === " ") s -= 1;
        edits.push({ start: s, end: attr.end!, newText: "" });
      } else {
        edits.push({ start: attr.name.end!, end: attr.end!, newText: valText });
      }
    } else if (!remove) {
      insertText += ` ${pr.name}${valText}`;
    }
  }
  if (insertText) {
    const at = el.openingElement.name.end!;
    edits.push({ start: at, end: at, newText: insertText });
  }
  return { edits };
}
