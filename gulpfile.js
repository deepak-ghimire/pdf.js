const webpack_stream = require('webpack-stream');


let replace = require('gulp-replace');
let gulp = require('gulp');
const path = require('path');
// const __dirname = import.meta.dirname;

let src = gulp.src,
  dest = gulp.dest;
let alias = {};
const webpack_config = {
  mode: 'production',
  entry: {
    'generic-legacy/build/pdf': path.resolve(__dirname, 'src/', 'pdf.js'),
    'generic-legacy/build/pdf.worker': path.resolve(__dirname, 'src/', 'pdf.worker.js')
    // 'dflip-pro/js/dflip': path.resolve(__dirname, 'src/js/', 'dflip-pro.js'),
    // 'dflip-lite-js/js/dflip': path.resolve(__dirname, 'src/js/', 'dflip-lite-js.js'),
  },
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'build'),
    // filename: '[name].bundle.js'
  },

  resolve: {
    extensions: ['.js'],
    alias:{

    }
  },
  optimization: {
    // We do not want to minimize our code.
    minimize: false
  },
  target: ['web','es5'],
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        // use: {
        loader: "swc-loader",
      }
    ],
    noParse: /jquery|lodash/,
  }
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

for (const key in alias) {
  alias[key] = path.resolve(__dirname, alias[key]);
}
webpack_config.resolve.alias = alias;

gulp.task('webpack-prod', function () {
  return webpack_stream(webpack_config)
    // .pipe(replace("DV_VERSION", packageJson.version))
    .pipe(gulp.dest('build'));
});
