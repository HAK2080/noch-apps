import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { once } from 'node:events'
import path from 'node:path'

const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/$/, '')
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const outputDir = process.env.BACKUP_OUTPUT_DIR || 'tmp/supabase-backup'
const pageSize = 1000

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
}

const headers = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
}

function safeFileName(value) {
  return value.replace(/[^a-zA-Z0-9_.-]/g, '_')
}

async function checkedFetch(url, options = {}) {
  const response = await fetch(url, options)
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} while exporting ${new URL(url).pathname}`)
  }
  return response
}

async function writeJsonLines(filePath, getPage) {
  const stream = createWriteStream(filePath, { encoding: 'utf8' })
  let count = 0
  let page = 0

  try {
    while (true) {
      const rows = await getPage(page)
      if (!Array.isArray(rows)) throw new Error(`Expected an array while writing ${filePath}`)

      for (const row of rows) {
        if (!stream.write(`${JSON.stringify(row)}\n`)) await once(stream, 'drain')
      }
      count += rows.length
      if (rows.length < pageSize) break
      page += 1
    }
  } finally {
    stream.end()
    await once(stream, 'finish')
  }

  return count
}

async function sha256(filePath) {
  const hash = createHash('sha256')
  const stream = createReadStream(filePath)
  stream.on('data', (chunk) => hash.update(chunk))
  await once(stream, 'end')
  return hash.digest('hex')
}

await rm(outputDir, { recursive: true, force: true })
await mkdir(path.join(outputDir, 'tables'), { recursive: true })

const openApiResponse = await checkedFetch(`${supabaseUrl}/rest/v1/`, {
  headers: { ...headers, Accept: 'application/openapi+json' },
})
const openApi = await openApiResponse.json()
const openApiFile = path.join(outputDir, 'openapi.json')
await writeFile(openApiFile, `${JSON.stringify(openApi, null, 2)}\n`, 'utf8')
const relations = Object.entries(openApi.paths || {})
  .filter(([route, operations]) => /^\/[^/]+$/.test(route) && operations?.get)
  .map(([route]) => decodeURIComponent(route.slice(1)))
  .sort()

if (!relations.length) throw new Error('No exposed database relations were found')

const manifest = {
  format: 'noch-supabase-jsonl-v1',
  created_at: new Date().toISOString(),
  project_ref: new URL(supabaseUrl).hostname.split('.')[0],
  git_sha: process.env.GITHUB_SHA || null,
  scope: {
    public_relations: true,
    auth_users: true,
    storage_bucket_metadata: true,
    storage_files: false,
    database_schema: false,
  },
  files: [],
}

manifest.files.push({
  path: 'openapi.json',
  source: 'PostgREST API schema',
  rows: null,
  sha256: await sha256(openApiFile),
})

for (const relation of relations) {
  const fileName = `${safeFileName(relation)}.jsonl`
  const filePath = path.join(outputDir, 'tables', fileName)
  const count = await writeJsonLines(filePath, async (page) => {
    const start = page * pageSize
    const end = start + pageSize - 1
    const response = await checkedFetch(
      `${supabaseUrl}/rest/v1/${encodeURIComponent(relation)}?select=*`,
      { headers: { ...headers, Range: `${start}-${end}`, 'Range-Unit': 'items' } },
    )
    return response.json()
  })

  manifest.files.push({
    path: `tables/${fileName}`,
    source: `public.${relation}`,
    rows: count,
    sha256: await sha256(filePath),
  })
}

const authFile = path.join(outputDir, 'auth-users.jsonl')
const authCount = await writeJsonLines(authFile, async (page) => {
  const response = await checkedFetch(
    `${supabaseUrl}/auth/v1/admin/users?page=${page + 1}&per_page=${pageSize}`,
    { headers },
  )
  const body = await response.json()
  return body.users || []
})
manifest.files.push({
  path: 'auth-users.jsonl',
  source: 'auth.users',
  rows: authCount,
  sha256: await sha256(authFile),
})

const bucketsResponse = await checkedFetch(`${supabaseUrl}/storage/v1/bucket`, { headers })
const buckets = await bucketsResponse.json()
const bucketsFile = path.join(outputDir, 'storage-buckets.json')
await writeFile(bucketsFile, `${JSON.stringify(buckets, null, 2)}\n`, 'utf8')
manifest.files.push({
  path: 'storage-buckets.json',
  source: 'storage.buckets metadata',
  rows: Array.isArray(buckets) ? buckets.length : 0,
  sha256: await sha256(bucketsFile),
})

await writeFile(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

const summary = {
  relations: relations.length,
  auth_users: authCount,
  files: manifest.files.length + 1,
  created_at: manifest.created_at,
}
process.stdout.write(`${JSON.stringify(summary)}\n`)
