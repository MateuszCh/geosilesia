// Step 39: the category colour of an "Ikona" post becomes a colour picker.
//
//   node scripts/cms/39-icon-color-picker.js [--apply --db=<database>]
//
// - "Kolor kategorii" of the `icon` post type turns from a select of trail colour names into
//   frodo's "color" field (a hex "#rrggbb"), with the ten trail colours as swatches;
// - every icon post's colour name becomes its hex, so the site shows the same colours.
// `updated` of the posts stays: they look the same.
//
// Idempotent: a colour that is already hex is left alone. An unknown name stops the run.

const { withDb, backup, bumpContentVersion, printReport, upsertDefinitions } = require("./lib");
const { iconPostType, TRAIL_HEX } = require("./definitions");

const HEX = /^#[0-9a-f]{6}$/i;

withDb(async (db, { apply, dbName }) => {
    console.log(`database: ${dbName}`);

    const posts = db.collection("posts");
    const icons = await posts.find({ type: "icon" }).sort({ id: 1 }).toArray();
    const report = [];
    const updates = [];
    const unknown = [];
    for (const icon of icons) {
        const value = icon.data && icon.data.color;
        if (value == null || value === "" || HEX.test(value)) continue;
        const hex = TRAIL_HEX[String(value).trim().toLowerCase()];
        if (!hex) {
            unknown.push(`"${icon.title}": "${value}"`);
            continue;
        }
        report.push(`update icon "${icon.title}": "${value}" -> "${hex}"`);
        updates.push({ _id: icon._id, hex });
    }
    if (unknown.length) throw new Error(`icons with a colour that is not a trail colour:\n  ${unknown.join("\n  ")}`);

    if (apply) console.log(`backup: ${await backup(db, "icon-color-picker", ["post_types", "posts"])}`);

    const definitions = await upsertDefinitions(db, "post_types", [iconPostType], { apply, retype: ["color"] });
    printReport("Post types", definitions.report, apply);

    if (!report.length) report.push("ok     every icon colour is hex");
    printReport("Posts", report, apply);

    if (!apply) return;
    for (const update of updates) await posts.updateOne({ _id: update._id }, { $set: { "data.color": update.hex } });
    if (definitions.changed || updates.length) await bumpContentVersion(db);
}).catch(err => {
    console.error(err.message);
    process.exit(1);
});
