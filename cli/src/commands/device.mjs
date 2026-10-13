import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { newIdentity, recipientOf, encryptTo, decryptWith } from '../crypto.mjs'
import { paths, readConfig, writeConfig, readKey, writeKey, writePrivate, decodeJoin } from '../config.mjs'
import { NAME } from '../audiences.mjs'
import { relay } from '../relay-client.mjs'

export const secret = (value, io) => (value === '-' ? io.stdin.trim() : value)

export async function ensureKey() {
  if (existsSync(paths().key)) return readKey()
  const identity = await newIdentity()
  writeKey(identity)
  return identity
}

export async function login({ values }, io) {
  if (!values.join) {
    io.out(await recipientOf(await ensureKey()))
    return
  }
  if (existsSync(paths().config) && readConfig().data) throw new Error('this is the owner device; it does not join')
  readKey()
  const joined = decodeJoin(secret(values.join, io))
  writeConfig(joined)
  io.out(`joined ${joined.owner} as ${joined.device}: ${joined.audiences.join(', ')}`)
}

export async function pull(_, io) {
  const cfg = readConfig()
  const identity = readKey()
  const client = relay(cfg)
  for (const audience of cfg.audiences) {
    if (!NAME.test(audience)) throw new Error(`invalid audience name ${audience}`)
    const dir = join(paths().cache, audience)
    const metaFile = join(dir, 'meta.json')
    const meta = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, 'utf8')) : null
    let res
    try {
      res = await client.getBundle(audience, meta?.etag)
    } catch (err) {
      if (err.status !== 404) throw err
      io.out(`${audience}: not published yet`)
      continue
    }
    if (!res) continue
    let bundle
    try {
      bundle = JSON.parse(await decryptWith(res.bytes, identity))
    } catch {
      rmSync(dir, { recursive: true, force: true })
      io.out(`${audience}: cannot decrypt, cache removed`)
      continue
    }
    const domains = Object.keys(bundle.domains)
    const lower = domains.map((domain) => domain.toLowerCase())
    if (domains.some((domain) => !NAME.test(domain)) || lower.includes('core') || new Set(lower).size < lower.length) {
      io.out(`${audience}: invalid bundle, not written`)
      continue
    }
    rmSync(dir, { recursive: true, force: true })
    writePrivate(join(dir, 'core.md'), bundle.core)
    for (const [domain, text] of Object.entries(bundle.domains)) writePrivate(join(dir, `${domain}.md`), text)
    if (bundle.interview) writePrivate(join(dir, 'interview.json'), JSON.stringify(bundle.interview) + '\n')
    writePrivate(metaFile, JSON.stringify({ version: bundle.version, published: bundle.published, etag: res.etag }) + '\n')
    io.out(`${audience}: v${bundle.version}`)
  }
}

export async function answer(_, io) {
  const cfg = readConfig()
  const lines = io.stdin.split('\n').filter((line) => line.trim())
  if (!lines.length) throw new Error('no answers on stdin')
  for (const line of lines) {
    const entry = JSON.parse(line)
    if (!entry.id || !entry.domain) throw new Error('every answer needs id and domain')
  }
  const { id } = await relay(cfg).postInbox(await encryptTo(lines.join('\n') + '\n', [cfg.ownerKey]))
  io.out(`sent ${lines.length} answers (${id})`)
}
