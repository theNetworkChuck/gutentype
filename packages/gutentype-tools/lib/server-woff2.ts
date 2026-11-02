import { brotliDecompressSync } from "node:zlib";

/*
 * A WOFF2 to TrueType decoder (W3C WOFF2, section 5), so the server's share card can draw text with a font Keybr
 * already ships (resvg reads TrueType and OpenType, not WOFF2). Handles the transformed glyf, loca and hmtx tables
 * and single fonts, not collections. Used once by `server-font-build.ts`; the server loads the TrueType it wrote.
 */

// The 63 known table tags, by their index in a table directory entry's flags (WOFF2 table 4.2).
const knownTags = [
  ..."cmap head hhea hmtx maxp name OS/2 post".split(" "),
  "cvt ",
  ..."fpgm glyf loca prep".split(" "),
  "CFF ",
  ..."VORG EBDT EBLC gasp hdmx kern LTSH PCLT VDMX vhea vmtx BASE GDEF GPOS GSUB EBSC JSTF MATH CBDT CBLC COLR CPAL".split(
    " ",
  ),
  "SVG ",
  ..."sbix acnt avar bdat bloc bsln cvar fdsc feat fmtx fvar gvar hsty just lcar mort morx opbd prop trak Zapf Silf Glat Gloc Feat Sill".split(
    " ",
  ),
];

class Reader {
  pos = 0;
  constructor(readonly buf: Buffer) {}
  u8() {
    return this.buf.readUInt8(this.pos++);
  }
  u16() {
    const v = this.buf.readUInt16BE(this.pos);
    this.pos += 2;
    return v;
  }
  i16() {
    const v = this.buf.readInt16BE(this.pos);
    this.pos += 2;
    return v;
  }
  u32() {
    const v = this.buf.readUInt32BE(this.pos);
    this.pos += 4;
    return v;
  }
  bytes(n: number) {
    const v = this.buf.subarray(this.pos, this.pos + n);
    if (v.length !== n) throw new Error("WOFF2: truncated data");
    this.pos += n;
    return v;
  }
  base128() {
    let value = 0;
    for (let i = 0; i < 5; i++) {
      const b = this.u8();
      if (i === 0 && b === 0x80) throw new Error("WOFF2: bad UIntBase128");
      value = value * 128 + (b & 0x7f);
      if ((b & 0x80) === 0) return value;
    }
    throw new Error("WOFF2: UIntBase128 too long");
  }
  u255() {
    const code = this.u8();
    if (code === 253) return this.u16();
    if (code === 255) return this.u8() + 253;
    if (code === 254) return this.u8() + 253 * 2;
    return code;
  }
}

type Entry = {
  tag: string;
  origLength: number;
  transformed: boolean;
  data: Buffer;
};

export function woff2ToTtf(woff2: Buffer): Buffer {
  const r = new Reader(woff2);
  if (r.u32() !== 0x774f4632) throw new Error("WOFF2: bad signature");
  const flavor = r.u32();
  if (flavor === 0x74746366)
    throw new Error("WOFF2: font collections are not supported");
  r.u32(); // length
  const numTables = r.u16();
  r.u16(); // reserved
  r.u32(); // totalSfntSize
  const totalCompressedSize = r.u32();
  r.pos += 4 + 12 + 8; // version, metadata, private data

  const dir: {
    tag: string;
    origLength: number;
    length: number;
    transformed: boolean;
  }[] = [];
  for (let i = 0; i < numTables; i++) {
    const flags = r.u8();
    const tagIndex = flags & 0x3f;
    const version = flags >> 6;
    const tag =
      tagIndex === 63 ? r.bytes(4).toString("latin1") : knownTags[tagIndex];
    const origLength = r.base128();
    const glyfOrLoca = tag === "glyf" || tag === "loca";
    const transformed = glyfOrLoca ? version === 0 : version !== 0;
    const length = transformed ? r.base128() : origLength;
    dir.push({ tag, origLength, length, transformed });
  }
  const data = brotliDecompressSync(r.bytes(totalCompressedSize));
  let offset = 0;
  const entries: Entry[] = dir.map((d) => {
    const slice = data.subarray(offset, offset + d.length);
    offset += d.length;
    return {
      tag: d.tag,
      origLength: d.origLength,
      transformed: d.transformed,
      data: slice,
    };
  });
  const byTag = new Map(entries.map((e) => [e.tag, e]));

  const tables = new Map<string, Buffer>();
  for (const e of entries) {
    if (!e.transformed) tables.set(e.tag, Buffer.from(e.data));
  }
  let xMins: number[] = [];
  const glyf = byTag.get("glyf");
  if (glyf?.transformed) {
    const out = decodeGlyf(glyf.data);
    tables.set("glyf", out.glyf);
    tables.set("loca", out.loca);
    xMins = out.xMins;
    const head = tables.get("head")!;
    head.writeInt16BE(out.indexFormat, 50);
  }
  const hmtx = byTag.get("hmtx");
  if (hmtx?.transformed) {
    const hhea = tables.get("hhea")!;
    const maxp = tables.get("maxp")!;
    tables.set(
      "hmtx",
      decodeHmtx(hmtx.data, hhea.readUInt16BE(34), maxp.readUInt16BE(4), xMins),
    );
  }
  const head = tables.get("head");
  if (head != null) head.writeUInt32BE(0, 8); // checkSumAdjustment
  return assemble(flavor, tables);
}

function decodeGlyf(buf: Buffer) {
  const r = new Reader(buf);
  r.u16(); // reserved
  const optionFlags = r.u16();
  const numGlyphs = r.u16();
  const indexFormat = r.u16();
  const sizes = Array.from({ length: 7 }, () => r.u32());
  const streams = sizes.map((n) => new Reader(Buffer.from(r.bytes(n))));
  const [nContourS, nPointsS, flagS, glyphS, compositeS, bboxS, instructionS] =
    streams;
  const overlap = optionFlags & 1 ? r.bytes((numGlyphs + 7) >> 3) : null;
  const bboxBitmap = bboxS.bytes(((numGlyphs + 31) >> 5) << 2);
  const hasBbox = (i: number) => (bboxBitmap[i >> 3] & (0x80 >> (i & 7))) !== 0;

  const glyphs: Buffer[] = [];
  const xMins: number[] = [];
  for (let i = 0; i < numGlyphs; i++) {
    const nContours = nContourS.i16();
    if (nContours === 0) {
      glyphs.push(Buffer.alloc(0));
      xMins.push(0);
      continue;
    }
    if (nContours > 0) {
      const endPts: number[] = [];
      let total = 0;
      for (let c = 0; c < nContours; c++) {
        total += nPointsS.u255();
        endPts.push(total - 1);
      }
      const xs: number[] = [];
      const ys: number[] = [];
      const on: boolean[] = [];
      let x = 0;
      let y = 0;
      for (let p = 0; p < total; p++) {
        let flag = flagS.u8();
        on.push(flag >> 7 === 0);
        flag &= 0x7f;
        const [dx, dy] = triplet(flag, glyphS);
        x += dx;
        y += dy;
        xs.push(x);
        ys.push(y);
      }
      const instructionLength = glyphS.u255();
      const instructions = instructionS.bytes(instructionLength);
      let bbox: number[];
      if (hasBbox(i)) {
        bbox = [bboxS.i16(), bboxS.i16(), bboxS.i16(), bboxS.i16()];
      } else {
        bbox = [
          Math.min(...xs),
          Math.min(...ys),
          Math.max(...xs),
          Math.max(...ys),
        ];
      }
      xMins.push(bbox[0]);
      const out = Buffer.alloc(
        10 + 2 * nContours + 2 + instructionLength + total * 5,
      );
      let o = 0;
      o = out.writeInt16BE(nContours, o);
      for (const v of bbox) o = out.writeInt16BE(v, o);
      for (const e of endPts) o = out.writeUInt16BE(e, o);
      o = out.writeUInt16BE(instructionLength, o);
      o += instructions.copy(out, o);
      const overlapFirst =
        overlap != null && (overlap[i >> 3] & (0x80 >> (i & 7))) !== 0;
      for (let p = 0; p < total; p++) {
        out[o++] = (on[p] ? 0x01 : 0) | (p === 0 && overlapFirst ? 0x40 : 0);
      }
      let prev = 0;
      for (const v of xs) {
        o = out.writeInt16BE(v - prev, o);
        prev = v;
      }
      prev = 0;
      for (const v of ys) {
        o = out.writeInt16BE(v - prev, o);
        prev = v;
      }
      glyphs.push(out.subarray(0, o));
      continue;
    }
    // Composite glyph.
    const start = compositeS.pos;
    let haveInstructions = false;
    for (;;) {
      const flags = compositeS.u16();
      compositeS.u16(); // glyph index
      compositeS.pos += flags & 0x0001 ? 4 : 2;
      if (flags & 0x0008) compositeS.pos += 2;
      else if (flags & 0x0040) compositeS.pos += 4;
      else if (flags & 0x0080) compositeS.pos += 8;
      if (flags & 0x0100) haveInstructions = true;
      if (!(flags & 0x0020)) break;
    }
    const components = compositeS.buf.subarray(start, compositeS.pos);
    const bbox = [bboxS.i16(), bboxS.i16(), bboxS.i16(), bboxS.i16()];
    xMins.push(bbox[0]);
    const parts = [Buffer.alloc(10), components];
    parts[0].writeInt16BE(-1, 0);
    bbox.forEach((v, k) => parts[0].writeInt16BE(v, 2 + 2 * k));
    if (haveInstructions) {
      const n = glyphS.u255();
      const len = Buffer.alloc(2);
      len.writeUInt16BE(n, 0);
      parts.push(len, instructionS.bytes(n));
    }
    glyphs.push(Buffer.concat(parts));
  }

  const offsets: number[] = [];
  const padded: Buffer[] = [];
  let at = 0;
  for (const g of glyphs) {
    offsets.push(at);
    const pad = (4 - (g.length % 4)) % 4;
    padded.push(g, Buffer.alloc(pad));
    at += g.length + pad;
  }
  offsets.push(at);
  const loca = Buffer.alloc(offsets.length * (indexFormat ? 4 : 2));
  offsets.forEach((v, k) => {
    if (indexFormat) loca.writeUInt32BE(v, k * 4);
    else loca.writeUInt16BE(v / 2, k * 2);
  });
  return { glyf: Buffer.concat(padded), loca, xMins, indexFormat };
}

function withSign(flag: number, value: number) {
  return flag & 1 ? value : -value;
}

function triplet(flag: number, s: Reader): [number, number] {
  if (flag < 10) {
    return [0, withSign(flag, ((flag & 14) << 7) + s.u8())];
  }
  if (flag < 20) {
    return [withSign(flag, (((flag - 10) & 14) << 7) + s.u8()), 0];
  }
  if (flag < 84) {
    const b0 = flag - 20;
    const b1 = s.u8();
    return [
      withSign(flag, 1 + (b0 & 0x30) + (b1 >> 4)),
      withSign(flag >> 1, 1 + ((b0 & 0x0c) << 2) + (b1 & 0x0f)),
    ];
  }
  if (flag < 120) {
    const b0 = flag - 84;
    const a = s.u8();
    const b = s.u8();
    return [
      withSign(flag, 1 + (Math.floor(b0 / 12) << 8) + a),
      withSign(flag >> 1, 1 + (((b0 % 12) >> 2) << 8) + b),
    ];
  }
  if (flag < 124) {
    const a = s.u8();
    const b = s.u8();
    const c = s.u8();
    return [
      withSign(flag, (a << 4) + (b >> 4)),
      withSign(flag >> 1, ((b & 0x0f) << 8) + c),
    ];
  }
  const a = s.u8();
  const b = s.u8();
  const c = s.u8();
  const d = s.u8();
  return [withSign(flag, (a << 8) + b), withSign(flag >> 1, (c << 8) + d)];
}

function decodeHmtx(
  buf: Buffer,
  numHMetrics: number,
  numGlyphs: number,
  xMins: number[],
) {
  const r = new Reader(buf);
  const flags = r.u8();
  const advances = Array.from({ length: numHMetrics }, () => r.u16());
  const lsbs =
    flags & 1
      ? advances.map((_, i) => xMins[i] ?? 0)
      : Array.from({ length: numHMetrics }, () => r.i16());
  const rest =
    flags & 2
      ? Array.from(
          { length: numGlyphs - numHMetrics },
          (_, k) => xMins[numHMetrics + k] ?? 0,
        )
      : Array.from({ length: numGlyphs - numHMetrics }, () => r.i16());
  const out = Buffer.alloc(numHMetrics * 4 + rest.length * 2);
  let o = 0;
  for (let i = 0; i < numHMetrics; i++) {
    o = out.writeUInt16BE(advances[i], o);
    o = out.writeInt16BE(lsbs[i], o);
  }
  for (const v of rest) o = out.writeInt16BE(v, o);
  return out;
}

function checksum(buf: Buffer) {
  let sum = 0;
  const padded = Buffer.concat([buf, Buffer.alloc((4 - (buf.length % 4)) % 4)]);
  for (let i = 0; i < padded.length; i += 4)
    sum = (sum + padded.readUInt32BE(i)) >>> 0;
  return sum;
}

function assemble(flavor: number, tables: Map<string, Buffer>): Buffer {
  const tags = [...tables.keys()].sort();
  const n = tags.length;
  const entrySelector = Math.floor(Math.log2(n));
  const searchRange = 2 ** entrySelector * 16;
  const header = Buffer.alloc(12 + 16 * n);
  header.writeUInt32BE(flavor, 0);
  header.writeUInt16BE(n, 4);
  header.writeUInt16BE(searchRange, 6);
  header.writeUInt16BE(entrySelector, 8);
  header.writeUInt16BE(n * 16 - searchRange, 10);
  const bodies: Buffer[] = [];
  let offset = header.length;
  tags.forEach((tag, i) => {
    const data = tables.get(tag)!;
    const at = 12 + 16 * i;
    header.write(tag.padEnd(4, " "), at, "latin1");
    header.writeUInt32BE(checksum(data), at + 4);
    header.writeUInt32BE(offset, at + 8);
    header.writeUInt32BE(data.length, at + 12);
    const pad = (4 - (data.length % 4)) % 4;
    bodies.push(data, Buffer.alloc(pad));
    offset += data.length + pad;
  });
  return Buffer.concat([header, ...bodies]);
}
