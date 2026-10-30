import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as rspack from '@rspack/core'
import { VueLoaderPlugin } from 'rspack-vue-loader'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const PROXY_TARGET = process.env.RSPACK_PROXY_TARGET || 'http://192.168.33.8:8089'
const PROXY_ROUTES = [
  '/ocr',
  '/det',
  '/slide_match',
  '/slide_comparison',
  '/status',
  '/docs',
  '/docs.json',
  '/mcp',
]

export default {
  mode: process.env.NODE_ENV === 'development' ? 'development' : 'production',
  entry: './src/main.js',
  output: {
    path: path.resolve(__dirname, '../static'),
    filename: 'assets/[name].[contenthash:8].js',
    clean: true,
    publicPath: '/',
  },
  resolve: {
    extensions: ['.js', '.vue'],
  },
  optimization: {
    // 固定 module id 產生方式，讓相同原始碼在多台機器上產出一致的 contenthash
    moduleIds: 'deterministic',
  },
  module: {
    rules: [
      {
        test: /\.vue$/,
        loader: 'rspack-vue-loader',
        options: { experimentalInlineMatchResource: true },
      },
      {
        test: /\.css$/,
        type: 'css',
      },
    ],
  },
  plugins: [
    new rspack.HtmlRspackPlugin({
      template: './index.html',
    }),
    new VueLoaderPlugin(),
  ],
  devServer: {
    port: 5173,
    historyApiFallback: true,
    proxy: PROXY_ROUTES.map((route) => ({
      context: [route],
      target: PROXY_TARGET,
      changeOrigin: true,
    })),
  },
}
