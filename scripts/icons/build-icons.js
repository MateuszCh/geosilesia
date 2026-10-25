// Builds the site icons from two SVG sources:
// - front/public/favicon.svg (the tile): favicon.ico (16, 32, 48) and the app icons of
//   manifest.json;
// - scripts/icons/icon-full.svg (full bleed): apple-touch-icon.png and the maskable app icon.
//
//   node scripts/icons/build-icons.js
//
// The sources are drawn only with <rect> elements (x, y, width, height, rx, hex fill), so the
// script rasterises them itself, with no image library: every pixel averages 8×8 samples.
// Edges on the 16 px grid therefore come out sharp at 16, 32 and 48 px, where a scaled-down
// rendering would blur them. The ICO holds PNG images, which every current browser reads.

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.resolve(__dirname, "../..");
const PUBLIC = path.join(ROOT, "front/public");
const SAMPLES = 8;

const TILE = path.join(PUBLIC, "favicon.svg");
const FULL = path.join(__dirname, "icon-full.svg");

/** [source, size, output path relative to front/public] */
const OUTPUTS = [
    ...[48, 96, 144, 192, 256, 384, 512].map(size => [TILE, size, `images/icons/app-icon-${size}x${size}.png`]),
    [FULL, 512, "images/icons/app-icon-maskable-512x512.png"],
    [FULL, 180, "apple-touch-icon.png"]
];
const ICO_SIZES = [16, 32, 48];
const ICO_FILES = ["favicon.ico", "images/favicon.ico"];

/** The viewBox size and the rects of an SVG, in drawing order. */
function readSvg(file) {
    const svg = fs.readFileSync(file, "utf8").replace(/<!--[\s\S]*?-->/g, "");
    const viewBox = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
    if (!viewBox || viewBox[1] !== viewBox[2]) throw new Error(`${file}: needs a square viewBox "0 0 n n"`);
    const shapes = [...svg.matchAll(/<(\w+)\s([^>]*?)\/?>/g)]
        .filter(([, tag]) => tag !== "svg")
        .map(([, tag, attrs]) => {
            if (tag !== "rect") throw new Error(`${file}: only <rect> is supported, found <${tag}>`);
            const attr = (name, fallback) => {
                const match = new RegExp(`\\b${name}="([^"]*)"`).exec(attrs);
                return match ? match[1] : fallback;
            };
            let fill = attr("fill", "#000000");
            if (/^#[0-9a-f]{3}$/i.test(fill)) fill = `#${[...fill.slice(1)].map(c => c + c).join("")}`;
            if (!/^#[0-9a-f]{6}$/i.test(fill)) throw new Error(`${file}: fill must be #rgb or #rrggbb, got "${fill}"`);
            return {
                x: Number(attr("x", 0)),
                y: Number(attr("y", 0)),
                w: Number(attr("width")),
                h: Number(attr("height")),
                r: Number(attr("rx", 0)),
                rgb: [1, 3, 5].map(i => parseInt(fill.slice(i, i + 2), 16))
            };
        });
    return { size: Number(viewBox[1]), shapes };
}

function inside({ x, y, w, h, r }, px, py) {
    if (px < x || py < y || px > x + w || py > y + h) return false;
    const cx = Math.min(Math.max(px, x + r), x + w - r);
    const cy = Math.min(Math.max(py, y + r), y + h - r);
    return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
}

/** RGBA pixels of the drawing at `size` px. */
function rasterise({ size: units, shapes }, size) {
    const pixels = Buffer.alloc(size * size * 4);
    const scale = units / size;
    for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
            const sum = [0, 0, 0, 0];
            for (let sy = 0; sy < SAMPLES; sy++) {
                for (let sx = 0; sx < SAMPLES; sx++) {
                    const px = (col + (sx + 0.5) / SAMPLES) * scale;
                    const py = (row + (sy + 0.5) / SAMPLES) * scale;
                    let top;
                    for (const shape of shapes) if (inside(shape, px, py)) top = shape;
                    if (!top) continue;
                    sum[0] += top.rgb[0];
                    sum[1] += top.rgb[1];
                    sum[2] += top.rgb[2];
                    sum[3] += 1;
                }
            }
            const at = (row * size + col) * 4;
            if (sum[3]) {
                pixels[at] = Math.round(sum[0] / sum[3]);
                pixels[at + 1] = Math.round(sum[1] / sum[3]);
                pixels[at + 2] = Math.round(sum[2] / sum[3]);
            }
            pixels[at + 3] = Math.round((sum[3] / (SAMPLES * SAMPLES)) * 255);
        }
    }
    return pixels;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});

function crc32(buffer) {
    let c = 0xffffffff;
    for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
}

/** An 8-bit RGBA PNG; every row uses filter 0. */
function png(pixels, size) {
    const header = Buffer.alloc(13);
    header.writeUInt32BE(size, 0);
    header.writeUInt32BE(size, 4);
    header.set([8, 6, 0, 0, 0], 8); // bit depth, colour type RGBA, compression, filter, interlace
    const rows = Buffer.alloc(size * (size * 4 + 1));
    for (let row = 0; row < size; row++) pixels.copy(rows, row * (size * 4 + 1) + 1, row * size * 4, (row + 1) * size * 4);
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk("IHDR", header),
        chunk("IDAT", zlib.deflateSync(rows, { level: 9 })),
        chunk("IEND", Buffer.alloc(0))
    ]);
}

/** An ICO file that stores each size as PNG. */
function ico(images) {
    const header = Buffer.alloc(6 + 16 * images.length);
    header.writeUInt16LE(1, 2); // type: icon
    header.writeUInt16LE(images.length, 4);
    let offset = header.length;
    images.forEach(({ size, data }, i) => {
        const entry = 6 + 16 * i;
        header.writeUInt8(size >= 256 ? 0 : size, entry);
        header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
        header.writeUInt16LE(1, entry + 4); // colour planes
        header.writeUInt16LE(32, entry + 6); // bits per pixel
        header.writeUInt32LE(data.length, entry + 8);
        header.writeUInt32LE(offset, entry + 12);
        offset += data.length;
    });
    return Buffer.concat([header, ...images.map(image => image.data)]);
}

const drawings = { [TILE]: readSvg(TILE), [FULL]: readSvg(FULL) };
const render = (source, size) => png(rasterise(drawings[source], size), size);

OUTPUTS.forEach(([source, size, out]) => {
    fs.mkdirSync(path.dirname(path.join(PUBLIC, out)), { recursive: true });
    fs.writeFileSync(path.join(PUBLIC, out), render(source, size));
    console.log(`${out}  ${size}×${size}`);
});
const icon = ico(ICO_SIZES.map(size => ({ size, data: render(TILE, size) })));
ICO_FILES.forEach(out => {
    fs.writeFileSync(path.join(PUBLIC, out), icon);
    console.log(`${out}  ${ICO_SIZES.join(", ")} px`);
});
