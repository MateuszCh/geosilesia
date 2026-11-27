// Resized WebP copies of CMS photos: GET /img/<width>/<path under uploads/>.
//
// The CMS keeps the photos as uploaded (often 1400–2000 px, 250 kB–1 MB, sometimes PNG),
// while a card on a phone is ~300 px wide. The front lists these copies in srcset
// (front/src/app/shared/srcset.ts), the browser picks the width it needs.
//
// wasm-vips (libvips compiled to WebAssembly) instead of sharp: the hosting runs FreeBSD,
// for which sharp ships no binaries. Each copy is computed once and kept on disk in
// tmp/img-cache; it is made again when the original is newer (a photo replaced in the CMS
// under the same name). Any failure falls back to the original file, so a broken copy
// never leaves a hole in the page.

const path = require("path");
const fs = require("fs");

/** The only widths served – keep in sync with WIDTHS in front/src/app/shared/srcset.ts. */
const WIDTHS = [400, 800, 1200, 1600];
const SOURCE_TYPES = /\.(jpe?g|png)$/i;
const QUALITY = 75;

/**
 * Frames: the part of a photo a fixed box with `object-fit: cover` can show, cut out on the
 * server, so a phone does not download the sides of a landscape photo it never displays.
 * GET /img/<frame>/<x>-<y>/<width>/<path> – x and y are the box's object-position in per
 * cent (the editor's framing from the CMS). The cut keeps the aspect ratio below and is
 * placed the way object-position places the box, so the same object-position on the cut
 * shows exactly the same pixels as on the whole photo, in any box no wider than the frame.
 * Keep in sync with FRAMES in front/src/app/shared/srcset.ts.
 */
const FRAMES = {
    // The home page hero on phones up to 430 px wide: 430 × 520 px (styles/szlak/_home.scss).
    "hero-phone": 430 / 520
};

/**
 * One line for the log. libvips never clears its error buffer, so a message repeats every
 * earlier warning ("premature end of JPEG image" from cut-off uploads) – only the first
 * line and the last complaint are kept.
 */
function describe(error) {
    const text = Array.isArray(error?.message) ? error.message.join(": ") : String(error?.message ?? error);
    const lines = text.split("\n").map(line => line.trim()).filter(Boolean);
    return lines.length > 2 ? `${lines[0]} … ${lines[lines.length - 1]}` : lines.join(" ");
}

function createImageResizer({ uploadsDir, cacheDir }) {
    const uploadsRoot = path.resolve(uploadsDir) + path.sep;
    let vipsPromise = null;
    // One conversion at a time: decoding a 2000 px photo takes tens of MB, and the hosting
    // counts the app's memory. Requests for the same copy share one conversion.
    let queue = Promise.resolve();
    const pending = new Map();

    function vips() {
        if (!vipsPromise) {
            vipsPromise = require("wasm-vips")({
                dynamicLibraries: [],
                // No warnings on stderr: a cut-off JPEG (11 in uploads/ as of 2026-11) still
                // converts, with its missing rows grey, but libvips never clears its warning
                // buffer, so every later conversion printed all earlier warnings again.
                // Errors still reach the handler below.
                preRun: [module => (module.ENV.VIPS_WARNING = "0")]
            }).then(instance => {
                // Nothing kept between requests – every copy is converted once and then
                // read from disk.
                instance.Cache.max(0);
                return instance;
            });
            vipsPromise.catch(() => (vipsPromise = null));
        }
        return vipsPromise;
    }

    /** The part of the photo the frame shows; the whole photo when it is narrower. */
    function frameArea(image, { ratio, x, y }) {
        const { width, height } = image;
        if (width / height > ratio) {
            const cut = Math.round(height * ratio);
            return [Math.round(((width - cut) * x) / 100), 0, cut, height];
        }
        const cut = Math.round(width / ratio);
        return [0, Math.round(((height - cut) * y) / 100), width, cut];
    }

    function resized(instance, source, width, frame) {
        if (!frame) return instance.Image.thumbnail(source, width, { size: "down" });
        // Upright first, as the browser shows the original (and as thumbnail does).
        const original = instance.Image.newFromFile(source);
        const upright = original.autorot();
        const cut = upright.extractArea(...frameArea(upright, frame));
        try {
            return cut.thumbnailImage(width, { size: "down" });
        } finally {
            for (const image of [cut, upright, original]) image.delete();
        }
    }

    async function convert(source, target, width, frame) {
        const instance = await vips();
        const image = resized(instance, source, width, frame);
        try {
            const buffer = image.writeToBuffer(".webp", { Q: QUALITY, strip: true });
            await fs.promises.mkdir(path.dirname(target), { recursive: true });
            // Written aside and renamed, so a concurrent reader never gets half a file.
            const partial = `${target}.${process.pid}.part`;
            await fs.promises.writeFile(partial, buffer);
            await fs.promises.rename(partial, target);
        } finally {
            image.delete();
        }
    }

    /**
     * Path of an up-to-date copy, converting it first when needed. `frame` – from
     * frameOf() – cuts the photo to a frame before resizing.
     */
    async function copyOf(source, width, frame = null) {
        const relative = path.relative(uploadsRoot, source);
        const variant = frame ? path.join(`${frame.name}-${frame.x}-${frame.y}`, String(width)) : String(width);
        const target = path.join(cacheDir, variant, `${relative}.webp`);
        const [sourceStat, targetStat] = await Promise.all([
            fs.promises.stat(source),
            fs.promises.stat(target).catch(() => null)
        ]);
        if (targetStat && targetStat.mtimeMs >= sourceStat.mtimeMs) return target;

        if (!pending.has(target)) {
            const job = queue.then(() => convert(source, target, width, frame));
            queue = job.catch(() => undefined);
            pending.set(target, job);
            job.finally(() => pending.delete(target)).catch(() => undefined);
        }
        await pending.get(target);
        return target;
    }

    /** Resolves `relative` inside uploads/, or null for anything outside it or not a photo. */
    function sourcePath(relative) {
        if (!relative || !SOURCE_TYPES.test(relative)) return null;
        const source = path.resolve(uploadsRoot, relative);
        return source.startsWith(uploadsRoot) ? source : null;
    }

    /**
     * "hero-phone", "40-50" → the frame, or null for an unknown frame or a position that is
     * not two whole per cents (anything else would multiply the copies on disk).
     */
    function frameOf(name, position) {
        const match = /^(\d{1,3})-(\d{1,3})$/.exec(position ?? "");
        if (!Object.hasOwn(FRAMES, name) || !match) return null;
        const [x, y] = [Number(match[1]), Number(match[2])];
        return x <= 100 && y <= 100 ? { name, ratio: FRAMES[name], x, y } : null;
    }

    /** Express handler for /img/:width/* and /img/:frame/:position/:width/* */
    function handler(req, res, next) {
        const width = Number(req.params.width);
        const source = sourcePath(req.params[0]);
        const frame = req.params.frame ? frameOf(req.params.frame, req.params.position) : null;
        if (!WIDTHS.includes(width) || !source || (req.params.frame && !frame)) return next();

        fs.promises
            .access(source)
            .then(
                () =>
                    copyOf(source, width, frame).then(
                        target =>
                            res.sendFile(target, {
                                maxAge: "1d",
                                headers: { "Content-Type": "image/webp" }
                            }),
                        error => {
                            const variant = frame ? `${frame.name} ${frame.x}-${frame.y} ` : "";
                            console.error(`[img] ${req.params[0]} ${variant}@${width}: ${describe(error)}`);
                            res.sendFile(source, { maxAge: "1h" });
                        }
                    ),
                () => next()
            )
            .catch(next);
    }

    return { handler, copyOf, sourcePath, frameOf, WIDTHS };
}

module.exports = { createImageResizer, describe, WIDTHS, FRAMES };
