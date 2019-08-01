const HTMLWebpackPlugin = require('html-webpack-plugin');
const {CleanWebpackPlugin} = require('clean-webpack-plugin');
const WriteFilePlugin = require('write-file-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const WebpackOnBuildPlugin = require('on-build-webpack');
const WebappWebpackPlugin = require('webapp-webpack-plugin');
const Jimp = require('jimp');
const fs = require('fs-extra');
const zipFolder = require('zip-folder');
const path = require('path');
const outputPath = path.resolve(__dirname, 'dist')
const style  = {
  colors: {
    primary: '#0074d9',
    secondary: '#ce0cb7',
  },
};

module.exports = {
  devtool: 'source-map',
  entry: {
    popup: './src/js/popup.js',
    options: './src/js/options.js',
    background: './src/js/background.js',
    inject: './src/js/inject.js',
  },
  devServer: {
    compress: true,
    port: 4000,
    host: 'localhost',
    headers: {'Access-Control-Allow-Origin': '*'},
    hot: true,
    historyApiFallback: true,
  },
  mode: 'production',
  output: {
    path: outputPath,
    filename: '[name].bundle.js',
    // sourceMapFilename: `${outputPattern}.bundle.js.map`,
    // publicPath: vars.publicPath || '/',
    // libraryTarget: vars.libraryTarget || 'var',
  },
  plugins: [
    new CleanWebpackPlugin(),
    new WebpackOnBuildPlugin(async function(stats) {
      await new Promise(function(resolve, reject) {
        Jimp.read(`${outputPath}/icons/android-chrome-96x96.png`, function(err, img) {
          if (err) return reject(err);
          new Jimp(128, 128, function(err, out) {
            if (err) return reject(err);
            out.composite(img, 16, 16)
            .write(`${outputPath}/chrome-ext-128x128.png`, function(err, img) {
              if (err) return reject(err);
              resolve();
            });
          });
        });
      });
      await fs.move(`${outputPath}/icons/favicon-32x32.png`, `${outputPath}/favicon-32x32.png`);
      await fs.remove(`${outputPath}/icons`);
      await new Promise(function(resolve, reject) {
        zipFolder(outputPath, `${outputPath}.zip`, function(err) {
          if(err) return reject(err);
          resolve();
        });
      });
    }),
    new CopyWebpackPlugin([{
      from: 'src/manifest.json',
      transform: function(content, path) {
        return Buffer.from(JSON.stringify({
          version: process.env.npm_package_version,
          ...JSON.parse(content.toString()),
        }));
      },
    },
    {
      from: 'src/_locales',
      to: '_locales/',
    },
    ]),
    new HTMLWebpackPlugin({
      template: './src/popup.html',
      filename: 'popup.html',
      chunks: ['popup'],
    }),
    new HTMLWebpackPlugin({
      template: './src/options.html',
      filename: 'options.html',
      chunks: ['options'],
    }),
    new HTMLWebpackPlugin({
      template: './src/background.html',
      filename: 'background.html',
      chunks: ['background'],
    }),
    new WebappWebpackPlugin({
      logo: `svg-fill-loader!./src/logo.svg?fill=${style.colors.primary}`,
      prefix: 'icons/',
      inject: 'none',
    }),
    new WriteFilePlugin(),
  ],
};
