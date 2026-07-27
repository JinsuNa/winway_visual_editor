import { LeafColumn, Row, SortState } from '../types';

/**
 * null/undefined는 방향과 무관하게 항상 뒤로 보낸다.
 * 숫자·불리언·날짜는 값 비교, 그 외는 localeCompare(숫자 인식) 문자열 비교.
 */
export function compareValues(a: unknown, b: unknown): number {
  const aNil = a === null || a === undefined || a === '';
  const bNil = b === null || b === undefined || b === '';
  if (aNil && bNil) return 0;
  if (aNil) return 1;
  if (bNil) return -1;

  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();

  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

/** 다중 정렬 지원: sorts 배열 순서대로 우선순위 비교. 안정 정렬(Array.sort는 ES2019+ 안정). */
export function sortRows<R extends Row>(
  rows: R[],
  sorts: SortState[],
  leaves: LeafColumn<R>[],
): R[] {
  if (sorts.length === 0) return rows;
  const colByKey = new Map(leaves.map((l) => [l.key, l]));
  const sorted = [...rows];
  sorted.sort((ra, rb) => {
    for (const s of sorts) {
      const col = colByKey.get(s.key);
      const base = col?.comparator
        ? col.comparator(ra, rb)
        : compareValues(ra[s.key], rb[s.key]);
      if (base !== 0) return s.direction === 'asc' ? base : -base;
    }
    return 0;
  });
  return sorted;
}

/** 헤더 클릭 시 상태 순환: none -> asc -> desc -> none */
export function cycleSort(
  sorts: SortState[],
  key: string,
  multi: boolean,
): SortState[] {
  const existing = sorts.find((s) => s.key === key);
  const rest = multi ? sorts.filter((s) => s.key !== key) : [];
  if (!existing) return [...rest, { key, direction: 'asc' }];
  if (existing.direction === 'asc') return [...rest, { key, direction: 'desc' }];
  return rest; // desc -> 해제
}
