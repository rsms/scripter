// const HtmlWebpackInlineSourcePlugin = require('html-webpack-inline-source-plugin')
const webpack = require('webpack')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')
const TerserJSPlugin = require('terser-webpack-plugin')
const OptimizeCSSAssetsPlugin = require('optimize-css-assets-webpack-plugin')
const CopyPlugin = require('copy-webpack-plugin')
const path = require('path')
const monacoVersion = require('../monaco/monaco-editor/package.json').version
const uglify = require("uglify-es")

const builddir = path.normalize(path.join(__dirname, "..", "..", "build"))
const BUILD_VERSION = Date.now().toString(36)
const SOURCE_MAP_VERSION = require("../../node_modules/source-map/package.json").version

module.exports = (env, argv) => {

const mode = argv.mode == 'production' ? 'production' : 'development'
const isDevMode = mode == 'development'
const outdir = path.join(builddir, isDevMode ? "dev" : "release")

return {
  mode,

  // This is necessary because Figma's 'eval' works differently than normal eval
  devtool: isDevMode ? 'inline-source-map' : false,

  entry: {
    app: "./app.ts",
    resources: "./resources.ts",
  },

  // Webpack tries these extensions for you if you omit the extension like "import './file'"
  resolve: { extensions: ['.tsx', '.ts', '.jsx', '.js'] },

  output: {
    filename: isDevMode ? '[name].js' : '[name].[hash].js',
    path: outdir,
  },

  externals: {
    "../monaco/monaco": "monaco",
    "./resources": "__resources",
  },

  module: {
    rules: [
      // TypeScript -> JavaScript
      { test: /\.tsx?$/, use: 'ts-loader', exclude: /node_modules|monaco-ambient/ },

      // Allows you to use "<%= require('./file.svg') %>" in your HTML code to get a data URI.
      // In CSS simply use url("./file.svg").
      { test: /\.(png|jpg|gif|webp|svg)$/, use: [{ loader: 'url-loader' }] },

      // Enables including CSS by doing "import './file.css'" in your TypeScript code
      // { test: /\.css$/, loader: [{ loader: 'style-loader' }, { loader: 'css-loader' }] },
      // { test: /\.css$/, loader: [{ loader: 'css-loader' }] },

      // {
      //   test: /\.css$/,
      //   use: [
      //     {
      //       loader: MiniCssExtractPlugin.loader,
      //       options: {
      //         // only enable hot in development
      //         hmr: process.env.NODE_ENV === 'development',
      //         // if hmr does not work, this is a forceful method.
      //         reloadAll: true,
      //       },
      //     },
      //     'css-loader',
      //   ],
      // },

      { // CSS loader for Monaco (and other libraries with CSS)
        test: /\.css$/,
        include: /node_modules/,
        use: [
          { loader: MiniCssExtractPlugin.loader },
          'css-loader',
        ],
      },

      { // CSS loader for main stuff
        test: /\.css$/,
        exclude: /node_modules/,
        use: [
          { loader: MiniCssExtractPlugin.loader, options: {
            hmr: isDevMode,
          }},

          { loader: 'css-loader', options: {
            importLoaders: 1,
          }},

          { loader: 'postcss-loader', options: {
            sourceMap: isDevMode ? 'inline' : false,
            plugins: [
              require('autoprefixer'),
              require('postcss-import'),
              require('postcss-preset-env')({
                browsers: 'last 2 versions',
                features: {
                  'nesting-rules': true
                },
              }),
            ].concat(isDevMode ? [] : [
              // plugins only active for mode=production
              require('cssnano'),
            ]),
          }},

        ]
      }

    ],
  },

  // see https://github.com/webpack-contrib/mini-css-extract-plugin#minimizing-for-production
  optimization: isDevMode ? {} : {
    minimizer: [
      new TerserJSPlugin({
        cache: path.join(builddir, '.terser-cache'),
        parallel: true,
      }),
      new OptimizeCSSAssetsPlugin({}),
    ],
  },

  plugins: [

    new webpack.DefinePlugin({
      DEBUG: isDevMode ? "true" : "false",
      BUILD_VERSION: JSON.stringify(BUILD_VERSION),
      SOURCE_MAP_VERSION: JSON.stringify(SOURCE_MAP_VERSION),
    }),

    new CopyPlugin([
      { from: 'figma-*.d.ts', to: outdir + "/" },
      { from: '../common/scripter-env.d.ts', to: outdir + "/" },
      { from: '../../node_modules/source-map/lib/mappings.wasm',
          to: `${outdir}/source-map-${SOURCE_MAP_VERSION}-mappings.wasm`, toType: "file" },
      // { from: '../common/scripter-env.js', to: outdir + "/", transform(data, path) {
      //   let r = uglify.minify({[path]: data.toString("utf8")}, {
      //     ecma:  6,
      //     warnings: true,
      //     compress: {
      //       dead_code: true,
      //       global_defs: { DEBUG: isDevMode },
      //     },
      //     mangle: true,
      //     output: {
      //       beautify: isDevMode,
      //       safari10: false,
      //       ast: false,
      //       code: true,
      //       ecma: 6,
      //     },
      //   })
      //   if (r.error) {
      //     let err = r.error
      //     if (err.line !== undefined) {
      //       err.message = `${err.filename || err.file}:${err.line}:${err.col} ${r.message}`
      //     }
      //     throw err
      //   }
      //   return Buffer.from(r.code, "utf8")
      //   // return content
      // } },
    ]),

    new MiniCssExtractPlugin({
      filename:      isDevMode ? '[name].css' : '[name].[hash].css',
      chunkFilename: isDevMode ? '[id].css'   : '[id].[hash].css',
      ignoreOrder:   false,
    }),

    new HtmlWebpackPlugin({
      template: './index.html',
      templateParameters: {
        "MONACO_VERSION": monacoVersion,
        BUILD_VERSION,
      },
      filename: 'index.html',
      // chunks: ['app'],
    }),

    new webpack.optimize.LimitChunkCountPlugin({ maxChunks: 1 }),
  ],
}}
