// Makes the resized WebP copies (images.js) of every photo in uploads/ ahead of time, so
// the first visitor of a page does not wait for the conversions. Safe to run again: copies
// that are already up to date are skipped. Run after deploying the image pipeline:
//
//   node scripts/warm-images.js            # every width
//   node scripts/warm-images.js 400 800    # chosen widths only

const path = require("path");
const fs = require("fs");
const { createImageResizer, WIDTHS } = require("../images");

const root = path.join(__dirname, "..");
const uploadsDir = path.join(root, "uploads");
const images = createImageResizer({
    uploadsDir,
    cacheDir: path.join(root, "tmp", "img-cache")
});

const widths = process.argv.slice(2).map(Number);
const chosen = widths.length ? widths.filter(width => WIDTHS.includes(width)) : WIDTHS;

function* photos(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) yield* photos(full);
        else if (images.sourcePath(path.relative(uploadsDir, full))) yield full;
    }
}

(async () => {
    const files = [...photos(uploadsDir)];
    const started = Date.now();
    let failed = 0;
    for (const [index, file] of files.entries()) {
        for (const width of chosen) {
            try {
                await images.copyOf(file, width);
            } catch (error) {
                failed++;
                console.error(`${path.relative(uploadsDir, file)} @${width}: ${error.message}`);
            }
        }
        if ((index + 1) % 100 === 0) console.log(`${index + 1}/${files.length}`);
    }
    const seconds = Math.round((Date.now() - started) / 1000);
    console.log(`${files.length} photos × ${chosen.length} widths in ${seconds} s, ${failed} failed`);
    process.exit(failed ? 1 : 0);
})();
