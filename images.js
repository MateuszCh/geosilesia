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

    async function convert(source, target, width) {
        const instance = await vips();
        const image = instance.Image.thumbnail(source, width, { size: "down" });
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

    /** Path of an up-to-date copy, converting it first when needed. */
    async function copyOf(source, width) {
        const relative = path.relative(uploadsRoot, source);
        const target = path.join(cacheDir, String(width), `${relative}.webp`);
        const [sourceStat, targetStat] = await Promise.all([
            fs.promises.stat(source),
            fs.promises.stat(target).catch(() => null)
        ]);
        if (targetStat && targetStat.mtimeMs >= sourceStat.mtimeMs) return target;

        if (!pending.has(target)) {
            const job = queue.then(() => convert(source, target, width));
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

    /** Express handler for /img/:width/* */
    function handler(req, res, next) {
        const width = Number(req.params.width);
        const source = sourcePath(req.params[0]);
        if (!WIDTHS.includes(width) || !source) return next();

        fs.promises
            .access(source)
            .then(
                () =>
                    copyOf(source, width).then(
                        target =>
                            res.sendFile(target, {
                                maxAge: "1d",
                                headers: { "Content-Type": "image/webp" }
                            }),
                        error => {
                            console.error(`[img] ${req.params[0]} @${width}: ${describe(error)}`);
                            res.sendFile(source, { maxAge: "1h" });
                        }
                    ),
                () => next()
            )
            .catch(next);
    }

    return { handler, copyOf, sourcePath, WIDTHS };
}

module.exports = { createImageResizer, describe, WIDTHS };
