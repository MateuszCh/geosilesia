// Step 1: component and post type definitions of variant C.
//
//   node scripts/cms/01-definitions.js           # dry run: what would be created or extended
//   node scripts/cms/01-definitions.js --apply --db=<database>   # writes (after a backup)
//
// Idempotent: definitions are matched by `type`; a missing one is created with an id from
// the counter, an existing one only gains the fields it lacks. Nothing is removed. The one
// retype (title_and_text paragraph_class: text → select) is listed explicitly.

const { withDb, upsertDefinitions, backup, bumpContentVersion, printReport } = require("./lib");
const { newComponents, changedComponents, newPostTypes, changedPostTypes, RETYPE } = require("./definitions");

withDb(async (db, { apply, dbName }) => {
    console.log(`database: ${dbName}`);
    if (apply) console.log(`backup: ${await backup(db, "definitions", ["components", "post_types", "counters"])}`);

    const components = await upsertDefinitions(db, "components", [...newComponents, ...changedComponents], { apply, retype: RETYPE });
    printReport("components", components.report, apply);

    const postTypes = await upsertDefinitions(db, "post_types", [...newPostTypes, ...changedPostTypes], { apply });
    printReport("post types", postTypes.report, apply);

    const changed = components.changed + postTypes.changed;
    if (apply && changed) await bumpContentVersion(db);
    console.log(`\n${changed} definition(s) ${apply ? "written" : "would change"}`);
}).catch(err => {
    console.error(err.message);
    process.exit(1);
});
