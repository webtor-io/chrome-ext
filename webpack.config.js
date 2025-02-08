const HTMLWebpackPlugin = require('html-webpack-plugin');
const {CleanWebpackPlugin} = require('clean-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const fs = require('fs-extra');
const archiver = require('archiver');
const path = require('path');
const outputPath = path.resolve(__dirname, 'dist')
const sharp = require('sharp')
const webpack = require('webpack');

function resize(path, width, height) {
  return new Promise((resolve, reject) => {
    sharp('./src/images/logo.svg')
      .resize(width, height)
      .toFile(`${outputPath}/favicon-${width}x${height}.png`, function(err) {
        if (err !== null) {
          reject(err);
        } else {
          resolve();
        }
      });
  });
}

module.exports = {
  devtool: 'source-map',
  entry: {
    popup: './src/js/popup.js',
    background: './src/js/background.js',
    inject: './src/js/inject.js',
  },
  mode: 'production',
  output: {
    path: outputPath,
    filename: '[name].bundle.js',
  },
  plugins: [
    new CleanWebpackPlugin(),
    new webpack.DefinePlugin({
      VERSION: JSON.stringify(require('./package.json').version)
    }),
    {
      apply: (compiler) => {
        compiler.hooks.afterEmit.tap('ProcessIconsPlugin', async (compilation) => {
          const logo = './src/images/logo.svg';
          const sizes = [16, 32, 48, 128];
          for (const size of sizes) {
            await resize(logo, size, size);
          }
        });
      }
    },
    {
      apply: (compiler) => {
        compiler.hooks.afterEmit.tap('ProcessArchivePlugin', async (compilation) => {
            await new Promise(function(resolve, reject) {
              const output = fs.createWriteStream(`${outputPath}.zip`);
              const archive = archiver('zip');
              output.on('close', resolve);
              archive.on('error', reject);
              archive.pipe(output);
              archive.directory(outputPath, false);
              archive.finalize();
            });
        });
      }
    },
    new CopyWebpackPlugin({
      patterns: [
        {
          from: 'src/manifest.json',
          transform: (content, path) => {
            return Buffer.from(
                JSON.stringify({
                  version: process.env.npm_package_version,
                  ...JSON.parse(content.toString()),
                })
            );
          },
        },
        {
          from: 'src/_locales',
          to: '_locales/',
        },
      ],
    }),
    new HTMLWebpackPlugin({
      template: './src/popup.html',
      filename: 'popup.html',
      chunks: ['popup'],
    }),
    new HTMLWebpackPlugin({
      template: './src/background.html',
      filename: 'background.html',
      chunks: ['background'],
    }),
  ],
};
