import { AggregateName, Row } from '../types';

function numbersOf<R extends Row>(rows: R[], key: string): number[] {
  const out: number[] = [];
  for (const r of rows) {
    const v = r[key];
    if (typeof v === 'number' && Number.isFinite(v)) out.push(v);
    else if (typeof v === 'string' && v !== '' && Number.isFinite(Number(v))) out.push(Number(v));
  }
  return out;
}

export function aggregate<R extends Row>(
  name: AggregateName,
  rows: R[],
  key: string,
): number {
  if (name === 'count') return rows.length;
  const nums = numbersOf(rows, key);
  if (nums.length === 0) return 0;
  switch (name) {
    case 'sum':
      return nums.reduce((a, b) => a + b, 0);
    case 'avg':
      return nums.reduce((a, b) => a + b, 0) / nums.length;
    case 'min':
      return Math.min(...nums);
    case 'max':
      return Math.max(...nums);
  }
}

/** 기본 표시 포맷: 정수는 천단위 구분, 소수는 2자리 */
export function formatAggregate(value: number): string {
  const isInt = Number.isInteger(value);
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: isInt ? 0 : 2,
  });
}
