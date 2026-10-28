#!/usr/bin/env node
/**
 * Copy every file from Railway's storage bucket to the Oracle server's disk, in the layout storage-api's
 * "file" backend reads: <DATA_DIR>/storage/<STORAGE_BUCKET_DIR>/<same key as in the bucket>
 * (keys look like stub/<bucket>/<object name>/<version>). Content-Type and Cache-Control go into the xattrs
 * storage-api reads (user.supabase.content-type / user.supabase.cache-control). Railway is only read.
 *
 * Run on the server from deploy/oracle/scripts (after `npm ci` there and after migrate-db.sh):
 *   node migrate-storage.mjs --check-layout   # upload a test file through the API, confirm where it lands, delete it
 *   node migrate-storage.mjs                  # copy (resumable: files already copied with the same size are skipped)
 *   node migrate-storage.mjs --verify         # every database file present on disk + 25 random files through the API
 */
import { execFileSync } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'

const here = dirname(fileURLToPath(import.meta.url))
const oracleDir = join(here, '..')
const env = Object.fromEntries(
  readFileSync(join(oracleDir, '.env'), 'utf8')
    .split('\n')
    .filter((line) => /^[A-Z0-9_]+=/.test(line))
    .map((line) => {
      const key = line.slice(0, line.indexOf('='))
      let value = line.slice(line.indexOf('=') + 1)
      if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1).replace(/'\\''/g, "'")
      return [key, value]
    }),
)
const storageRoot = join(env.DATA_DIR || '/opt/qe/data', 'storage', env.STORAGE_BUCKET_DIR || 'qe-files')
const apiBase = `https://${env.API_DOMAIN}/storage/v1`
const mode = process.argv[2] ?? ''

const s3 = new S3Client({
  region: env.SOURCE_S3_REGION || 'auto',
  endpoint: env.SOURCE_S3_ENDPOINT,
  forcePathStyle: String(env.SOURCE_S3_FORCE_PATH_STYLE) !== 'false',
  credentials: { accessKeyId: env.SOURCE_S3_ACCESS_KEY_ID, secretAccessKey: env.SOURCE_S3_SECRET_ACCESS_KEY },
})
const Bucket = env.SOURCE_S3_BUCKET

function setXattr(file, name, value) {
  if (!value) return
  execFileSync('setfattr', ['-n', name, '-v', value, file])
}

async function listAll() {
  const out = []
  let token
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket, ContinuationToken: token }))
    for (const o of page.Contents ?? []) out.push({ key: o.Key, size: o.Size ?? 0 })
    token = page.NextContinuationToken
  } while (token)
  return out
}

function walk(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)]))
}

const api = (path, init = {}) =>
  fetch(`${apiBase}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`, apikey: env.SERVICE_ROLE_KEY, ...(init.headers ?? {}) },
  })

async function checkLayout() {
  const name = `_oracle-layout-check/${randomUUID()}.txt`
  const up = await api(`/object/bis-project-files/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain', 'x-upsert': 'true' },
    body: 'layout check',
  })
  if (!up.ok) throw new Error(`Test upload failed: ${up.status} ${await up.text()}`)
  const root = join(env.DATA_DIR || '/opt/qe/data', 'storage')
  const hit = walk(root).find((f) => f.includes(name))
  await api(`/object/bis-project-files/${name}`, { method: 'DELETE' })
  if (!hit) throw new Error(`Uploaded test file not found under ${root}`)
  const rel = relative(root, hit)
  const expected = `${env.STORAGE_BUCKET_DIR || 'qe-files'}/stub/bis-project-files/${name}/`
  console.log(`Test file landed at: ${rel}`)
  if (!rel.startsWith(expected)) throw new Error(`Layout differs from the copy plan (expected ${expected}<version>). Stop and review.`)
  console.log('Layout matches: files will be copied to the right place.')
}

async function copyAll() {
  const objects = await listAll()
  const totalBytes = objects.reduce((s, o) => s + o.size, 0)
  console.log(`Railway bucket: ${objects.length} files, ${(totalBytes / 1e9).toFixed(2)} GB → ${storageRoot}`)
  let done = 0
  let skipped = 0
  let copiedBytes = 0
  const failed = []
  const queue = [...objects]
  const worker = async () => {
    for (let o = queue.shift(); o; o = queue.shift()) {
      const target = join(storageRoot, o.key)
      try {
        if (existsSync(target) && statSync(target).size === o.size) {
          skipped++
          continue
        }
        mkdirSync(dirname(target), { recursive: true })
        const res = await s3.send(new GetObjectCommand({ Bucket, Key: o.key }))
        const tmp = `${target}.part`
        await pipeline(res.Body, createWriteStream(tmp))
        renameSync(tmp, target)
        setXattr(target, 'user.supabase.content-type', res.ContentType || 'application/octet-stream')
        setXattr(target, 'user.supabase.cache-control', res.CacheControl || 'max-age=3600')
        done++
        copiedBytes += o.size
        if (done % 100 === 0) console.log(`  ${done + skipped}/${objects.length} (${(copiedBytes / 1e9).toFixed(2)} GB copied)`)
      } catch (err) {
        failed.push(`${o.key}: ${err instanceof Error ? err.message : err}`)
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker))
  console.log(`Copied ${done}, already there ${skipped}, failed ${failed.length}.`)
  if (failed.length) {
    console.log(failed.slice(0, 20).join('\n'))
    console.log('Run the script again to retry the failed files.')
    process.exitCode = 1
  }
  fixOwner()
}

function fixOwner() {
  // Files must belong to the user storage-api runs as inside its container.
  try {
    const compose = ['compose', '-f', join(oracleDir, 'docker-compose.yml'), '--env-file', join(oracleDir, '.env')]
    const uid = execFileSync('docker', [...compose, 'exec', '-T', 'storage', 'id', '-u']).toString().trim()
    const gid = execFileSync('docker', [...compose, 'exec', '-T', 'storage', 'id', '-g']).toString().trim()
    execFileSync('sudo', ['chown', '-R', `${uid}:${gid}`, join(env.DATA_DIR || '/opt/qe/data', 'storage')])
    console.log(`Owner set to ${uid}:${gid} (storage-api user).`)
  } catch (err) {
    console.log(`Could not set the owner automatically: ${err instanceof Error ? err.message : err}`)
  }
}

async function dbObjects() {
  // Current files according to the database (storage.objects), read through PostgREST with the service key.
  const rows = []
  for (let from = 0; ; from += 1000) {
    const res = await fetch(`https://${env.API_DOMAIN}/rest/v1/objects?select=bucket_id,name,version,metadata&order=id`, {
      headers: {
        Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`,
        apikey: env.SERVICE_ROLE_KEY,
        'Accept-Profile': 'storage',
        Range: `${from}-${from + 999}`,
      },
    })
    if (!res.ok) throw new Error(`Reading storage.objects failed: ${res.status} ${await res.text()}`)
    const page = await res.json()
    rows.push(...page)
    if (page.length < 1000) break
  }
  return rows
}

async function verify() {
  const rows = await dbObjects()
  const onDisk = new Set(walk(storageRoot).map((f) => relative(storageRoot, f)))
  const keyOf = (r) => (r.version ? `stub/${r.bucket_id}/${r.name}/${r.version}` : `stub/${r.bucket_id}/${r.name}`)
  const missing = rows.filter((r) => !onDisk.has(keyOf(r)))
  console.log(`Files in the database ${rows.length}, files on Oracle disk ${onDisk.size}, database files missing on disk ${missing.length}`)
  missing.slice(0, 15).forEach((r) => console.log(`  missing: ${r.bucket_id}/${r.name}`))
  const present = rows.filter((r) => onDisk.has(keyOf(r)))
  const sample = [...present].sort(() => Math.random() - 0.5).slice(0, 25)
  let ok = 0
  for (const r of sample) {
    const res = await api(`/object/authenticated/${r.bucket_id}/${r.name.split('/').map(encodeURIComponent).join('/')}`)
    const body = res.ok ? Buffer.from(await res.arrayBuffer()) : null
    const size = Number(r.metadata?.size ?? -1)
    const type = String(r.metadata?.mimetype ?? '').split(';')[0]
    const good = res.ok && body.length === size && (!type || (res.headers.get('content-type') || '').startsWith(type))
    if (good) ok++
    else console.log(`  mismatch: ${r.bucket_id}/${r.name} (status ${res.status}, size ${body?.length ?? '-'} vs ${size}, type ${res.headers.get('content-type')} vs ${type})`)
  }
  console.log(`Random check through the API: ${ok}/${sample.length} files identical.`)
  if (missing.length || ok !== sample.length) process.exitCode = 1
}

if (mode === '--check-layout') await checkLayout()
else if (mode === '--verify') await verify()
else await copyAll()
