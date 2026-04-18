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
    // nodemon = require('gulp-nodemon'),
    del = require('del');

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
    gulp.series(gulp.parallel('images', 'jsLib', 'idbLib', 'inject'))
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
