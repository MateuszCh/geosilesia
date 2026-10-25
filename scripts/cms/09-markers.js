// Step 9: TOP 50 numbers and rock types on markers; the TOP 50 page links to the map.
//
//   node scripts/cms/09-markers.js [--apply --db=<database>] [--rocks=<file>]
//
// - `top50`: from data/top50-markers.json, chosen by hand from the marker titles (an entry
//   may cover several markers, e.g. "Góra Zamkowa, Biakło i Sokole Góry"). Each marker is
//   matched by id and its title is checked, so a database where the ids mean other markers
//   is left alone for that marker.
// - `rock`: titles read "Name, rock (abbreviations) – note"; the part after the comma that
//   names a rock or formation becomes `rock` ("górnojurajskie wapienie"). The title stays.
// - The TOP 50 list gets its map link "/mapa-atrakcji?top50=1" – the filter now has markers.
//
// --rocks=<file> writes every extracted rock to a file for review.
//
// Idempotent: only empty fields are filled; a marker with another TOP 50 number is reported.

const fs = require("fs");
const path = require("path");
const { withDb, backup, bumpContentVersion, printReport, updatePageRows } = require("./lib");

const TOP50_PAGE = "geosilesia-top-atrakcje-geoturystyczne";
const MAP_LINK = "/mapa-atrakcji?top50=1";
const MAPPING = require("./data/top50-markers.json");

/** Words of rock and formation names; the comma part of a title must contain one. */
const ROCK_WORDS =
    /(wapie|dolomit|piask|łupk|margl|\biły?\b|iłów|glin|granit|cieszynit|diabaz|żwir|zlepie|flisz|utwor|osad|węgl|syderyt|bazalt|tuf|gips|trawertyn|martwic|less|\bkred|opok|jur|trias|karbo|dewo|perm|czwartorzęd|trzeciorzęd|neogen|mioce|plejstoce|w-w|warstw|seri[ai]|sill|lamprofir|galman|kruszc|krzemie|torf)/i;
/** Comma parts that describe the place, not its rock, even when they mention one. */
const NOT_ROCK = /^(gdzie|a |wioska|tzw\.|d\. ośrodek|obecnie|geomorfologia)/i;

/** The title without bracketed notes, which may nest. */
function withoutBrackets(title) {
    let depth = 0;
    let out = "";
    for (const char of title) {
        if (char === "(") depth++;
        else if (char === ")") depth = Math.max(0, depth - 1);
        else if (!depth) out += char;
    }
    return out.replace(/\s+/g, " ").trim();
}

const beforeNote = text => text.split(/\s[–-]\s/)[0].replace(/[\s,;.]+$/, "").trim();

/** "Jaskinia Głęboka k. Podlesic, górnojurajskie wapienie (RPN …) – …" → "górnojurajskie wapienie" */
function rockOf(title) {
    const parts = withoutBrackets(String(title || "")).split(",");
    for (let i = 1; i < parts.length; i++) {
        const part = beforeNote(parts[i]);
        if (ROCK_WORDS.test(part) && !NOT_ROCK.test(part)) return beforeNote(parts.slice(i).join(","));
    }
    return "";
}

withDb(async (db, { apply, dbName }) => {
    console.log(`database: ${dbName}`);
    const report = [];
    const posts = db.collection("posts");
    const markers = await posts.find({ type: "marker" }).toArray();
    const byId = new Map(markers.map(marker => [marker.id, marker]));
    const now = Date.now();
    const updates = new Map(); // marker _id → fields to set

    const set = (marker, field, value) => {
        const fields = updates.get(marker._id) || {};
        fields[`data.${field}`] = value;
        updates.set(marker._id, fields);
    };

    // TOP 50 numbers.
    let numbered = 0;
    let numberedAlready = 0;
    MAPPING.forEach(entry => {
        const names = [];
        entry.markers.forEach(({ id, title }) => {
            const marker = byId.get(id);
            if (!marker || marker.title !== title) {
                report.push(`skip   TOP 50 nr ${entry.number}: marker ${id} ${marker ? `is now "${marker.title}"` : "does not exist"}`);
                return;
            }
            const current = marker.data && marker.data.top50;
            if (current === entry.number) {
                numberedAlready++;
                return;
            }
            if (current) {
                report.push(`skip   marker ${id} "${title}" already has TOP 50 nr ${current}, not ${entry.number}`);
                return;
            }
            set(marker, "top50", entry.number);
            numbered++;
            const where = marker.data && marker.data.lat && marker.data.long ? "" : " [no coordinates – not on the map]";
            names.push(`${title.length > 90 ? title.slice(0, 87) + "…" : title}${where}`);
        });
        if (names.length) report.push(`top50 ${String(entry.number).padStart(2)}. ${entry.top50}\n           ← ${names.join("\n           ← ")}`);
    });
    report.push(`${numbered} marker(s) get a TOP 50 number${numberedAlready ? `, ${numberedAlready} have it already` : ""}`);

    // Rock types.
    const rocks = [];
    markers.forEach(marker => {
        if (marker.data && marker.data.rock) return;
        const rock = rockOf(marker.title);
        if (!rock) return;
        set(marker, "rock", rock);
        rocks.push({ id: marker.id, rock, title: marker.title });
    });
    const counts = new Map();
    rocks.forEach(({ rock }) => counts.set(rock, (counts.get(rock) || 0) + 1));
    const common = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([rock, count]) => `${rock} ×${count}`);
    report.push(`${rocks.length} of ${markers.length} marker(s) get a rock from the title; most common: ${common.join("; ")}`);
    rocks
        .filter((_, i) => i % Math.max(1, Math.floor(rocks.length / 12)) === 0)
        .slice(0, 12)
        .forEach(({ rock, title }) => report.push(`  rock "${rock}"  ← ${title.length > 80 ? title.slice(0, 77) + "…" : title}`));
    const rocksFile = (process.argv.find(arg => arg.startsWith("--rocks=")) || "").slice("--rocks=".length);
    if (rocksFile) {
        fs.writeFileSync(rocksFile, rocks.map(({ id, rock, title }) => `${id}\t${rock}\t${title}`).join("\n") + "\n");
        report.push(`every rock written to ${path.resolve(rocksFile)}`);
    }

    // The TOP 50 list's map link.
    const pages = db.collection("pages");
    const page = await pages.findOne({ pageUrl: TOP50_PAGE });
    let pageRows;
    if (page) {
        const index = page.rows.findIndex(r => r && r.type === "top50" && r.data.variant === "lista");
        if (index >= 0 && !page.rows[index].data.link) {
            pageRows = page.rows.map((r, i) => (i === index ? { ...r, data: { ...r.data, link: MAP_LINK } } : r));
            report.push(`update page "${TOP50_PAGE}": TOP 50 list links to ${MAP_LINK}`);
        } else {
            report.push(`ok     page "${TOP50_PAGE}": ${index < 0 ? "no TOP 50 list" : `link is "${page.rows[index].data.link}"`}`);
        }
    }

    printReport("Markers", report, apply);
    if (apply && (updates.size || pageRows)) {
        console.log(`backup: ${await backup(db, "markers", ["posts", "pages"])}`);
        if (updates.size) {
            await posts.bulkWrite(
                [...updates].map(([_id, fields]) => ({ updateOne: { filter: { _id }, update: { $set: { ...fields, updated: now } } } }))
            );
        }
        if (pageRows) await updatePageRows(db, page._id, pageRows);
        await bumpContentVersion(db);
    }
}).catch(err => {
    console.error(err.message);
    process.exit(1);
});
