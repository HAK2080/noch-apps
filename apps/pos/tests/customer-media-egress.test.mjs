import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'
import { transformSync } from '../../storefront/node_modules/esbuild/lib/main.js'

const base = 'https://kxqjasdvoohiexedtfqw.supabase.co/storage/v1/object/public/product-images/'

test('photo cache shares simultaneous downloads and serves later visits offline', async () => {
  const code = await readFile(new URL('../../storefront/public/media-sw.js', import.meta.url), 'utf8')
  const handlers = {}
  const stored = new Map()
  const cache = {
    match: async req => stored.get(req.url)?.clone(),
    put: async (req, response) => stored.set(req.url, response),
    keys: async () => [...stored.keys()].map(url => new Request(url)),
    delete: async req => stored.delete(req.url),
  }
  let downloads = 0
  const context = vm.createContext({
    URL, Map,
    caches: { open: async () => cache },
    fetch: async () => { downloads += 1; return new Response('photo') },
    self: { addEventListener: (name, handler) => { handlers[name] = handler } },
  })
  vm.runInContext(code, context)
  const dispatch = (url, init) => {
    let result
    handlers.fetch({ request: new Request(url, init), respondWith: value => { result = value } })
    return result
  }
  const [first, second] = await Promise.all([
    dispatch(`${base}products/id/123-720.webp`),
    dispatch(`${base}products/id/123-720.webp`),
  ])
  assert.equal(await first.text(), 'photo')
  assert.equal(await second.text(), 'photo')
  assert.equal(downloads, 1)
  context.fetch = async () => { throw new Error('offline') }
  assert.equal(await (await dispatch(`${base}products/id/123-720.webp`)).text(), 'photo')
  assert.equal(downloads, 1)
  for (const url of [
    `${base}products/id/123.mp4`,
    'https://kxqjasdvoohiexedtfqw.supabase.co/rest/v1/pos_products',
    'https://kxqjasdvoohiexedtfqw.supabase.co/storage/v1/object/sign/private/receipt.png',
    'https://another-project.supabase.co/storage/v1/object/public/product-images/photo.webp',
  ]) assert.equal(dispatch(url), undefined)
  assert.equal(dispatch(`${base}photo.webp`, {headers: {range: 'bytes=0-100'}}), undefined)
})

function componentHarness(source, name, extras = {}) {
  const states = []
  let index = 0
  const context = vm.createContext({
    ...extras,
    navigator: {},
    React: { createElement: (type, props, ...children) => ({type, props: props || {}, children}) },
    useState: initial => {
      const slot = index++
      if (!(slot in states)) states[slot] = initial
      return [states[slot], value => { states[slot] = value }]
    },
  })
  vm.runInContext(transformSync(source, {loader: 'jsx'}).code, context)
  return props => { index = 0; return context[name](props) }
}

function find(node, type) {
  if (!node || typeof node !== 'object') return undefined
  if (node.type === type) return node
  return node.children?.flat(Infinity).map(child => find(child, type)).find(Boolean)
}

test('both deployed video components make zero video elements until tapped', async () => {
  const pos = await readFile(new URL('../src/pages/storefront/Menu.jsx', import.meta.url), 'utf8')
  const website = await readFile(new URL('../../storefront/index.html', import.meta.url), 'utf8')
  const samples = [
    {
      source: pos.slice(pos.indexOf('function MenuProductVideoState'), pos.indexOf('function MenuProductImageState')),
      name: 'MenuProductVideoState',
      props: {videoSrc: `${base}clip.mp4`, posterSrc: `${base}photo.webp`, alt: 'Matcha', className: 'photo'},
      extras: {MenuProductImageState: () => null, buildStoredProductImageUrl: value => value},
    },
    {
      source: website.slice(website.indexOf('function ProductMenuMedia'), website.indexOf('// 10 Nochi poses')),
      name: 'ProductMenuMedia',
      props: {product: {video_url: `${base}clip.mp4`, image_url: `${base}photo.webp`}, name: 'Matcha'},
      extras: {MenuPhoto: () => null, storedMenuPhoto: value => value},
    },
  ]
  for (const sample of samples) {
    const render = componentHarness(sample.source, sample.name, sample.extras)
    // Opening a detail view must also require an explicit play action.
    const props = {...sample.props, detail: true}
    const initial = render(props)
    assert.equal(find(initial, 'video'), undefined)
    const play = find(initial, 'button')
    assert.match(play.props['aria-label'], /Play video: Matcha/)
    let stopped = false
    play.props.onClick({stopPropagation: () => {stopped = true}})
    assert.equal(stopped, true)
    const video = find(render(props), 'video')
    assert.equal(video.props.src, `${base}clip.mp4`)
    assert.equal(video.props.preload, 'none')
    assert.equal(video.props.controls, true)
  }
})

test('storefront photo URLs use small stored variants and preserve legacy sources', async () => {
  const html = await readFile(new URL('../../storefront/index.html', import.meta.url), 'utf8')
  const source = html.slice(html.indexOf('function storedMenuPhoto'), html.indexOf('function MenuPhoto'))
  const context = vm.createContext({URL})
  vm.runInContext(source, context)
  assert.equal(context.storedMenuPhoto(`${base}products/id/123.webp`), `${base}products/id/123-720.webp`)
  assert.equal(context.storedMenuPhoto(`${base}products/id/123.webp`, 'thumb'), `${base}products/id/123-160.webp`)
  assert.equal(context.storedMenuPhoto('https://external.example/photo.jpg'), 'https://external.example/photo.jpg')
  assert.equal(context.storedMenuPhoto(''), '')
})
