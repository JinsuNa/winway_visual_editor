/**
 * 최소 ZIP 아카이브 생성기 (압축 없이 STORED 방식).
 * XLSX는 ZIP 컨테이너이므로 이것만으로 유효한 .xlsx를 만들 수 있다.
 * ZIP 포맷은 PKWARE APPNOTE(공개 표준) 기반으로 독자 구현.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  /** 아카이브 내 경로 (예: 'xl/workbook.xml') */
  name: string;
  data: Uint8Array;
}

function dosDateTime(d: Date): { date: number; time: number } {
  const date =
    (((d.getFullYear() - 1980) & 0x7f) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  return { date, time };
}

class ByteWriter {
  private chunks: Uint8Array[] = [];
  length = 0;

  u16(v: number) {
    this.chunks.push(new Uint8Array([v & 0xff, (v >>> 8) & 0xff]));
    this.length += 2;
  }
  u32(v: number) {
    this.chunks.push(
      new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]),
    );
    this.length += 4;
  }
  bytes(b: Uint8Array) {
    this.chunks.push(b);
    this.length += b.length;
  }
  concat(): Uint8Array {
    const out = new Uint8Array(this.length);
    let off = 0;
    for (const c of this.chunks) {
      out.set(c, off);
      off += c.length;
    }
    return out;
  }
}

/** 엔트리 목록으로 ZIP 바이너리를 만든다. */
export function createZip(entries: ZipEntry[], now: Date = new Date()): Uint8Array {
  const encoder = new TextEncoder();
  const { date, time } = dosDateTime(now);
  const w = new ByteWriter();
  const central: { nameBytes: Uint8Array; crc: number; size: number; offset: number }[] = [];

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const offset = w.length;

    // Local file header
    w.u32(0x04034b50);
    w.u16(20); // version needed
    w.u16(0x0800); // UTF-8 filename flag
    w.u16(0); // method: stored
    w.u16(time);
    w.u16(date);
    w.u32(crc);
    w.u32(entry.data.length); // compressed (= raw, stored)
    w.u32(entry.data.length); // uncompressed
    w.u16(nameBytes.length);
    w.u16(0); // extra length
    w.bytes(nameBytes);
    w.bytes(entry.data);

    central.push({ nameBytes, crc, size: entry.data.length, offset });
  }

  const centralStart = w.length;
  for (const c of central) {
    // Central directory header
    w.u32(0x02014b50);
    w.u16(20); // version made by
    w.u16(20); // version needed
    w.u16(0x0800);
    w.u16(0); // stored
    w.u16(time);
    w.u16(date);
    w.u32(c.crc);
    w.u32(c.size);
    w.u32(c.size);
    w.u16(c.nameBytes.length);
    w.u16(0); // extra
    w.u16(0); // comment
    w.u16(0); // disk number
    w.u16(0); // internal attrs
    w.u32(0); // external attrs
    w.u32(c.offset);
    w.bytes(c.nameBytes);
  }
  const centralSize = w.length - centralStart;

  // End of central directory
  w.u32(0x06054b50);
  w.u16(0);
  w.u16(0);
  w.u16(central.length);
  w.u16(central.length);
  w.u32(centralSize);
  w.u32(centralStart);
  w.u16(0); // comment length

  return w.concat();
}
