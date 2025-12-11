const express = require("express"),
    bodyParser = require("body-parser"),
    path = require("path"),
    MongoClient = require("mongodb").MongoClient,
    config = require("./config");

const app = express();
app.set("port", process.env.PORT || 3000);

let db;
const collections = {};
let databaseError = false;

const client = new MongoClient(config.mongoUrl);

client.connect()
    .then(client => {
        db = client.db(config.dbName);
        collections.posts = db.collection("posts");
        collections.pages = db.collection("pages");
        collections.files = db.collection("files");
        app.listen(app.get("port"), () => console.log("Running on port 3000"));
    })
    .catch(err => {
        databaseError = err;
        console.log(new Date(), err);
        app.listen(app.get("port"), () => console.log("Running on port 3000"));
    });

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.get("/api*", (req, res, next) => {
    if (databaseError) {
        res.status(503).send({ error: "Resource unavailable" });
    } else {
        next();
    }
});

app.get("/api/posts/:type", (req, res, next) => {
    collections.posts
        .find({ type: req.params.type })
        .toArray()
        .then(posts => res.send(posts))
        .catch(next);
});

app.get("/api/page/", (req, res, next) => {
    collections.pages
        .find({ pageUrl: "/" })
        .toArray()
        .then(page => res.send(page))
        .catch(next);
});

function processRequest(res, posts, pages) {
    function sendResponse(pages, posts) {
        const data = {};
        if (pages) data.pages = pages;
        if (posts) data.posts = posts;
        res.send(data);
    }

    const galleries = [];
    if (pages && pages.length) {
        pages.forEach(page => {
            if (page.rows) {
                page.rows.forEach(row => {
                    if (row.type === "gallery") {
                        galleries.push(row);
                    }
                });
            }
        });
    }
    if (galleries.length) {
        const promises = [];
        galleries.forEach(gallery => {
            if (gallery.data.catalogue) {
                promises.push(
                    collections.files
                        .find({ catalogues: gallery.data.catalogue })
                        .toArray()
                );
            }
        });
        if (promises.length) {
            Promise.all(promises).then(responses => {
                responses.forEach((response, i) => {
                    galleries[i].data.catalogue = response;
                });
                sendResponse(pages, posts);
            });
        } else {
            sendResponse(pages, posts);
        }
    } else {
        sendResponse(pages, posts);
    }
}
app.get("/api/appData/", (req, res, next) => {
    Promise.all([
        collections.pages.find({}).toArray(),
        collections.posts.find({}).toArray()
    ])
        .then(response => {
            processRequest(res, response[1], response[0]);
        })
        .catch(next);
});

app.get("/api/page/:pageUrl", (req, res, next) => {
    collections.pages
        .find({ pageUrl: req.params.pageUrl })
        .toArray()
        .then(pages => {
            processRequest(res, undefined, pages);
        })
        .catch(next);
});

app.use("/uploads", express.static(`${__dirname}/uploads`));
app.use("/", express.static(`${__dirname}/front/public`));
app.get(["*"], (req, res) =>
    res.sendFile(path.resolve(`${__dirname}/front/public/index.html`))
);

app.use((err, req, res, next) => {
    console.log(err);
    console.log(err.message);
    if (typeof err === "string") {
        res.status(422).send({ error: err });
    } else if (typeof err.message === "string") {
        res.status(422).send({ error: err.message });
    } else if (err.errors) {
        const firstError = Object.keys(err.errors)[0];
        res.status(422).send({ error: err.errors[firstError].message });
    } else {
        res.status(422).send(err.message);
    }
});
