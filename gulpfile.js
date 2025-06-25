const webpack2 = require("webpack");
const webpack_stream = require("webpack-stream");


let replace = require("gulp-replace");
let gulp = require("gulp");
const path = require("path");
const fs = require("fs");

// const __dirname = import.meta.dirname;

let src = gulp.src,
  dest = gulp.dest;

const licenseHeaderLibre = fs
  .readFileSync("./src/license_header_libre.js")
  .toString();


let alias = {};
const webpack_config = {
  mode: "none",
  experiments: undefined,

  // entry: {
  //   "generic-legacy/build/pdf": path.resolve(__dirname, "src/", "pdf.js"),
  //   "generic-legacy/build/pdf.worker": path.resolve(__dirname, "src/", "pdf.worker.js"),
  //   // 'dflip-pro/js/dflip': path.resolve(__dirname, 'src/js/', 'dflip-pro.js'),
  //   // 'dflip-lite-js/js/dflip': path.resolve(__dirname, 'src/js/', 'dflip-lite-js.js'),
  // },
  output: {
    filename: "[name].js",
    libraryTarget: "umd",
    umdNamedDefine: true,
    globalObject: "globalThis",

  },
  performance: { hints: false },
  plugins: [
    new webpack2.BannerPlugin({ banner: licenseHeaderLibre, raw: true }),
  ],
  resolve: {
    // extensions: [".js"],
    alias: {},
  },
  // optimization: {
  //   // We do not want to minimize our code.
  //   minimize: false,
  // },
  // target: ["web", "es5"],
  // devtool: 'source-map',
  module: {
    rules: [
      {
        loader: "babel-loader",
        exclude: /(node_modules[\\\/]core-js)/,
        options: {
          presets: [
            [
              "@babel/preset-env",
              {
                corejs: "3.32.2",
                shippedProposals: true,
                useBuiltIns: "usage",
              },
            ],
          ],
          plugins: ["@babel/plugin-transform-modules-commonjs"],
          targets: "last 2 versions, Chrome >= 92, Firefox ESR, Safari >= 15.4, Node >= 18, > 1%, not IE > 0, not dead",
        },
      }, {
        loader: path.join(__dirname, "external/webpack/pdfjsdev-loader.mjs"),
        options: {
          rootPath: __dirname,
          saveComments: false,
          defines: {
            SKIP_BABEL: false,
            TESTING: false,
            GENERIC: true,
            MOZCENTRAL: false,
            GECKOVIEW: false,
            CHROME: false,
            MINIFIED: false,
            COMPONENTS: false,
            LIB: false,
            IMAGE_DECODERS: false,
            BUNDLE_VERSION: "4.10.39",
            BUNDLE_BUILD: "f9bea397f",
            DEFAULT_PREFERENCES: {},
          },
        },
      },

    ],
    noParse: /jquery|lodash/,
  },
  node: false,
};

alias["display-cmap_reader_factory"] =
  "src/display/cmap_reader_factory.js";
alias["display-standard_fontdata_factory"] =
  "src/display/standard_fontdata_factory.js";
alias["display-wasm_factory"] = "src/display/wasm_factory.js";
alias["display-fetch_stream"] = "src/display/fetch_stream.js";
alias["display-network"] = "src/display/network.js";
alias["display-node_stream"] = "src/display/node_stream.js";
alias["display-node_utils"] = "src/display/node_utils.js";
alias["display-l10n_utils"] = "web/l10n_utils.js";
alias["display-svg"] = "src/display/svg.js";

for (const key in alias) {
  alias[key] = path.resolve(__dirname, alias[key]);
}
webpack_config.resolve.alias = alias;

function addGlobalExports(amdName, jsName) {
  const replacer = [
    `module\\.exports = factory\\(\\);`,
    `define\\("${amdName}", \\[\\], factory\\);`,
    `exports\\["${amdName}"\\] = factory\\(\\);`,
    `root\\["${amdName}"\\] = factory\\(\\);`,
  ];
  const regex = new RegExp(`(${replacer.join("|")})`, "gm");

  return replace(regex, match => {
    switch (match) {
      case `module.exports = factory();`:
        return `module.exports = root.${jsName} = factory();`;
      case `define("${amdName}", [], factory);`:
        return `define("${amdName}", [], () => { return (root.${jsName} = factory()); });`;
      case `exports["${amdName}"] = factory();`:
        return `exports["${amdName}"] = root.${jsName} = factory();`;
      case `root["${amdName}"] = factory();`:
        return `root["${amdName}"] = root.${jsName} = factory();`;
    }
    return match;
  });
}

function replaceNonWebpackImport() {
  return replace("__non_webpack_import__", "import");
}

function replaceWebpackRequire() {
  // Produced bundles can be rebundled again, avoid collisions (e.g. in api.js)
  // by renaming  __webpack_require__ to something else.
  return replace("__webpack_require__", "__w_pdfjs_require__");
}

gulp.task("webpack-prod", gulp.series(
  function MainBundle() {

    const mainAMDName = "pdfjs-dist/build/pdf";
    const mainOutputName = "pdf.js";

    webpack_config.output.filename = mainOutputName;
    webpack_config.output.library = mainAMDName;

    // console.log(webpack_config);
    return gulp
      .src("src/pdf.js")
      .pipe(webpack_stream(webpack_config))
      .pipe(replaceWebpackRequire())
      .pipe(replaceNonWebpackImport())
      // .pipe(replace("DV_VERSION", packageJson.version))
      .pipe(addGlobalExports(mainAMDName, "pdfjsLib"))
      .pipe(gulp.dest("build/generic-legacy/build"));
  },
  function WorkerBundle() {

    const mainAMDName = "pdfjs-dist/build/pdf-worker";
    const mainOutputName = "pdf.worker.js";

    webpack_config.output.filename = mainOutputName;
    webpack_config.output.library = mainAMDName;

    // console.log(webpack_config);
    return gulp
      .src("src/pdf.worker.js")
      .pipe(webpack_stream(webpack_config))
      .pipe(replaceWebpackRequire())
      .pipe(replaceNonWebpackImport())
      // .pipe(replace("DV_VERSION", packageJson.version))
      .pipe(addGlobalExports(mainAMDName, "pdfjsWorker"))
      .pipe(gulp.dest("build/generic-legacy/build"));
  },
));

gulp.task('watch-dev', gulp.series('webpack-prod', function watch_dev() {
  gulp.watch('src/**/*', gulp.series('webpack-prod'));
}));
