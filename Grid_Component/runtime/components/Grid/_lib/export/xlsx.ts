/**
 * 최소 XLSX(SpreadsheetML) 생성기 — 외부 의존성 없음.
 * ECMA-376 공개 표준의 스키마를 따르며, 병합 헤더/푸터·숫자/문자 셀·기본 스타일을 지원한다.
 */
import { Column, LeafColumn, Row } from '../types';
import { buildFooterCells, buildHeaderModel } from '../utils/headers';
import { aggregate } from '../utils/aggregate';
import { createZip, ZipEntry } from './zip';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 1-based 컬럼 번호 -> A, B, ..., Z, AA ... */
export function colRef(col: number): string {
  let s = '';
  let n = col;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function cellRef(col: number, row: number): string {
  return `${colRef(col)}${row}`;
}

type CellValue = string | number | boolean | null | undefined;

interface XlsxCell {
  col: number;
  value: CellValue;
  /** styles.xml cellXfs 인덱스: 0 기본, 1 헤더, 2 푸터 */
  style?: number;
}

function cellXml(rowIdx: number, c: XlsxCell): string {
  const ref = cellRef(c.col, rowIdx);
  const s = c.style ? ` s="${c.style}"` : '';
  const v = c.value;
  if (v === null || v === undefined || v === '') {
    return c.style ? `<c r="${ref}"${s}/>` : '';
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    return `<c r="${ref}"${s}><v>${v}</v></c>`;
  }
  if (typeof v === 'boolean') {
    return `<c r="${ref}"${s} t="b"><v>${v ? 1 : 0}</v></c>`;
  }
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`;
}

export interface XlsxExportInput<R extends Row = Row> {
  columns: Column<R>[];
  rows: R[];
  sheetName?: string;
  /** 푸터 포함 여부 (기본: footer 정의가 하나라도 있으면 포함) */
  includeFooter?: boolean;
}

function exportCellValue<R extends Row>(leaf: LeafColumn<R>, row: R): CellValue {
  const raw = row[leaf.key];
  if (leaf.exportValue) return leaf.exportValue(raw, row);
  if (
    typeof raw === 'number' ||
    typeof raw === 'string' ||
    typeof raw === 'boolean' ||
    raw === null ||
    raw === undefined
  ) {
    return raw as CellValue;
  }
  if (raw instanceof Date) return raw.toISOString();
  return String(raw);
}

/** select/radio 컬럼은 옵션 라벨로 변환해 내보낸다 */
function displayExportValue<R extends Row>(leaf: LeafColumn<R>, row: R): CellValue {
  const v = exportCellValue(leaf, row);
  if (!leaf.exportValue && leaf.options && (leaf.type === 'select' || leaf.type === 'radio')) {
    const opt = leaf.options.find((o) => o.value === row[leaf.key]);
    if (opt) return opt.label;
  }
  return v;
}

export function buildXlsx<R extends Row>(input: XlsxExportInput<R>): Uint8Array {
  const { columns, rows } = input;
  const model = buildHeaderModel(columns);
  const { leaves, depth, cells } = model;
  const hasFooter = leaves.some((l) => l.footer);
  const includeFooter = input.includeFooter ?? hasFooter;

  const merges: string[] = [];
  const sheetRows: string[] = [];

  // 1) 병합 헤더 — depth x leaf 매트릭스를 모두 헤더 스타일로 채우고, 각 셀 좌상단에 제목 기록
  const headerMatrix: XlsxCell[][] = Array.from({ length: depth }, () =>
    Array.from({ length: leaves.length }, (_, c) => ({
      col: c + 1,
      value: null as CellValue,
      style: 1,
    })),
  );
  for (const c of cells) {
    headerMatrix[c.rowStart - 1][c.colStart - 1] = { col: c.colStart, value: c.title, style: 1 };
    if (c.colSpan > 1 || c.rowSpan > 1) {
      merges.push(
        `${cellRef(c.colStart, c.rowStart)}:${cellRef(c.colStart + c.colSpan - 1, c.rowStart + c.rowSpan - 1)}`,
      );
    }
  }
  for (let r = 1; r <= depth; r++) {
    sheetRows.push(
      `<row r="${r}">${headerMatrix[r - 1].map((cell) => cellXml(r, cell)).join('')}</row>`,
    );
  }

  // 2) 데이터 행
  rows.forEach((row, i) => {
    const r = depth + 1 + i;
    const cellsXml = leaves
      .map((leaf, ci) => cellXml(r, { col: ci + 1, value: displayExportValue(leaf, row) }))
      .join('');
    sheetRows.push(`<row r="${r}">${cellsXml}</row>`);
  });

  // 3) 푸터 (병합 포함)
  if (includeFooter && hasFooter) {
    const r = depth + rows.length + 1;
    const footerCells = buildFooterCells(leaves);
    const xmls: string[] = [];
    for (const fc of footerCells) {
      const def = fc.leaf.footer;
      let value: CellValue = null;
      if (def?.agg) value = aggregate(def.agg, rows, fc.leaf.key);
      else if (typeof def?.label === 'string' || typeof def?.label === 'number') {
        value = def.label;
      }
      xmls.push(cellXml(r, { col: fc.colStart, value, style: 2 }));
      if (fc.colSpan > 1) {
        merges.push(`${cellRef(fc.colStart, r)}:${cellRef(fc.colStart + fc.colSpan - 1, r)}`);
        for (let cc = fc.colStart + 1; cc < fc.colStart + fc.colSpan; cc++) {
          xmls.push(cellXml(r, { col: cc, value: null, style: 2 }));
        }
      }
    }
    sheetRows.push(`<row r="${r}">${xmls.join('')}</row>`);
  }

  const colsXml = leaves
    .map((l, i) => {
      const px = l.width ?? 120;
      const chars = Math.max(6, Math.round((px / 7) * 100) / 100); // px -> 대략적 문자 폭
      return `<col min="${i + 1}" max="${i + 1}" width="${chars}" customWidth="1"/>`;
    })
    .join('');

  const mergeXml = merges.length
    ? `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`
    : '';

  const sheetXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<cols>${colsXml}</cols>` +
    `<sheetData>${sheetRows.join('')}</sheetData>` +
    mergeXml +
    `</worksheet>`;

  const sheetName = esc(input.sheetName ?? 'Sheet1');
  const enc = new TextEncoder();
  const entries: ZipEntry[] = [
    {
      name: '[Content_Types].xml',
      data: enc.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
          `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
          `<Default Extension="xml" ContentType="application/xml"/>` +
          `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
          `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
          `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
          `</Types>`,
      ),
    },
    {
      name: '_rels/.rels',
      data: enc.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
          `</Relationships>`,
      ),
    },
    {
      name: 'xl/workbook.xml',
      data: enc.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
          `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
          `<sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets>` +
          `</workbook>`,
      ),
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: enc.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
          `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
          `</Relationships>`,
      ),
    },
    {
      name: 'xl/styles.xml',
      data: enc.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
          `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>` +
          `<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
          `<fills count="3"><fill><patternFill patternType="none"/></fill>` +
          `<fill><patternFill patternType="gray125"/></fill>` +
          `<fill><patternFill patternType="solid"><fgColor rgb="FFEFF2F7"/></patternFill></fill></fills>` +
          `<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>` +
          `<border><left style="thin"><color rgb="FFBFC7D4"/></left><right style="thin"><color rgb="FFBFC7D4"/></right>` +
          `<top style="thin"><color rgb="FFBFC7D4"/></top><bottom style="thin"><color rgb="FFBFC7D4"/></bottom><diagonal/></border></borders>` +
          `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
          `<cellXfs count="3">` +
          `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
          `<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">` +
          `<alignment horizontal="center" vertical="center" wrapText="1"/></xf>` +
          `<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>` +
          `</cellXfs>` +
          `</styleSheet>`,
      ),
    },
    { name: 'xl/worksheets/sheet1.xml', data: enc.encode(sheetXml) },
  ];

  return createZip(entries);
}

/** 브라우저에서 파일 다운로드 트리거 */
export function downloadFile(data: Uint8Array | string, fileName: string, mime: string): void {
  const buf: BlobPart =
    typeof data === 'string'
      ? data
      : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  const blob = new Blob([buf], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function exportXlsx<R extends Row>(
  input: XlsxExportInput<R>,
  fileName = 'grid.xlsx',
): void {
  downloadFile(
    buildXlsx(input),
    fileName,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
}
