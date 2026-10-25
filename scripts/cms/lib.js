// Shared helpers for the CMS scripts in this folder. They talk to the same MongoDB as
// frodo (the CMS) and mirror its write rules, so that what a script creates looks exactly
// like something saved in the panel:
// - numeric `id` taken from the single `counters` document, which is then incremented;
// - `created` / `updated` in milliseconds;
// - field ids lowercase with `_` instead of whitespace;
// - a new post is pushed into its post type's `posts` array;
// - `meta { _id: "content" }.version` is bumped after writes, so the site drops its caches.
//
// Every writing script is a dry run unless started with `--apply`, and backs up the
// collections it touches to JSON before the first write.

const fs = require("fs");
const path = require("path");
const { MongoClient, ObjectId } = require("mongodb");

const ROOT = path.resolve(__dirname, "../..");
const BACKUP_DIR = path.join(ROOT, "tmp", "cms-backups");

function loadConfig() {
    const file = path.join(ROOT, "config.json");
    if (!fs.existsSync(file)) {
        throw new Error("config.json is missing in the repository root");
    }
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

/** Runs `fn(db, ctx)` with an open connection and closes it afterwards. */
async function withDb(fn) {
    const config = loadConfig();
    const client = new MongoClient(config.mongoUrl);
    await client.connect();
    try {
        const db = client.db(config.dbName);
        const apply = process.argv.includes("--apply");
        return await fn(db, { apply, dbName: config.dbName });
    } finally {
        await client.close();
    }
}

/** frodo's `formatId`: whitespace to `_`, lowercase. */
function formatId(str) {
    return String(str).replace(/\s+/g, "_").toLowerCase();
}

/**
 * Builds a field definition the way frodo stores it (a mongoose subdocument with its own
 * `_id`, `repeaterFields` always present). `spec` is `[id, title, type, extra]`, where
 * `extra` is a `selectOptions` string or an array of nested field specs for a repeater.
 */
function field([id, title, type, extra]) {
    const result = {
        _id: new ObjectId(),
        title,
        type,
        id: formatId(id),
        repeaterFields: []
    };
    if (type === "select" && typeof extra === "string") result.selectOptions = extra;
    if (type === "multiselect" && typeof extra === "string") result.multiselectOptions = extra;
    if (type === "repeater") result.repeaterFields = (extra || []).map(field);
    return result;
}

/** Compact, comparable description of a field list: `id:type`, repeaters as `id[...]`. */
function describeFields(fields) {
    return (fields || []).map(f => {
        if (f.type === "repeater") return `${f.id}[${describeFields(f.repeaterFields).join(", ")}]`;
        const options = f.selectOptions || f.multiselectOptions;
        return options ? `${f.id}:${f.type}(${options})` : `${f.id}:${f.type}`;
    });
}

/**
 * Adds the missing fields from `wanted` to `existing`, recursing into repeaters with the
 * same id. Existing fields are never removed or retyped, unless `retype` lists their path
 * (e.g. "text.paragraph_class"). Returns the merged list and the list of changes.
 */
function mergeFields(existing, wanted, { retype = [], prefix = "" } = {}) {
    const merged = (existing || []).map(f => ({ ...f }));
    const changes = [];
    wanted.forEach(w => {
        const current = merged.find(f => f.id === w.id);
        const fieldPath = prefix ? `${prefix}.${w.id}` : w.id;
        if (!current) {
            merged.push(w);
            changes.push(`+ ${fieldPath}:${w.type}`);
            return;
        }
        if (current.type !== w.type || (w.selectOptions && current.selectOptions !== w.selectOptions)) {
            if (retype.includes(fieldPath)) {
                changes.push(`~ ${fieldPath}: ${current.type} -> ${w.type}${w.selectOptions ? `(${w.selectOptions})` : ""}`);
                current.type = w.type;
                if (w.selectOptions) current.selectOptions = w.selectOptions;
            } else {
                changes.push(`! ${fieldPath} is ${current.type}, spec wants ${w.type} — left as is`);
            }
        }
        if (w.type === "repeater" && current.type === "repeater") {
            const nested = mergeFields(current.repeaterFields, w.repeaterFields, { retype, prefix: fieldPath });
            current.repeaterFields = nested.fields;
            changes.push(...nested.changes);
        }
    });
    return { fields: merged, changes };
}

/** Reads the single counter document and reserves `count` consecutive ids. */
async function reserveIds(db, count, apply) {
    const counters = db.collection("counters");
    const counter = await counters.findOne({});
    if (!counter) throw new Error("counters collection has no document");
    const first = counter.counter;
    if (apply) await counters.updateOne({ _id: counter._id }, { $inc: { counter: count } });
    return Array.from({ length: count }, (_, i) => first + i);
}

async function bumpContentVersion(db) {
    await db.collection("meta").updateOne({ _id: "content" }, { $inc: { version: 1 } }, { upsert: true });
}

/** Dumps whole collections to tmp/cms-backups/<timestamp>-<label>/<collection>.json. */
async function backup(db, label, collectionNames) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const dir = path.join(BACKUP_DIR, `${stamp}-${label}`);
    fs.mkdirSync(dir, { recursive: true });
    for (const name of collectionNames) {
        const docs = await db.collection(name).find({}).toArray();
        fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(docs, null, 2));
    }
    return path.relative(ROOT, dir);
}

/**
 * Upserts component or post type definitions by `type`. A missing definition is created
 * with a new id from the counter; an existing one only gains missing fields (see
 * mergeFields). `collection` is "components" or "post_types".
 */
async function upsertDefinitions(db, collection, definitions, { apply, retype = [] }) {
    const coll = db.collection(collection);
    const report = [];
    const toCreate = [];
    const toUpdate = [];
    for (const def of definitions) {
        const type = formatId(def.type);
        const existing = await coll.findOne({ type });
        if (!existing) {
            toCreate.push({ ...def, type });
            report.push(`create ${collection}:${type} (${describeFields(def.fields).join(", ")})`);
            continue;
        }
        const { fields, changes } = mergeFields(existing.fields, def.fields, { retype });
        const real = changes.filter(c => !c.startsWith("!"));
        if (real.length) toUpdate.push({ _id: existing._id, fields });
        report.push(
            changes.length
                ? `update ${collection}:${type}\n      ${changes.join("\n      ")}`
                : `ok     ${collection}:${type} (nothing to add)`
        );
    }
    if (apply && (toCreate.length || toUpdate.length)) {
        const ids = await reserveIds(db, toCreate.length, true);
        const now = Date.now();
        for (const [i, def] of toCreate.entries()) {
            const doc = { title: def.title, type: def.type, fields: def.fields, id: ids[i], created: now, updated: now, __v: 0 };
            if (collection === "post_types") {
                doc.pluralTitle = def.pluralTitle;
                doc.posts = [];
            }
            await coll.insertOne(doc);
        }
        for (const upd of toUpdate) {
            await coll.updateOne({ _id: upd._id }, { $set: { fields: upd.fields, updated: now } });
        }
    }
    return { report, changed: toCreate.length + toUpdate.length };
}

/** Prints the report and a dry-run banner. */
function printReport(title, lines, apply) {
    console.log(`\n=== ${title} ${apply ? "(APPLY)" : "(dry run — add --apply to write)"} ===`);
    lines.forEach(line => console.log("  " + line));
}

module.exports = {
    ROOT,
    ObjectId,
    withDb,
    formatId,
    field,
    describeFields,
    mergeFields,
    reserveIds,
    bumpContentVersion,
    backup,
    upsertDefinitions,
    printReport
};
