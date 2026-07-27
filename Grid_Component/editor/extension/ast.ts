import { parse } from "@babel/parser";
import traverse, { NodePath, Scope } from "@babel/traverse";
import * as t from "@babel/types";

/** 편집 가능한 값 트리 — expression prop을 재귀적으로 펼친 것 */
export type RveValue =
  | {
      kind: "object";
      entries: { key: string; value: RveValue }[];
      /** 항목 추가를 위한 리터럴 위치 */
      start: number;
      end: number;
      file: string;
    }
  | { kind: "array"; items: RveValue[]; start: number; end: number; file: string }
  | {
      kind: "raw";
      text: string;
      /** 정의 위치 (있으면 "코드로 이동" 가능) */
      file?: string;
      start?: number;
      end?: number;
    }
  | {
      kind: "leaf";
      type: "string" | "number" | "boolean";
      text: string;
      start: number;
      end: number;
      /** 이 값이 실제로 존재하는 파일 (import 추적 시 대상 파일과 다를 수 있음) */
      file: string;
    };

/** 인스펙터에서 편집 가능한 속성 하나 */
export interface RveProp {
  name: string;
  kind: "string" | "number" | "boolean" | "expression" | "text";
  text: string;
  start: number;
  end: number;
  shorthand?: boolean;
  /** expression인 경우 펼친 값 트리 (가능할 때만) */
  value?: RveValue;
}

/** 인스펙터 전용 필드의 현재 값 (id/class/위치·크기) */
export interface RveAttrs {
  id?: string;
  className?: string;
  /** style 객체 안의 top/right/bottom/left/width/height 현재 값 (문자열) */
  style: Record<string, string>;
}

/** JSX 요소 트리 노드 */
export interface RveNode {
  id: string;
  name: string;
  props: RveProp[];
  children: RveNode[];
  /** 새 prop을 삽입할 위치 (여는 태그 이름 바로 뒤) */
  attrInsertPos: number;
  /** 인스펙터 전용(id/class/위치·크기) 현재 값 */
  attrs: RveAttrs;
}

const EDITABLE_STYLE_KEYS = ["top", "right", "bottom", "left", "width", "height"];

/** id/className/위치·크기 등 인스펙터 전용 값 추출 */
function extractAttrs(el: t.JSXElement): RveAttrs {
  const out: RveAttrs = { style: {} };
  for (const attr of el.openingElement.attributes) {
    if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name)) continue;
    const name = attr.name.name;
    if (name === "id" && t.isStringLiteral(attr.value)) {
      out.id = attr.value.value;
    } else if (name === "className" && t.isStringLiteral(attr.value)) {
      out.className = attr.value.value;
    } else if (
      name === "style" &&
      t.isJSXExpressionContainer(attr.value) &&
      t.isObjectExpression(attr.value.expression)
    ) {
      for (const p of attr.value.expression.properties) {
        if (!t.isObjectProperty(p) || p.computed) continue;
        const key = t.isIdentifier(p.key)
          ? p.key.name
          : t.isStringLiteral(p.key)
            ? p.key.value
            : undefined;
        // 모든 style 키를 잡는다 (위치·크기 + 그 외 자유 스타일)
        if (key) {
          if (t.isNumericLiteral(p.value)) out.style[key] = String(p.value.value);
          else if (t.isStringLiteral(p.value)) out.style[key] = p.value.value;
          else if (
            t.isUnaryExpression(p.value) &&
            p.value.operator === "-" &&
            t.isNumericLiteral(p.value.argument)
          ) {
            out.style[key] = "-" + String(p.value.argument.value);
          }
        }
      }
    }
  }
  return out;
}

/** import 경로("./x", "@/lib/y")를 실제 파일로 해석해 내용을 돌려주는 콜백 */
export type ModuleResolver = (
  specifier: string
) => { file: string; source: string } | undefined;

interface Ctx {
  resolve?: ModuleResolver;
  /** 파일별 파싱 캐시 */
  parsed: Map<string, t.File>;
  /** 순환 참조 방지: "file:name" */
  seen: Set<string>;
}

const MAX_DEPTH = 6;
const MAX_ITEMS = 100;

function parseSource(source: string): t.File {
  return parse(source, {
    sourceType: "module",
    plugins: ["jsx", "typescript"],
    errorRecovery: true,
  });
}

/** 소스 전체를 파싱해 JSX 요소 트리를 만든다 */
export function buildTree(
  source: string,
  filePath: string,
  resolve?: ModuleResolver
): RveNode[] {
  const ast = parseSource(source);
  const ctx: Ctx = { resolve, parsed: new Map(), seen: new Set() };

  const roots: RveNode[] = [];
  const stack: RveNode[] = [];

  // ScreenProvider는 DOM/레이아웃에 영향 없는 컨텍스트 래퍼 → 구조 트리에서 투명 처리
  const isTransparent = (el: t.JSXElement) =>
    jsxName(el.openingElement.name).split(".").pop() === "ScreenProvider";

  traverse(ast, {
    JSXElement: {
      enter(path) {
        const el = path.node;
        if (isTransparent(el)) return; // 노드 생성·push 안 함 (자식이 상위에 붙음)
        const node: RveNode = {
          id: `${el.start}-${el.end}`,
          name: jsxName(el.openingElement.name),
          props: collectProps(path, source, filePath, ctx),
          children: [],
          attrInsertPos: el.openingElement.name.end!,
          attrs: extractAttrs(el),
        };
        if (stack.length > 0) {
          stack[stack.length - 1].children.push(node);
        } else {
          roots.push(node);
        }
        stack.push(node);
      },
      exit(path) {
        if (isTransparent(path.node)) return; // enter에서 push 안 했으므로 pop도 안 함
        stack.pop();
      },
    },
  });

  return roots;
}

function jsxName(name: t.JSXOpeningElement["name"]): string {
  if (t.isJSXIdentifier(name)) return name.name;
  if (t.isJSXMemberExpression(name)) {
    return `${jsxName(name.object as t.JSXIdentifier)}.${name.property.name}`;
  }
  if (t.isJSXNamespacedName(name)) return `${name.namespace.name}:${name.name.name}`;
  return "unknown";
}

function collectProps(
  path: NodePath<t.JSXElement>,
  source: string,
  filePath: string,
  ctx: Ctx
): RveProp[] {
  const el = path.node;
  const props: RveProp[] = [];

  for (const attr of el.openingElement.attributes) {
    if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name)) continue;
    const name = attr.name.name;
    const v = attr.value;

    if (v == null) {
      props.push({
        name,
        kind: "boolean",
        text: "true",
        start: attr.start!,
        end: attr.end!,
        shorthand: true,
      });
    } else if (t.isStringLiteral(v)) {
      props.push({ name, kind: "string", text: v.value, start: v.start!, end: v.end! });
    } else if (t.isJSXExpressionContainer(v)) {
      const ex = v.expression;
      if (t.isNumericLiteral(ex)) {
        props.push({ name, kind: "number", text: String(ex.value), start: v.start!, end: v.end! });
      } else if (t.isBooleanLiteral(ex)) {
        props.push({ name, kind: "boolean", text: String(ex.value), start: v.start!, end: v.end! });
      } else if (t.isStringLiteral(ex)) {
        props.push({ name, kind: "string", text: ex.value, start: v.start!, end: v.end! });
      } else {
        // 복합 표현식 → 값 트리로 펼치기 시도 (객체/배열/상수 참조)
        const value = buildValue(ex, filePath, source, path.scope, ctx, 0);
        props.push({
          name,
          kind: "expression",
          text: source.slice(v.start! + 1, v.end! - 1),
          start: v.start!,
          end: v.end!,
          value,
        });
      }
    }
  }

  let textIndex = 0;
  for (const child of el.children) {
    if (t.isJSXText(child) && child.value.trim().length > 0) {
      textIndex++;
      props.push({
        name: textIndex === 1 ? "(텍스트)" : `(텍스트 ${textIndex})`,
        kind: "text",
        text: child.value,
        start: child.start!,
        end: child.end!,
      });
    }
  }

  return props;
}

/** 표현식을 편집 가능한 값 트리로 재귀 변환 */
function buildValue(
  node: t.Node,
  file: string,
  source: string,
  scope: Scope | null,
  ctx: Ctx,
  depth: number
): RveValue {
  const raw = (): RveValue => ({
    kind: "raw",
    text:
      node.start != null && node.end != null
        ? source.slice(node.start, node.end)
        : "…",
    file,
    start: node.start ?? undefined,
    end: node.end ?? undefined,
  });

  if (depth > MAX_DEPTH) return raw();

  // ---- 리프 값 ----
  if (t.isStringLiteral(node)) {
    return { kind: "leaf", type: "string", text: node.value, start: node.start!, end: node.end!, file };
  }
  if (t.isNumericLiteral(node)) {
    return { kind: "leaf", type: "number", text: String(node.value), start: node.start!, end: node.end!, file };
  }
  if (t.isBooleanLiteral(node)) {
    return { kind: "leaf", type: "boolean", text: String(node.value), start: node.start!, end: node.end!, file };
  }
  // 음수: -5 는 UnaryExpression(-)이므로 전체 범위를 리프로
  if (
    t.isUnaryExpression(node) &&
    node.operator === "-" &&
    t.isNumericLiteral(node.argument)
  ) {
    return {
      kind: "leaf",
      type: "number",
      text: "-" + String(node.argument.value),
      start: node.start!,
      end: node.end!,
      file,
    };
  }
  // 표현식 없는 템플릿 리터럴 → 문자열 취급
  if (t.isTemplateLiteral(node) && node.expressions.length === 0) {
    return {
      kind: "leaf",
      type: "string",
      text: node.quasis[0]?.value.cooked ?? "",
      start: node.start!,
      end: node.end!,
      file,
    };
  }

  // ---- 흔한 포장 벗기기 ----
  if (t.isCallExpression(node)) {
    const callee = node.callee;
    // useMemo(() => X, []) / useCallback(() => X, [])
    if (
      t.isIdentifier(callee) &&
      (callee.name === "useMemo" || callee.name === "useCallback")
    ) {
      const fn = node.arguments[0];
      if (t.isArrowFunctionExpression(fn) || t.isFunctionExpression(fn)) {
        if (t.isExpression(fn.body)) {
          return buildValue(fn.body, file, source, scope, ctx, depth);
        }
        if (t.isBlockStatement(fn.body)) {
          const ret = fn.body.body.find((s): s is t.ReturnStatement =>
            t.isReturnStatement(s)
          );
          if (ret?.argument) {
            return buildValue(ret.argument, file, source, scope, ctx, depth);
          }
        }
      }
    }
    // defineColumns([...]) / autoColumns([], {...}, {...}) 같은 헬퍼:
    // 리터럴 인자 중 내용이 가장 많은 것(실제 설정)을 편집 대상으로
    const litArgs = node.arguments.filter(
      (a): a is t.ObjectExpression | t.ArrayExpression =>
        t.isObjectExpression(a) || t.isArrayExpression(a)
    );
    if (litArgs.length > 0) {
      const size = (n: t.ObjectExpression | t.ArrayExpression) =>
        t.isObjectExpression(n) ? n.properties.length : n.elements.length;
      const best = litArgs.reduce((a, b) => (size(b) > size(a) ? b : a));
      if (size(best) > 0) {
        return buildValue(best, file, source, scope, ctx, depth);
      }
    }
  }

  // ---- 컨테이너 ----
  if (t.isObjectExpression(node)) {
    const entries: { key: string; value: RveValue }[] = [];
    for (const p of node.properties.slice(0, MAX_ITEMS)) {
      if (t.isObjectProperty(p) && !p.computed) {
        const key = t.isIdentifier(p.key)
          ? p.key.name
          : t.isStringLiteral(p.key)
            ? p.key.value
            : undefined;
        if (key != null) {
          entries.push({
            key,
            value: buildValue(p.value, file, source, scope, ctx, depth + 1),
          });
          continue;
        }
      }
      // 스프레드, 메서드 등
      if (p.start != null && p.end != null) {
        entries.push({ key: "…", value: { kind: "raw", text: source.slice(p.start, p.end) } });
      }
    }
    return { kind: "object", entries, start: node.start!, end: node.end!, file };
  }

  if (t.isArrayExpression(node)) {
    const items: RveValue[] = [];
    for (const elem of node.elements.slice(0, MAX_ITEMS)) {
      if (elem == null) {
        items.push({ kind: "raw", text: "empty" });
      } else {
        items.push(buildValue(elem, file, source, scope, ctx, depth + 1));
      }
    }
    return { kind: "array", items, start: node.start!, end: node.end!, file };
  }

  // ---- 상수 참조 추적 ----
  if (t.isIdentifier(node) && scope) {
    const binding = scope.getBinding(node.name);
    if (binding) {
      const seenKey = `${file}:${node.name}`;
      if (ctx.seen.has(seenKey)) return raw();
      ctx.seen.add(seenKey);
      try {
        // 같은 파일의 const NAME = ... 참조
        if (
          binding.path.isVariableDeclarator() &&
          binding.path.node.init &&
          binding.constant
        ) {
          return buildValue(binding.path.node.init, file, source, binding.scope, ctx, depth + 1);
        }
        // import한 상수 (mockData 등)
        if (binding.kind === "module" && ctx.resolve) {
          const importPath = binding.path;
          const decl = importPath.parent;
          if (t.isImportDeclaration(decl)) {
            const spec = decl.source.value;
            let importedName = "default";
            if (importPath.isImportSpecifier()) {
              const imported = importPath.node.imported;
              importedName = t.isIdentifier(imported) ? imported.name : imported.value;
            }
            const mod = ctx.resolve(spec);
            if (mod) {
              const resolved = resolveExported(importedName, mod.file, mod.source, ctx, depth + 1);
              if (resolved) return resolved;
            }
          }
        }
      } finally {
        ctx.seen.delete(seenKey);
      }

      // 리터럴로 풀 수 없는 참조(함수 핸들러 등) → 정의 위치로 이동 가능한 raw
      const def = binding.path.node;
      if (def.start != null && def.end != null) {
        return {
          kind: "raw",
          text: source.slice(node.start!, node.end!),
          file,
          start: def.start,
          end: def.end,
        };
      }
    }
  }

  return raw();
}

/** 다른 파일에서 export된 값 찾기 (export const NAME = ..., export default ...) */
function resolveExported(
  name: string,
  file: string,
  source: string,
  ctx: Ctx,
  depth: number
): RveValue | undefined {
  if (depth > MAX_DEPTH) return undefined;

  let ast = ctx.parsed.get(file);
  if (!ast) {
    try {
      ast = parseSource(source);
      ctx.parsed.set(file, ast);
    } catch {
      return undefined;
    }
  }

  let result: RveValue | undefined;
  traverse(ast, {
    Program(p) {
      if (name === "default") {
        const def = p.node.body.find((s) => t.isExportDefaultDeclaration(s));
        if (def && t.isExportDefaultDeclaration(def) && t.isExpression(def.declaration)) {
          result = buildValue(def.declaration, file, source, p.scope, ctx, depth);
        }
      } else {
        const binding = p.scope.getBinding(name);
        if (binding && binding.path.isVariableDeclarator() && binding.path.node.init) {
          result = buildValue(binding.path.node.init, file, source, binding.scope, ctx, depth);
        }
      }
      p.stop();
    },
  });
  return result;
}
