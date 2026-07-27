import { Column, Row } from '../types';
import { buildHeaderModel } from '../utils/headers';
import { downloadFile } from './xlsx';

function csvField(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = v instanceof Date ? v.toISOString() : String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildCsv<R extends Row>(columns: Column<R>[], rows: R[]): string {
  const { leaves } = buildHeaderModel(columns);
  const lines: string[] = [];
  lines.push(leaves.map((l) => csvField(l.title)).join(','));
  for (const row of rows) {
    lines.push(
      leaves
        .map((l) => {
          const raw = row[l.key];
          if (l.exportValue) return csvField(l.exportValue(raw, row));
          if (l.options && (l.type === 'select' || l.type === 'radio')) {
            const opt = l.options.find((o) => o.value === raw);
            if (opt) return csvField(opt.label);
          }
          return csvField(raw);
        })
        .join(','),
    );
  }
  return lines.join('\r\n');
}

export function exportCsv<R extends Row>(
  columns: Column<R>[],
  rows: R[],
  fileName = 'grid.csv',
): void {
  // 엑셀에서 한글 인코딩 보존을 위한 UTF-8 BOM
  downloadFile('﻿' + buildCsv(columns, rows), fileName, 'text/csv;charset=utf-8');
}
