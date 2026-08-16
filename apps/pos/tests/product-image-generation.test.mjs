import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  buildProductImagePrompt,
  normalizeProductImageBrief,
} from '../../../supabase/functions/generate-product-image/product-image-prompt.js'

const edgeFunctionUrl = new URL('../../../supabase/functions/generate-product-image/index.ts', import.meta.url)
const supabaseConfigUrl = new URL('../../../supabase/config.toml', import.meta.url)
const productPageUrl = new URL('../src/modules/pos/pages/POSProducts.jsx', import.meta.url)

test('AI product prompt keeps the full menu item visible and excludes generated text', () => {
  const prompt = buildProductImagePrompt({
    name: 'Iced Strawberry Matcha',
    name_ar: 'ماتشا فراولة مثلجة',
    description: 'Layered strawberry puree, milk, and matcha',
    category: 'Iced Matcha',
  })

  assert.match(prompt, /Iced Strawberry Matcha/)
  assert.match(prompt, /ماتشا فراولة مثلجة/)
  assert.match(prompt, /entire cup, glass, plate, or package fully visible/i)
  assert.match(prompt, /safe when fitted into a 4:5 menu card/i)
  assert.match(prompt, /Do not crop the product/i)
  assert.match(prompt, /Do not add text, lettering, labels, logos/i)
  assert.match(prompt, /#f8f3e8/)
})

test('AI product brief requires a name and limits untrusted form text', () => {
  assert.throws(() => normalizeProductImageBrief({}), /Enter a product name/)

  const brief = normalizeProductImageBrief({
    name: `  ${'x'.repeat(300)}  `,
    description: ' y '.repeat(400),
  })
  assert.equal(brief.name.length, 160)
  assert.ok(brief.description.length <= 500)
  assert.doesNotMatch(brief.description, /\s{2,}/)
})

test('generation endpoint is authenticated, role limited, and returns a compressed portrait WebP', async () => {
  const [source, config] = await Promise.all([
    readFile(edgeFunctionUrl, 'utf8'),
    readFile(supabaseConfigUrl, 'utf8'),
  ])

  assert.match(config, /\[functions\.generate-product-image\]\s*verify_jwt\s*=\s*true/s)
  assert.match(source, /auth\.getUser\(\)/)
  assert.match(source, /new Set\(\['owner', 'supervisor', 'data_entry'\]\)/)
  assert.match(source, /https:\/\/api\.openai\.com\/v1\/images\/generations/)
  assert.match(source, /DEFAULT_IMAGE_MODEL\s*=\s*'gpt-image-2'/)
  assert.match(source, /size:\s*'1024x1536'/)
  assert.match(source, /quality:\s*'medium'/)
  assert.match(source, /output_format:\s*'webp'/)
  assert.match(source, /output_compression:\s*82/)
})

test('product form provides one-click generation and reuses the no-crop optimizer before save', async () => {
  const source = await readFile(productPageUrl, 'utf8')

  assert.match(source, /onClick=\{handleGenerateImage\}/)
  assert.match(source, /Generate with AI/)
  assert.match(source, /await generateProductImage\(/)
  assert.match(source, /generatedImageFileFromBase64\(/)
  assert.match(source, /await optimizeProductImage\(generatedFile\)/)
  assert.match(source, /stageOptimizedImage\(optimized\)/)
  assert.match(source, /await uploadProductImage\(savedProduct\.id, pendingFile\)/)
})
