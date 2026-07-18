// Post-build precompile step for the storefront.
//
// The source index.html ships a ~2 KLOC app inside a single
// <script type="text/babel"> block, transpiled IN THE BROWSER by
// @babel/standalone (~3 MB) against React *development* builds. First
// paint waits on a 3 MB download + a full client-side JSX transpile,
// giving ~3.8 s cold FCP.
//
// This step transpiles that JSX ahead-of-time with esbuild, emits a
// static assets/app.js, and rewrites dist/index.html to:
//   - drop @babel/standalone entirely,
//   - use React / ReactDOM *production* builds,
//   - load the precompiled app via <script defer>.
//
// The app uses the classic JSX runtime (global React.createElement) and
// global ReactDOM / supabase, so no bundling is needed — a plain
// transform preserves identical runtime semantics.
import esbuild from 'esbuild'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const distHtml = resolve(root, 'dist/index.html')
const appOut = resolve(root, 'dist/assets/app.js')

let html = readFileSync(distHtml, 'utf8')

// 1. Extract the inline babel app.
const m = html.match(/<script type="text\/babel">([\s\S]*?)<\/script>/)
if (!m) { console.error('precompile: no <script type="text/babel"> block found'); process.exit(1) }
const jsx = m[1]

// 2. Transpile JSX -> JS (classic runtime -> global React), minify.
const { code } = esbuild.transformSync(jsx, {
  loader: 'jsx', jsx: 'transform', minify: true, target: 'es2018', charset: 'utf8',
})

mkdirSync(dirname(appOut), { recursive: true })
writeFileSync(appOut, code, 'utf8')

// 3. Rewrite index.html.
html = html
  // Drop the in-browser transpiler entirely.
  .replace(/\s*<script[^>]*@babel\/standalone[^>]*><\/script>/, '')
  // Dev -> production React builds.
  .replace('react@18.3.1/umd/react.development.js', 'react@18.3.1/umd/react.production.min.js')
  .replace('react-dom@18.3.1/umd/react-dom.development.js', 'react-dom@18.3.1/umd/react-dom.production.min.js')
  // Integrity hashes no longer match the prod files — strip them.
  .replace(/\s+integrity="[^"]*"/g, '')
  // Swap the inline app for the precompiled bundle.
  .replace(/<script type="text\/babel">[\s\S]*?<\/script>/, '<script defer src="./assets/app.js"></script>')

writeFileSync(distHtml, html, 'utf8')

const kb = (n) => (n / 1024).toFixed(1) + ' KB'
console.log(`precompile: app.js ${kb(code.length)} | index.html ${kb(html.length)} | @babel/standalone removed, React prod builds`)
