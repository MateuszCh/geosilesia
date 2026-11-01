// Step 25: a TOP 50 place picks its markers (needs frodo with "post" fields).
//
//   node scripts/cms/25-top50-markers.js [--apply --db=<database>]
//
// - the `top50` post type ("Atrakcja TOP 50") gets a "post" field `markers` ("Obiekty na
//   mapie", posts of `marker`) right after its number;
// - every TOP 50 post gets the markers whose `top50` ("Numer w TOP 50", step 09) is its number;
// - the `marker` post type loses `top50` and the markers lose its values: the map takes the
//   numbers from the TOP 50 posts, so renumbering the route no longer means editing markers.
// `updated` of the posts stays.
//
// Idempotent: a TOP 50 post that already has markers is left alone; with no `top50` field on
// markers any more there is nothing to carry over. A marker number that no TOP 50 post has
// stops the run, so no number is lost.

const { withDb, backup, bumpContentVersion, printReport } = require("./lib");
const { top50Markers } = require("./definitions");

withDb(async (db, { apply, dbName }) => {
    console.log(`database: ${dbName}`);
    if (apply) console.log(`backup: ${await backup(db, "top50-markers", ["posts", "post_types"])}`);

    const postTypes = db.collection("post_types");
    const posts = db.collection("posts");
    const top50Type = await postTypes.findOne({ type: "top50" });
    const markerType = await postTypes.findOne({ type: "marker" });
    if (!top50Type || !markerType) throw new Error("no top50 or marker post type – run step 01 first");

    const hasMarkers = top50Type.fields.some(f => f.id === top50Markers.id);
    const top50Fields = hasMarkers
        ? top50Type.fields
        : top50Type.fields.flatMap(f => (f.id === "number" ? [f, top50Markers] : [f]));
    if (!top50Fields.some(f => f.id === top50Markers.id)) top50Fields.push(top50Markers);
    const markerHasNumber = markerType.fields.some(f => f.id === "top50");
    printReport(
        "Post types",
        [
            hasMarkers ? "ok     post_types:top50 (has markers)" : "update post_types:top50\n      + markers:post(marker)",
            markerHasNumber ? "update post_types:marker\n      - top50:number" : "ok     post_types:marker (no top50)"
        ],
        apply
    );

    const numbered = await posts
        .find({ type: "marker", "data.top50": { $nin: [null, ""] } }, { projection: { id: 1, title: 1, "data.top50": 1 } })
        .sort({ id: 1 })
        .toArray();
    const byNumber = new Map();
    numbered.forEach(marker => {
        const number = Number(marker.data.top50);
        if (number) byNumber.set(number, [...(byNumber.get(number) || []), marker]);
    });

    const report = [];
    const updates = [];
    const places = await posts.find({ type: "top50" }).sort({ "data.number": 1 }).toArray();
    for (const place of places) {
        if (place.data?.markers?.ids?.length) continue;
        const number = Number(place.data?.number);
        const markers = byNumber.get(number) || [];
        byNumber.delete(number);
        if (!markers.length) {
            report.push(`!      ${number}. ${place.title}: no marker has this number`);
            continue;
        }
        updates.push({ _id: place._id, ids: markers.map(m => m.id) });
        report.push(`update ${number}. ${place.title} <- ${markers.map(m => `${m.id} "${m.title.slice(0, 50)}"`).join(", ")}`);
    }
    // Unset, their numbers would be lost.
    const orphans = [...byNumber].filter(([number]) => !places.some(place => Number(place.data?.number) === number && place.data?.markers?.ids?.length));
    if (orphans.length) {
        throw new Error(`markers with a number no TOP 50 post has:\n  ${orphans.map(([number, markers]) => `${number}: ${markers.map(m => m.id).join(", ")}`).join("\n  ")}`);
    }
    report.push(`${markerHasNumber || numbered.length ? "unset" : "ok   "}  data.top50 on ${numbered.length} markers`);
    printReport("Posts", report, apply);

    if (!apply) return;
    for (const update of updates) await posts.updateOne({ _id: update._id }, { $set: { "data.markers": { ids: update.ids } } });
    if (!hasMarkers) await postTypes.updateOne({ _id: top50Type._id }, { $set: { fields: top50Fields, updated: Date.now() } });
    if (markerHasNumber) {
        await postTypes.updateOne(
            { _id: markerType._id },
            { $set: { fields: markerType.fields.filter(f => f.id !== "top50"), updated: Date.now() } }
        );
    }
    if (numbered.length) await posts.updateMany({ type: "marker", "data.top50": { $exists: true } }, { $unset: { "data.top50": "" } });
    if (!hasMarkers || markerHasNumber || updates.length || numbered.length) await bumpContentVersion(db);
}).catch(err => {
    console.error(err.message);
    process.exit(1);
});
