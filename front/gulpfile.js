const gulp = require('gulp'),
    sass = require('gulp-sass')(require('sass')),
    inject = require('gulp-inject'),
    hash = require('gulp-hash'),
    imagemin = require('gulp-imagemin'),
    uglify = require('gulp-uglify'),
    prefix = require('gulp-autoprefixer'),
    browserSync = require('browser-sync').create(),
    concat = require('gulp-concat'),
    htmlmin = require('gulp-htmlmin'),
    cleancss = require('gulp-clean-css'),
    series = require('stream-series'),
    fs = require('fs'),
    // nodemon = require('gulp-nodemon'),
    del = require('del');

// Konfiguracja środowiska (mongoUrl, dbName, siteUrl, apiUrl) – wzorzec w config.example.json.
// Plik jest w .gitignore, więc może go nie być (np. świeży klon) – wtedy tylko ostrzegamy,
// żeby jego brak nie ubijał pozostałych tasków.
let config = {};
try {
    config = require('../config.json');
} catch (err) {
    console.warn(
        '[seo] Nie znaleziono config.json w katalogu głównym projektu.'
    );
}

const paths = {
    srcHTML: 'src/**/*.html',
    srcTemplates: 'src/html/**/*.html',
    srcSCSS: 'src/sass/main.scss',
    srcSCSSs: 'src/sass/**/*.scss',
    srcJS: 'src/js/**/*.js',
    srcIMAGES: 'src/images/**/*',
    idb: './node_modules/idb/lib/idb.js',

    public: 'public',
    publicIndex: 'public/index.html',
    publicCSS: 'public/css',
    publicJS: 'public/js',
    publicHTML: 'public/html',
    publicIMAGES: 'public/images'
};

const vendor = require('./vendor');

// const opts = {
//     algorithm: "sha1",
//     hashLength: 40,
//     template: "<%= name %><%= ext %>?hash=<%= hash %>"
// };

function errorLog(error) {
    console.error.bind(error);
    this.emit('end');
}

///////////
// TASKS //
///////////

gulp.task('html', function () {
    return gulp
        .src(paths.srcHTML)
        .pipe(htmlmin({ collapseWhitespace: true }))
        .pipe(gulp.dest(paths.public));
});

gulp.task('htmlWatch', function () {
    return gulp
        .src(paths.srcTemplates)
        .pipe(htmlmin({ collapseWhitespace: true }))
        .pipe(gulp.dest(paths.publicHTML))
        .pipe(browserSync.stream());
});

gulp.task('css', function () {
    return gulp
        .src(paths.srcSCSS)
        .pipe(sass())
        .on('error', errorLog)
        .pipe(prefix('> 1%'))
        .pipe(cleancss())
        .pipe(gulp.dest(paths.publicCSS))
        .pipe(browserSync.stream());
});

gulp.task('js', function () {
    return gulp
        .src(paths.srcJS)
        .on('error', errorLog)
        .pipe(concat('app.min.js'))
        .pipe(uglify())
        .pipe(gulp.dest(paths.publicJS))
        .pipe(browserSync.stream());
});

gulp.task('jsLib', function () {
    return gulp
        .src(vendor)
        .on('error', errorLog)
        .pipe(concat('libs.min.js'))
        .pipe(gulp.dest(paths.publicJS));
});

gulp.task('idbLib', function () {
    return gulp
        .src(paths.idb)
        .on('error', errorLog)
        .pipe(uglify())
        .pipe(gulp.dest(paths.publicJS));
});

gulp.task('images', function () {
    return gulp
        .src(paths.srcIMAGES)
        .pipe(imagemin())
        .pipe(gulp.dest(paths.publicIMAGES));
});

// Generuje public/sitemap.xml oraz uzupełnia public/robots.txt o dyrektywę Sitemap.
// Konfiguracja w config.json (katalog główny projektu):
//   siteUrl  – bezwzględny adres produkcyjny (np. https://twoja-domena.pl). Wymagany.
//   apiUrl   – bazowy adres API do pobrania listy stron (domyślnie http://localhost:3000).
// Task nie przerywa buildu przy braku siteUrl lub błędzie sieci – wtedy tylko ostrzega.
gulp.task('seo', async function () {
    const siteUrl = (config.siteUrl || '').replace(/\/+$/, '');
    const apiUrl = (config.apiUrl || 'http://localhost:3000').replace(
        /\/+$/,
        ''
    );

    if (!siteUrl) {
        console.warn(
            '[seo] Pominięto generowanie sitemap.xml – ustaw "siteUrl" w config.json, np. "https://twoja-domena.pl"'
        );
        return;
    }

    let pageUrls = ['/'];
    try {
        const res = await fetch(`${apiUrl}/api/appData/`);
        const data = await res.json();
        if (data && Array.isArray(data.pages)) {
            pageUrls = data.pages
                .map(p => p && p.pageUrl)
                .filter(Boolean)
                .filter((v, i, a) => a.indexOf(v) === i);
        }
    } catch (err) {
        // Przy fetch prawdziwa przyczyna (np. ECONNREFUSED) siedzi w err.cause –
        // err.message to zawsze ogólne "fetch failed".
        const cause = (err.cause && err.cause.code) || err.message;
        console.warn(
            `[seo] Nie udało się pobrać listy stron z ${apiUrl}/api/appData/ – sitemap tylko ze stroną główną. (${cause})`
        );
        if (cause === 'ECONNREFUSED') {
            console.warn(
                '[seo] Nikt nie słucha pod tym adresem – uruchom serwer (node app.js) albo popraw "apiUrl" w config.json.'
            );
        }
    }

    const urls = pageUrls
        .map(url => {
            const loc = siteUrl + (url.charAt(0) === '/' ? url : `/${url}`);
            return `    <url>\n        <loc>${loc}</loc>\n    </url>`;
        })
        .join('\n');

    const sitemap =
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        urls +
        '\n</urlset>\n';

    fs.mkdirSync(paths.public, { recursive: true });
    fs.writeFileSync(`${paths.public}/sitemap.xml`, sitemap);

    const robots =
        'User-agent: *\nAllow: /\n\nSitemap: ' + `${siteUrl}/sitemap.xml\n`;
    fs.writeFileSync(`${paths.public}/robots.txt`, robots);

    console.log(
        `[seo] Zapisano sitemap.xml (${pageUrls.length} URL) oraz robots.txt dla ${siteUrl}`
    );
});

gulp.task('copy', gulp.series(gulp.parallel('html', 'css', 'js')));

gulp.task(
    'inject',
    gulp.series(gulp.parallel('copy'), function () {
        const css = gulp.src('public/css/main.css');
        const js = gulp.src(['public/js/app.min.js'], { read: false });
        const vendor = gulp.src(['public/js/libs.min.js'], { read: false });
        const idb = gulp.src(['public/js/idb.js'], { read: false });
        return gulp
            .src(paths.publicIndex)
            .pipe(inject(css, { relative: true }))
            .pipe(inject(series(vendor, idb, js), { relative: true }))
            .pipe(gulp.dest(paths.public));
    })
);

gulp.task(
    'browser-sync',
    gulp.series(gulp.parallel('inject'), function () {
        browserSync.init({
            port: 3001,
            proxy: {
                target: 'localhost:3000',
                ws: false
            }
        });
    })
);

gulp.task(
    'watch',
    gulp.series(gulp.parallel('inject'), function () {
        gulp.watch([paths.srcTemplates], gulp.series('htmlWatch'));
        gulp.watch([paths.srcSCSSs], gulp.series('css'));
        gulp.watch([paths.srcJS], gulp.series('js'));
    })
);

gulp.task(
    'watch-sync',
    gulp.series(gulp.parallel('browser-sync'), function () {
        gulp.watch([paths.srcTemplates], gulp.series('htmlWatch'));
        gulp.watch([paths.srcSCSSs], gulp.series('css'));
        gulp.watch([paths.srcJS], gulp.series('js'));
    })
);

gulp.task(
    'default',
    gulp.series(gulp.parallel('images', 'jsLib', 'idbLib', 'inject'), 'seo')
);

gulp.task('clean', function () {
    del([
        paths.publicIndex,
        paths.publicHTML,
        paths.publicCSS,
        paths.publicJS,
        paths.publicIMAGES
    ]);
});
