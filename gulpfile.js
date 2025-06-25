/* Copyright 2016 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/* eslint-env node */

import * as builder from "./external/builder/builder.mjs";
import { exec} from "child_process";
import autoprefixer from "autoprefixer";
import crypto from "crypto";
import { fileURLToPath } from "url";
import fs from "fs";
import gulp from "gulp";
import merge from "merge-stream";
import { mkdirp } from "mkdirp";
import path from "path";
import postcss from "gulp-postcss";
import postcssDirPseudoClass from "postcss-dir-pseudo-class";
import postcssNesting from "postcss-nesting";
import replace from "gulp-replace";
import rimraf from "rimraf";
import stream from "stream";
import Vinyl from "vinyl";
import webpack2 from "webpack";
import webpackStream from "webpack-stream";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BUILD_DIR = "build/";
const L10N_DIR = "l10n/";
const GENERIC_LEGACY_DIR = BUILD_DIR + "generic-legacy/";
const DEFAULT_PREFERENCES_DIR = BUILD_DIR + "default_preferences/";
const TMP_DIR = BUILD_DIR + "tmp/";
const COMMON_WEB_FILES = [
  "web/images/*.{png,svg,gif}",
  "web/debugger.{css,js}",
];

const CONFIG_FILE = "pdfjs.config";
const config = JSON.parse(fs.readFileSync(CONFIG_FILE).toString());

const ENV_TARGETS = [
  "last 2 versions",
  "Chrome >= 92",
  "Firefox ESR",
  "Safari >= 15.4",
  "Node >= 18",
  "> 1%",
  "not IE > 0",
  "not dead",
];

// Default Autoprefixer config used for generic, components, minified-pre
const AUTOPREFIXER_CONFIG = {
  overrideBrowserslist: ENV_TARGETS,
};
// Default Babel targets used for generic, components, minified-pre
const BABEL_TARGETS = ENV_TARGETS.join(", ");

const DEFINES = Object.freeze({
  SKIP_BABEL: true,
  TESTING: undefined,
  // The main build targets:
  GENERIC: false,
  MOZCENTRAL: false,
  GECKOVIEW: false,
  CHROME: false,
  MINIFIED: false,
  COMPONENTS: false,
  LIB: false,
  IMAGE_DECODERS: false,
});


function createStringSource(filename, content) {
  const source = stream.Readable({ objectMode: true });
  source._read = function () {
    this.push(
      new Vinyl({
        path: filename,
        contents: Buffer.from(content),
      })
    );
    this.push(null);
  };
  return source;
}

function createWebpackConfig(
  defines,
  output,
  {
    disableVersionInfo = false,
    disableSourceMaps = false,
    disableLicenseHeader = false,
    defaultPreferencesDir = null,
  } = {}
) {
  const versionInfo = !disableVersionInfo
    ? getVersionJSON()
    : { version: 0, commit: 0 };
  const bundleDefines = {...defines,
    BUNDLE_VERSION: versionInfo.version,
    BUNDLE_BUILD: versionInfo.commit,
    TESTING: defines.TESTING ?? process.env.TESTING === "true",
    DEFAULT_PREFERENCES: defaultPreferencesDir
      ? getDefaultPreferences(defaultPreferencesDir)
      : {},
  };
  const licenseHeaderLibre = fs
    .readFileSync("./src/license_header_libre.js")
    .toString();
  const enableSourceMaps =
    !bundleDefines.MOZCENTRAL &&
    !bundleDefines.CHROME &&
    !bundleDefines.LIB &&
    !bundleDefines.TESTING &&
    !disableSourceMaps;
  const skipBabel = bundleDefines.SKIP_BABEL;

  // `core-js`, see https://github.com/zloirock/core-js/issues/514,
  // should be excluded from processing.
  const babelExcludes = ["node_modules[\\\\\\/]core-js"];
  const babelExcludeRegExp = new RegExp(`(${babelExcludes.join("|")})`);

  const babelPresets = skipBabel
    ? undefined
    : [
      [
        "@babel/preset-env",
        { corejs: "3.32.2", shippedProposals: true, useBuiltIns: "usage" },
      ],
    ];
  const babelPlugins = ["@babel/plugin-transform-modules-commonjs"];

  const plugins = [];
  if (!disableLicenseHeader) {
    plugins.push(
      new webpack2.BannerPlugin({ banner: licenseHeaderLibre, raw: true })
    );
  }

  const experiments =
    output.library?.type === "module" ? { outputModule: true } : undefined;

  // Required to expose e.g., the `window` object.
  output.globalObject = "globalThis";

  const basicAlias = {
    pdfjs: "src",
    "pdfjs-web": "web",
    "pdfjs-lib": "web/pdfjs",
  };
  const libraryAlias = {
    "display-fetch_stream": "src/display/stubs.js",
    "display-l10n_utils": "src/display/stubs.js",
    "display-network": "src/display/stubs.js",
    "display-node_stream": "src/display/stubs.js",
    "display-node_utils": "src/display/stubs.js",
    "display-svg": "src/display/stubs.js",
  };
  const viewerAlias = {
    "web-alt_text_manager": "web/alt_text_manager.js",
    "web-annotation_editor_params": "web/annotation_editor_params.js",
    "web-com": "",
    "web-pdf_attachment_viewer": "web/pdf_attachment_viewer.js",
    "web-pdf_cursor_tools": "web/pdf_cursor_tools.js",
    "web-pdf_document_properties": "web/pdf_document_properties.js",
    "web-pdf_find_bar": "web/pdf_find_bar.js",
    "web-pdf_layer_viewer": "web/pdf_layer_viewer.js",
    "web-pdf_outline_viewer": "web/pdf_outline_viewer.js",
    "web-pdf_presentation_mode": "web/pdf_presentation_mode.js",
    "web-pdf_sidebar": "web/pdf_sidebar.js",
    "web-pdf_thumbnail_viewer": "web/pdf_thumbnail_viewer.js",
    "web-print_service": "",
    "web-secondary_toolbar": "web/secondary_toolbar.js",
    "web-toolbar": "web/toolbar.js",
  };
  if (bundleDefines.CHROME) {
    libraryAlias["display-fetch_stream"] = "src/display/fetch_stream.js";
    libraryAlias["display-network"] = "src/display/network.js";

    viewerAlias["web-com"] = "web/chromecom.js";
    viewerAlias["web-print_service"] = "web/pdf_print_service.js";
  } else if (bundleDefines.GENERIC) {
    // Aliases defined here must also be replicated in the paths section of
    // the tsconfig.json file for the type generation to work.
    // In the tsconfig.json files, the .js extension must be omitted.
    libraryAlias["display-fetch_stream"] = "src/display/fetch_stream.js";
    libraryAlias["display-l10n_utils"] = "web/l10n_utils.js";
    libraryAlias["display-network"] = "src/display/network.js";
    libraryAlias["display-node_stream"] = "src/display/node_stream.js";
    libraryAlias["display-node_utils"] = "src/display/node_utils.js";
    libraryAlias["display-svg"] = "src/display/svg.js";

    viewerAlias["web-com"] = "web/genericcom.js";
    viewerAlias["web-print_service"] = "web/pdf_print_service.js";
  } else if (bundleDefines.MOZCENTRAL) {
    if (bundleDefines.GECKOVIEW) {
      const gvAlias = {
        "web-toolbar": "web/toolbar-geckoview.js",
      };
      for (const key in viewerAlias) {
        viewerAlias[key] = gvAlias[key] || "web/stubs-geckoview.js";
      }
    }
    viewerAlias["web-com"] = "web/firefoxcom.js";
    viewerAlias["web-print_service"] = "web/firefox_print_service.js";
  }
  const alias = { ...basicAlias, ...libraryAlias, ...viewerAlias };
  for (const key in alias) {
    alias[key] = path.join(__dirname, alias[key]);
  }

  return {
    mode: "none",
    experiments,
    output,
    performance: {
      hints: false, // Disable messages about larger file sizes.
    },
    plugins,
    resolve: {
      alias,
    },
    devtool: enableSourceMaps ? "source-map" : undefined,
    module: {
      rules: [
        {
          loader: "babel-loader",
          exclude: babelExcludeRegExp,
          options: {
            presets: babelPresets,
            plugins: babelPlugins,
            targets: BABEL_TARGETS,
          },
        },
        {
          loader: path.join(__dirname, "external/webpack/pdfjsdev-loader.mjs"),
          options: {
            rootPath: __dirname,
            saveComments: false,
            defines: bundleDefines,
          },
        },
      ],
    },
    // Avoid shadowing actual Node.js variables with polyfills, by disabling
    // polyfills/mocks - https://webpack.js.org/configuration/node/
    node: false,
  };
}

function webpack2Stream(webpackConfig) {
  // Replacing webpack1 to webpack2 in the webpack-stream.
  return webpackStream(webpackConfig, webpack2);
}

function getVersionJSON() {
  return JSON.parse(fs.readFileSync(BUILD_DIR + "version.json").toString());
}

function replaceWebpackRequire() {
  // Produced bundles can be rebundled again, avoid collisions (e.g. in api.js)
  // by renaming  __webpack_require__ to something else.
  return replace("__webpack_require__", "__w_pdfjs_require__");
}

function replaceNonWebpackImport() {
  return replace("__non_webpack_import__", "import");
}

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

function createMainBundle(defines) {
  const mainAMDName = "pdfjs-dist/build/pdf";
  const mainOutputName = "pdf.js";

  const mainFileConfig = createWebpackConfig(defines, {
    filename: mainOutputName,
    library: mainAMDName,
    libraryTarget: "umd",
    umdNamedDefine: true,
  });
  return gulp
    .src("./src/pdf.js")
    .pipe(webpack2Stream(mainFileConfig))
    .pipe(replaceWebpackRequire())
    .pipe(replaceNonWebpackImport())
    .pipe(addGlobalExports(mainAMDName, "pdfjsLib"));
}

function createScriptingBundle(defines, extraOptions = undefined) {
  const scriptingAMDName = "pdfjs-dist/build/pdf.scripting";
  const scriptingOutputName = "pdf.scripting.js";

  const scriptingFileConfig = createWebpackConfig(
    defines,
    {
      filename: scriptingOutputName,
      library: scriptingAMDName,
      libraryTarget: "umd",
      umdNamedDefine: true,
    },
    extraOptions
  );
  return gulp
    .src("./src/pdf.scripting.js")
    .pipe(webpack2Stream(scriptingFileConfig))
    .pipe(replaceWebpackRequire())
    .pipe(replaceNonWebpackImport())
    .pipe(addGlobalExports(scriptingAMDName, "pdfjsScripting"));
}

function createTemporaryScriptingBundle(defines, extraOptions = undefined) {
  return createScriptingBundle(defines, {
    disableVersionInfo: !!(extraOptions && extraOptions.disableVersionInfo),
    disableSourceMaps: true,
    disableLicenseHeader: true,
  }).pipe(gulp.dest(TMP_DIR));
}

function createSandboxBundle(defines, extraOptions = undefined) {
  const sandboxAMDName = "pdfjs-dist/build/pdf.sandbox";
  const sandboxOutputName = "pdf.sandbox.js";

  const scriptingPath = TMP_DIR + "pdf.scripting.js";
  // Insert the source as a string to be `eval`-ed in the sandbox.
  const sandboxDefines = builder.merge(defines, {
    PDF_SCRIPTING_JS_SOURCE: fs.readFileSync(scriptingPath).toString(),
  });
  fs.unlinkSync(scriptingPath);

  const sandboxFileConfig = createWebpackConfig(
    sandboxDefines,
    {
      filename: sandboxOutputName,
      library: sandboxAMDName,
      libraryTarget: "umd",
      umdNamedDefine: true,
    },
    extraOptions
  );

  return gulp
    .src("./src/pdf.sandbox.js")
    .pipe(webpack2Stream(sandboxFileConfig))
    .pipe(replaceWebpackRequire())
    .pipe(replaceNonWebpackImport())
    .pipe(addGlobalExports(sandboxAMDName, "pdfjsSandbox"));
}

function createWorkerBundle(defines) {
  const workerAMDName = "pdfjs-dist/build/pdf.worker";
  const workerOutputName = "pdf.worker.js";

  const workerFileConfig = createWebpackConfig(defines, {
    filename: workerOutputName,
    library: workerAMDName,
    libraryTarget: "umd",
    umdNamedDefine: true,
  });
  return gulp
    .src("./src/pdf.worker.js")
    .pipe(webpack2Stream(workerFileConfig))
    .pipe(replaceWebpackRequire())
    .pipe(replaceNonWebpackImport())
    .pipe(addGlobalExports(workerAMDName, "pdfjsWorker"));
}

function createWebBundle(defines, options) {
  const viewerOutputName = "viewer.js";

  const viewerFileConfig = createWebpackConfig(
    defines,
    {
      filename: viewerOutputName,
    },
    {
      defaultPreferencesDir: options.defaultPreferencesDir,
    }
  );
  return gulp
    .src("./web/viewer.js")
    .pipe(webpack2Stream(viewerFileConfig))
    .pipe(replaceNonWebpackImport());
}

function createCMapBundle() {
  return gulp.src(["external/bcmaps/*.bcmap", "external/bcmaps/LICENSE"], {
    base: "external/bcmaps",
  });
}

function createStandardFontBundle() {
  return gulp.src(
    [
      "external/standard_fonts/*.pfb",
      "external/standard_fonts/*.ttf",
      "external/standard_fonts/LICENSE_FOXIT",
      "external/standard_fonts/LICENSE_LIBERATION",
    ],
    {
      base: "external/standard_fonts",
    }
  );
}

function checkFile(filePath) {
  try {
    const stat = fs.lstatSync(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

function checkDir(dirPath) {
  try {
    const stat = fs.lstatSync(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}


function getTempFile(prefix, suffix) {
  mkdirp.sync(BUILD_DIR + "tmp/");
  const bytes = crypto.randomBytes(6).toString("hex");
  const filePath = BUILD_DIR + "tmp/" + prefix + bytes + suffix;
  fs.writeFileSync(filePath, "");
  return filePath;
}

function createBuildNumber(done) {
  console.log();
  console.log("### Getting extension build number");

  exec(
    "git log --format=oneline " + config.baseVersion + "..",
    function (err, stdout, stderr) {
      let buildNumber = 0;
      if (!err) {
        // Build number is the number of commits since base version
        buildNumber = stdout ? stdout.match(/\n/g).length : 0;
      } else {
        console.log(
          "This is not a Git repository; using default build number."
        );
      }

      console.log("Extension build number: " + buildNumber);

      const version = config.versionPrefix + buildNumber;

      exec('git log --format="%h" -n 1', function (err2, stdout2, stderr2) {
        let buildCommit = "";
        if (!err2) {
          buildCommit = stdout2.replace("\n", "");
        }

        createStringSource(
          "version.json",
          JSON.stringify(
            {
              version,
              build: buildNumber,
              commit: buildCommit,
            },
            null,
            2
          )
        )
          .pipe(gulp.dest(BUILD_DIR))
          .on("end", done);
      });
    }
  );
}

function buildDefaultPreferences(defines, dir) {
  console.log();
  console.log("### Building default preferences");

  const bundleDefines = {...defines,
    LIB: true,
    TESTING: defines.TESTING ?? process.env.TESTING === "true",
  };

  const defaultPreferencesConfig = createWebpackConfig(
    bundleDefines,
    {
      filename: "app_options.mjs",
      library: {
        type: "module",
      },
    },
    {
      disableVersionInfo: true,
    }
  );
  return gulp
    .src("web/app_options.js")
    .pipe(webpack2Stream(defaultPreferencesConfig))
    .pipe(gulp.dest(DEFAULT_PREFERENCES_DIR + dir));
}

async function parseDefaultPreferences(dir) {
  console.log();
  console.log("### Parsing default preferences");

  // eslint-disable-next-line no-unsanitized/method
  const { AppOptions, OptionKind } = await import(
  "./" + DEFAULT_PREFERENCES_DIR + dir + "app_options.mjs"
    );

  const prefs = AppOptions.getAll(OptionKind.PREFERENCE);
  if (Object.keys(prefs).length === 0) {
    throw new Error("No default preferences found.");
  }

  fs.writeFileSync(
    DEFAULT_PREFERENCES_DIR + dir + "default_preferences.json",
    JSON.stringify(prefs)
  );
}

function getDefaultPreferences(dir) {
  const str = fs
    .readFileSync(DEFAULT_PREFERENCES_DIR + dir + "default_preferences.json")
    .toString();
  return JSON.parse(str);
}

gulp.task("locale", function () {
  const VIEWER_LOCALE_OUTPUT = "web/locale/";

  console.log();
  console.log("### Building localization files");

  rimraf.sync(VIEWER_LOCALE_OUTPUT);
  mkdirp.sync(VIEWER_LOCALE_OUTPUT);

  const subfolders = fs.readdirSync(L10N_DIR);
  subfolders.sort();
  let viewerOutput = "";
  const locales = [];
  for (const locale of subfolders) {
    const dirPath = L10N_DIR + locale;
    if (!checkDir(dirPath)) {
      continue;
    }
    if (!/^[a-z][a-z]([a-z])?(-[A-Z][A-Z])?$/.test(locale)) {
      console.log("Skipping invalid locale: " + locale);
      continue;
    }

    mkdirp.sync(VIEWER_LOCALE_OUTPUT + "/" + locale);

    locales.push(locale);

    if (checkFile(dirPath + "/viewer.properties")) {
      viewerOutput +=
        "[" +
        locale +
        "]\n" +
        "@import url(" +
        locale +
        "/viewer.properties)\n\n";
    }
  }

  return merge([
    createStringSource("locale.properties", viewerOutput).pipe(
      gulp.dest(VIEWER_LOCALE_OUTPUT)
    ),
    gulp
      .src(L10N_DIR + "/{" + locales.join(",") + "}/viewer.properties", {
        base: L10N_DIR,
      })
      .pipe(gulp.dest(VIEWER_LOCALE_OUTPUT)),
  ]);
});

function preprocessCSS(source, defines) {
  const outName = getTempFile("~preprocess", ".css");
  builder.preprocess(source, outName, defines);
  let out = fs.readFileSync(outName).toString();
  fs.unlinkSync(outName);

  // Strip out all license headers in the middle.
  const reg = /\n\/\* Copyright(.|\n)*?Mozilla Foundation(.|\n)*?\*\//g;
  out = out.replaceAll(reg, "");

  const i = source.lastIndexOf("/");
  return createStringSource(source.substr(i + 1), out);
}

function preprocessHTML(source, defines) {
  const outName = getTempFile("~preprocess", ".html");
  builder.preprocess(source, outName, defines);
  const out = fs.readFileSync(outName).toString();
  fs.unlinkSync(outName);

  const i = source.lastIndexOf("/");
  return createStringSource(source.substr(i + 1), `${out.trimEnd()}\n`);
}

function buildGeneric(defines, dir) {
  rimraf.sync(dir);

  return merge([
    createMainBundle(defines).pipe(gulp.dest(dir + "build")),
    createWorkerBundle(defines).pipe(gulp.dest(dir + "build")),
    createSandboxBundle(defines).pipe(gulp.dest(dir + "build")),
    createWebBundle(defines, {
      defaultPreferencesDir: defines.SKIP_BABEL
        ? "generic/"
        : "generic-legacy/",
    }).pipe(gulp.dest(dir + "web")),
    gulp.src(COMMON_WEB_FILES, { base: "web/" }).pipe(gulp.dest(dir + "web")),
    gulp.src("LICENSE").pipe(gulp.dest(dir)),
    gulp
      .src(["web/locale/*/viewer.properties", "web/locale/locale.properties"], {
        base: "web/",
      })
      .pipe(gulp.dest(dir + "web")),
    createCMapBundle().pipe(gulp.dest(dir + "web/cmaps")),
    createStandardFontBundle().pipe(gulp.dest(dir + "web/standard_fonts")),

    preprocessHTML("web/viewer.html", defines).pipe(gulp.dest(dir + "web")),
    preprocessCSS("web/viewer.css", defines)
      .pipe(
        postcss([
          postcssDirPseudoClass(),
          postcssNesting(),
          autoprefixer(AUTOPREFIXER_CONFIG),
        ])
      )
      .pipe(gulp.dest(dir + "web")),

    gulp
      .src("web/compressed.tracemonkey-pldi-09.pdf")
      .pipe(gulp.dest(dir + "web")),
  ]);
}

// Builds the generic production viewer that should be compatible with most
// older HTML5 browsers.
gulp.task(
  "generic-legacy",
  gulp.series(
    createBuildNumber,
    "locale",
    function scriptingGenericLegacy() {
      const defines ={ ...DEFINES, GENERIC: true, SKIP_BABEL: false }
      return merge([
        buildDefaultPreferences(defines, "generic-legacy/"),
        createTemporaryScriptingBundle(defines),
      ]);
    },
    async function prefsGenericLegacy() {
      await parseDefaultPreferences("generic-legacy/");
    },
    function createGenericLegacy() {
      console.log();
      console.log("### Creating generic (legacy) viewer");
      const defines = { ...DEFINES, GENERIC: true, SKIP_BABEL: false };

      return buildGeneric(defines, GENERIC_LEGACY_DIR);
    }
  )
);
