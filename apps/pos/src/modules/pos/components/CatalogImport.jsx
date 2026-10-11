import { useState } from 'react'
import { getAllProducts, createPOSProduct, updatePOSProduct, uploadProductImage } from '../lib/pos-supabase'
import { optimizeProductImageSet } from '../lib/product-image-processing'
import { validateCatalogImport, planCatalogImport, catalogImportPayload } from '../lib/catalog-import'

export default function CatalogImport({ products, branches, categories, onClose, onSaved }) {
  const [branchId, setBranchId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [rows, setRows] = useState(null)
  const [plan, setPlan] = useState([])
  const [error, setError] = useState('')
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState([])
  const [exportText, setExportText] = useState('')
  const readFile = async event => {
    setError(''); setResults([]); setRows(null); setPlan([])
    try {
      const file = event.target.files?.[0]
      if (!file) return
      if (file.size > 50 * 1024 * 1024) throw new Error('File exceeds 50 MB')
      const valid = validateCatalogImport(JSON.parse(await file.text()))
      setPlan(planCatalogImport(valid, products)); setRows(valid)
    } catch (err) { setError(err.message) }
  }
  const publish = async () => {
    setRunning(true); setError(''); setResults([])
    const receipt = []
    try {
      const fresh = planCatalogImport(rows, await getAllProducts({ includeInactive: true }))
      for (const { row, existing, action } of fresh) {
        if (action === 'Skip') { receipt.push({ sku: row.sku, action }); setResults([...receipt]); continue }
        try {
          const payload = catalogImportPayload(row, existing, branchId, categoryId)
          if (row.patch && !row.photo_data) {
            await updatePOSProduct(existing.id, payload)
            receipt.push({ sku: row.sku, action, id: existing.id, fields: Object.keys(payload) })
          } else if (!row.available && !row.patch) {
            await updatePOSProduct(existing.id, payload)
            receipt.push({ sku: row.sku, action, id: existing.id })
          } else {
            const [meta, encoded] = row.photo_data.split(',')
            const type = meta.slice(5, meta.indexOf(';'))
            const file = new File([Uint8Array.from(atob(encoded), c => c.charCodeAt(0))], `${row.sku}.jpg`, { type })
            const optimized = await optimizeProductImageSet(file)
            // New items stay hidden if upload fails. Existing count/cost fields
            // are never rewritten; inaccurate counts do not control retail availability.
            const product = existing || await createPOSProduct({ ...payload, visible_on_website: false, visible_on_menu: false })
            const imageUrl = await uploadProductImage(product.id, optimized)
            await updatePOSProduct(product.id, { ...payload, image_url: imageUrl })
            receipt.push({ sku: row.sku, action, id: product.id, price: row.price ?? existing?.price, source_urls: row.source_urls })
          }
        } catch (err) {
          receipt.push({ sku: row.sku, action: 'Error', error: err.message })
          setError(`${row.sku}: ${err.message}`); break
        }
        setResults([...receipt])
      }
      setResults([...receipt]); setExportText(JSON.stringify(receipt, null, 2)); await onSaved()
    } catch (err) { setError(err.message) } finally { setRunning(false) }
  }
  const download = (text, name) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url)
  }
  return <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
    <section role="dialog" aria-label="Retail catalogue import" className="bg-noch-card border border-noch-border rounded-2xl p-6 w-full max-w-4xl max-h-[90vh] overflow-auto">
      <h2 className="text-xl font-bold mb-2">Retail catalogue import</h2>
      <p className="text-sm text-noch-muted mb-4">Review matches before publishing. New catalogue rows use the higher of sheet LYD or wholesale USD × 10, rounded up to 5 LYD, and disable count tracking until quantities are verified. Corrections change only the reviewed names, store visibility or sourced photos; prices, counts and costs stay intact. No AI photos.</p>
      <div className="flex gap-3 flex-wrap mb-4">
        <select aria-label="Import branch" className="input" disabled={running} value={branchId} onChange={e => setBranchId(e.target.value)}><option value="">Choose branch</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        <select aria-label="Import category" className="input" disabled={running} value={categoryId} onChange={e => setCategoryId(e.target.value)}><option value="">Choose store category</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <input aria-label="Catalogue JSON file" type="file" accept=".json,application/json" disabled={running} onChange={readFile} />
        <button className="btn-secondary" disabled={running} onClick={() => download(JSON.stringify(products.map(p => ({ id: p.id, sku: p.sku, name: p.name, name_ar: p.name_ar, price: p.price, image_url: p.image_url, category_id: p.category_id, branch_id: p.branch_id, visible_on_website: p.visible_on_website, is_active: p.is_active, is_available: p.is_available, is_sold_out: p.is_sold_out, is_coffee_bean: p.is_coffee_bean, retail_pack_size_base_units: p.retail_pack_size_base_units })), null, 2), 'catalogue-before-import.json')}>Export catalogue for matching</button>
      </div>
      {error && <p role="alert" className="text-red-400 mb-3">{error}</p>}
      <p role="status" className="mb-3">{results.length ? `${results.length} / ${plan.length} processed · ${results.filter(r => r.action === 'Error').length} errors` : `${plan.length} rows ready`}</p>
      <table className="w-full text-sm mb-4"><thead><tr><th>SKU</th><th>Action</th><th>Existing product</th><th>New name</th><th>LYD</th></tr></thead><tbody>{plan.map(p => <tr key={p.row.sku}><td>{p.row.sku}</td><td>{p.action}</td><td>{p.existing?.name || '—'}</td><td>{p.row.name || (p.row.patch ? p.existing?.name : 'Unavailable')}</td><td>{p.row.price ?? p.existing?.price ?? '—'}</td></tr>)}</tbody></table>
      <div className="flex gap-3"><button className="btn-primary" disabled={running || !rows || !!error || !branchId || !categoryId || results.length === plan.length} onClick={publish}>{running ? 'Publishing…' : 'Publish reviewed catalogue'}</button><button className="btn-secondary" disabled={running} onClick={onClose}>Close</button>{exportText && <button className="btn-secondary" onClick={() => download(exportText, 'catalogue-import-result.json')}>Download import result</button>}</div>
    </section>
  </div>
}
