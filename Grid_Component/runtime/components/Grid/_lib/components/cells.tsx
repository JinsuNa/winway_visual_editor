import { ReactNode } from 'react';
import { LeafColumn, Row } from '../types';

export interface CellContentProps<R extends Row> {
  column: LeafColumn<R>;
  row: R;
  rowIndex: number;
  gridId: string;
  onCellChange?: (rowIndex: number, key: string, value: unknown, row: R) => void;
}

/** 셀 타입(text/number/checkbox/radio/select)에 따른 내용 렌더링 */
export function CellContent<R extends Row>({
  column,
  row,
  rowIndex,
  gridId,
  onCellChange,
}: CellContentProps<R>): ReactNode {
  const value = row[column.key];
  const editable = column.editable !== false;
  const change = (v: unknown) => onCellChange?.(rowIndex, column.key, v, row);

  switch (column.type) {
    case 'checkbox':
      return (
        <input
          type="checkbox"
          className="wg-checkbox"
          checked={Boolean(value)}
          disabled={!editable}
          onChange={(e) => change(e.target.checked)}
        />
      );
    case 'radio': {
      const name = `${gridId}-${column.key}-${rowIndex}`;
      return (
        <span className="wg-radio-group">
          {(column.options ?? []).map((opt) => (
            <label key={String(opt.value)} className="wg-radio-item">
              <input
                type="radio"
                name={name}
                checked={value === opt.value}
                disabled={!editable}
                onChange={() => change(opt.value)}
              />
              {opt.label}
            </label>
          ))}
        </span>
      );
    }
    case 'select':
      return (
        <select
          className="wg-select"
          value={value === null || value === undefined ? '' : String(value)}
          disabled={!editable}
          onChange={(e) => {
            const opt = (column.options ?? []).find((o) => String(o.value) === e.target.value);
            change(opt ? opt.value : e.target.value);
          }}
        >
          {(column.options ?? []).map((opt) => (
            <option key={String(opt.value)} value={String(opt.value)}>
              {opt.label}
            </option>
          ))}
        </select>
      );
    case 'button':
      return (
        <button
          type="button"
          className="wg-cell-button"
          disabled={!editable}
          onClick={() => change(value)}
        >
          {value === null || value === undefined ? column.title || '버튼' : String(value)}
        </button>
      );
    default: {
      if (column.formatter) return column.formatter(value, row);
      if (value === null || value === undefined) return '';
      if (typeof value === 'number') return value.toLocaleString();
      return String(value);
    }
  }
}
