// Restores collections from a backup made by a writing script.
//
//   node scripts/cms/restore.js tmp/cms-backups/<dir> pages posts   # dry run
//   node scripts/cms/restore.js tmp/cms-backups/<dir> pages --apply  # replaces the collection
//
// The collection is emptied and refilled with the backed-up documents, then the content
// version is bumped so the site drops its caches.

const fs = require("fs");
const path = require("path");
const { withDb, EJSON, bumpContentVersion, ROOT } = require("./lib");

const [dirArg, ...rest] = process.argv.slice(2).filter(arg => arg !== "--apply");
if (!dirArg || !rest.length) {
    console.error("usage: node scripts/cms/restore.js <backup dir> <collection>... [--apply]");
    process.exit(1);
}
const dir = path.resolve(ROOT, dirArg);

withDb(async (db, { apply }) => {
    for (const name of rest) {
        const file = path.join(dir, `${name}.json`);
        const docs = EJSON.parse(fs.readFileSync(file, "utf8"), { relaxed: false });
        const current = await db.collection(name).countDocuments();
        console.log(`${name}: ${current} documents now, ${docs.length} in the backup`);
        if (apply) {
            await db.collection(name).deleteMany({});
            if (docs.length) await db.collection(name).insertMany(docs);
        }
    }
    if (apply) await bumpContentVersion(db);
    console.log(apply ? "restored" : "dry run – add --apply to restore");
}).catch(err => {
    console.error(err.message);
    process.exit(1);
});
