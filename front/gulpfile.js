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
    crypto = require('crypto'),
    Transform = require('stream').Transform,
    // nodemon = require('gulp-nodemon'),
    del = require('del');

const paths = {
    srcHTML: 'src/**/*.html',
    srcIndex: 'src/index.html',
    srcTemplates: 'src/html/**/*.html',
    srcSCSS: 'src/sass/main.scss',
    srcSCSSs: 'src/sass/**/*.scss',
    srcJS: 'src/js/**/*.js',
    // Wspólny z serwerem moduł SEO – musi trafić do bundla przed seo.service.js.
    sharedSEO: '../shared/seo-meta.js',
    srcIMAGES: 'src/images/**/*',
    srcSW: 'src/sw.js',
    publicSW: 'public/sw.js',
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

// gulp.src('src/js/**/*.js') zwraca katalogi rodzeństwa w niestabilnej kolejności,
// przez co app.min.js potrafił różnić się bajtowo między buildami przy identycznych
// źródłach. Dla Angulara kolejność rejestracji nie ma znaczenia, ale powtarzalny build
// jest warunkiem sensownego hashowania wersji cache'u w zadaniu `sw`.
function sortByPath() {
    const files = [];
    return new Transform({
        objectMode: true,
        transform(file, encoding, callback) {
            files.push(file);
            callback();
        },
        flush(callback) {
            files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
            files.forEach(file => this.push(file));
            callback();
        }
    });
}

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
    // Wspólny moduł SEO idzie pierwszy, reszta w stałej kolejności alfabetycznej.
    return series(gulp.src(paths.sharedSEO), gulp.src(paths.srcJS).pipe(sortByPath()))
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

// Generuje public/sw.js ze źródła src/sw.js, wstawiając w miejsce @@CACHE_VERSION@@
// hash zawartości plików wymienionych w STATIC_FILES. Dzięki temu wersja cache'u zmienia
// się dokładnie wtedy, gdy zmieni się to, co service worker cache'uje – przebudowa bez
// zmian zostawia użytkownikom nietknięty cache.
// Musi biec PO zadaniach budujących zasoby, bo hashuje ich wynik.
gulp.task('sw', function (done) {
    const source = fs.readFileSync(paths.srcSW, 'utf8');

    const match = source.match(/var STATIC_FILES = \[([\s\S]*?)\];/);
    if (!match) {
        return done(new Error('[sw] Nie znaleziono STATIC_FILES w ' + paths.srcSW));
    }
    // Komentarze wycinamy przed wyłuskaniem stringów – jeden z nich zawiera '/',
    // które inaczej trafiłoby na listę jako plik.
    const withoutComments = match[1].replace(/\/\/[^\n]*/g, '');
    const files = (withoutComments.match(/'[^']+'/g) || [])
        .map(entry => entry.slice(1, -1))
        .filter(entry => entry !== '/'); // '/' to trasa serwera, nie plik na dysku

    const missing = files.filter(
        file => !fs.existsSync(`${paths.public}/${file.replace(/^\//, '')}`)
    );
    if (missing.length) {
        // addAll jest atomowe – brakujący plik zablokowałby rejestrację SW u użytkownika,
        // więc lepiej zatrzymać build tutaj.
        return done(
            new Error(
                `[sw] Brak plików ze STATIC_FILES w ${paths.public}: ${missing.join(', ')}`
            )
        );
    }

    const hash = crypto.createHash('sha1');
    files
        .slice()
        .sort()
        .forEach(file => {
            hash.update(file);
            hash.update(fs.readFileSync(`${paths.public}/${file.replace(/^\//, '')}`));
        });
    const version = hash.digest('hex').slice(0, 12);

    fs.writeFileSync(
        paths.publicSW,
        source.replace('@@CACHE_VERSION@@', version)
    );
    console.log(`[sw] public/sw.js – wersja ${version} (${files.length} plików)`);
    done();
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
    gulp.series(gulp.series('inject', 'sw'), function () {
        // Każdy watcher kończy się zadaniem `sw`: hash w CACHE_VERSION liczy się
        // z plików ze STATIC_FILES, więc bez tego service worker trzymałby w dewie
        // starą wersję cache'u mimo przebudowanych zasobów.
        gulp.watch([paths.srcTemplates], gulp.series('htmlWatch', 'sw'));
        gulp.watch([paths.srcSCSSs], gulp.series('css', 'sw'));
        // sharedSEO leży poza src/js, a trafia do tego samego bundla.
        gulp.watch([paths.srcJS, paths.sharedSEO], gulp.series('js', 'sw'));
        // index.html wymaga pełnego `inject` – to on wstawia znaczniki css/js.
        gulp.watch([paths.srcIndex], gulp.series('inject', 'sw'));
    })
);

gulp.task(
    'watch-sync',
    gulp.series(gulp.parallel('browser-sync'), function () {
        // Każdy watcher kończy się zadaniem `sw`: hash w CACHE_VERSION liczy się
        // z plików ze STATIC_FILES, więc bez tego service worker trzymałby w dewie
        // starą wersję cache'u mimo przebudowanych zasobów.
        gulp.watch([paths.srcTemplates], gulp.series('htmlWatch', 'sw'));
        gulp.watch([paths.srcSCSSs], gulp.series('css', 'sw'));
        // sharedSEO leży poza src/js, a trafia do tego samego bundla.
        gulp.watch([paths.srcJS, paths.sharedSEO], gulp.series('js', 'sw'));
        // index.html wymaga pełnego `inject` – to on wstawia znaczniki css/js.
        gulp.watch([paths.srcIndex], gulp.series('inject', 'sw'));
    })
);

gulp.task(
    'default',
    gulp.series(gulp.parallel('images', 'jsLib', 'idbLib', 'inject'), 'sw')
);

gulp.task('clean', function () {
    del([
        paths.publicIndex,
        paths.publicHTML,
        paths.publicCSS,
        paths.publicJS,
        paths.publicIMAGES,
        paths.publicSW
    ]);
});
