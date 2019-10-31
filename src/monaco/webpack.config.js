const origResolve = require.resolve
require.resolve = (path, options) => {
  console.log("resolve", path)
  return origResolve(path, options)
}
const webpack = require('webpack')
const MonacoWebpackPlugin = require('monaco-editor-webpack-plugin')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')
const TerserJSPlugin = require('terser-webpack-plugin')
const OptimizeCSSAssetsPlugin = require('optimize-css-assets-webpack-plugin')
const path = require('path')
const monacoVersion = require('./monaco-editor/package.json').version

const builddir = path.normalize(path.join(__dirname, "..", "..", "build"))

// Note: There're some strange-looking names in this webpack config since monaco
// uses external worker JS scripts, which are produced by MonacoWebpackPlugin,
// which in turn has some limitations on the paths produced. As you see outdirname
// being used in this config, it's all for making sure that monaco finds its
// worker scripts and that they are all in one place.
const outdirname = `monaco-${monacoVersion}`

module.exports = (env, argv) => {
const mode = argv.mode == 'production' ? 'production' : 'development'
const isDevMode = mode == 'development'
return {
  mode,
  devtool: false,
  entry: { monaco: "./monaco.js" },
  resolve: { extensions: ['.js'] },
  output: {
    filename: `${outdirname}/[name].js`,
    path: path.join(builddir, isDevMode ? "dev" : "release"),
  },
  module: {
    rules: [
      {
        test: /\.css$/,
        use: [
          { loader: MiniCssExtractPlugin.loader },
          'css-loader',
        ],
      },

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

    new MiniCssExtractPlugin({
      filename:      `${outdirname}/[name].css`,
      chunkFilename: `${outdirname}/[id].css`,
      ignoreOrder: false, // Enable to remove warnings about conflicting order
    }),

    new MonacoWebpackPlugin({
      languages: [ "typescript" ],
      output: outdirname,
      // TODO: slim things down by specifying only required features.
      // https://github.com/Microsoft/monaco-editor-webpack-plugin#options
    }),

    new webpack.optimize.LimitChunkCountPlugin({ maxChunks: 1 }),
    // new HtmlWebpackInlineSourcePlugin(),
  ],
}}
