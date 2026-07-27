/** 가변 행높이 가상 스크롤용 누적 오프셋 계산 */

/**
 * offsets[i] = i번째 행의 시작 y좌표. 길이는 count+1 (마지막 = 전체 높이).
 */
export function buildOffsets(count: number, heightOf: (index: number) => number): Float64Array {
  const offsets = new Float64Array(count + 1);
  for (let i = 0; i < count; i++) {
    offsets[i + 1] = offsets[i] + Math.max(1, heightOf(i));
  }
  return offsets;
}

/**
 * y좌표가 속한 행 인덱스를 이진 탐색으로 찾는다.
 * (offsets[i] <= y < offsets[i+1]인 i, 범위 밖은 클램프)
 */
export function findRowAtOffset(offsets: Float64Array, y: number): number {
  const count = offsets.length - 1;
  if (count <= 0 || y <= 0) return 0;
  if (y >= offsets[count]) return count - 1;
  let lo = 0;
  let hi = count - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (offsets[mid] <= y) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
