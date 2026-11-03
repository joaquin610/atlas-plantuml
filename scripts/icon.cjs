// Usage: node icon.js out.png
// Software-rasterizes a 256x256 icon (class diagram on a gradient tile) with 4x4 supersampling.
const fs = require('node:fs');
const zlib = require('node:zlib');

const S = 256;
const SS = 4;

function inRoundRect(x, y, rx, ry, w, h, r) {
  if (x < rx || y < ry || x > rx + w || y > ry + h) return false;
  const cx = Math.min(Math.max(x, rx + r), rx + w - r);
  const cy = Math.min(Math.max(y, ry + r), ry + h - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function inCapsule(x, y, x1, y1, x2, y2, hw) {
  const dx = x2 - x1,
    dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
  return (x - x1 - t * dx) ** 2 + (y - y1 - t * dy) ** 2 <= hw * hw;
}

function inTriangle(x, y, [ax, ay], [bx, by], [cx, cy]) {
  const s1 = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
  const s2 = (cx - bx) * (y - by) - (cy - by) * (x - bx);
  const s3 = (ax - cx) * (y - cy) - (ay - cy) * (x - cx);
  return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0);
}

const shapes = [];
const add = (test, color) => shapes.push({ test, color });

// Background tile with diagonal blue -> violet gradient
add(
  (x, y) => inRoundRect(x, y, 8, 8, 240, 240, 28),
  (x, y) => {
    const t = (x + y) / (2 * S);
    return [37 + (124 - 37) * t, 99 + (58 - 99) * t, 235 + (237 - 235) * t, 1];
  },
);

// Inheritance connectors
const line = [255, 255, 255, 0.92];
for (const [a, b, c, d] of [
  [128, 96, 128, 120],
  [74, 120, 182, 120],
  [74, 120, 74, 146],
  [182, 120, 182, 146],
]) {
  add(
    (x, y) => inCapsule(x, y, a, b, c, d, 2.6),
    () => line,
  );
}
add(
  (x, y) => inTriangle(x, y, [128, 86], [116, 104], [140, 104]),
  () => line,
);

function box(bx, by, w, h, header) {
  add(
    (x, y) => inRoundRect(x, y, bx + 3, by + 5, w, h, 7),
    () => [0, 0, 0, 0.22],
  );
  add(
    (x, y) => inRoundRect(x, y, bx, by, w, h, 7),
    () => [255, 255, 255, 1],
  );
  add(
    (x, y) => inRoundRect(x, y, bx, by, w, h, 7) && y <= by + 17,
    () => header,
  );
  for (let i = 0; i < 2; i++) {
    add(
      (x, y) => inRoundRect(x, y, bx + 10, by + 26 + i * 12, w - 20 - i * 16, 5, 2.5),
      () => [196, 205, 219, 1],
    );
  }
}
box(82, 34, 92, 58, [245, 158, 11, 1]);
box(30, 146, 88, 58, [20, 184, 166, 1]);
box(138, 146, 88, 58, [236, 72, 153, 1]);

// Rasterize (premultiplied accumulation)
const rows = [];
for (let py = 0; py < S; py++) {
  const row = Buffer.alloc(1 + S * 4);
  for (let px = 0; px < S; px++) {
    let r = 0,
      g = 0,
      b = 0,
      a = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const x = px + (sx + 0.5) / SS,
          y = py + (sy + 0.5) / SS;
        let cr = 0,
          cg = 0,
          cb = 0,
          ca = 0;
        for (const s of shapes) {
          if (!s.test(x, y)) continue;
          const [sr, sg, sb, sa] = s.color(x, y);
          cr = sr * sa + cr * (1 - sa);
          cg = sg * sa + cg * (1 - sa);
          cb = sb * sa + cb * (1 - sa);
          ca = sa + ca * (1 - sa);
        }
        r += cr;
        g += cg;
        b += cb;
        a += ca;
      }
    }
    const n = SS * SS,
      A = a / n;
    const o = 1 + px * 4;
    row[o] = A ? Math.round(r / n / A) : 0;
    row[o + 1] = A ? Math.round(g / n / A) : 0;
    row[o + 2] = A ? Math.round(b / n / A) : 0;
    row[o + 3] = Math.round(A * 255);
  }
  rows.push(row);
}

// PNG encoding
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8;
ihdr[9] = 6;
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(Buffer.concat(rows), { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
fs.writeFileSync(process.argv[2], png);
