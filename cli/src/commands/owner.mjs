import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { hostname } from 'node:os'
import { execFileSync } from 'node:child_process'
import { parseDocument } from 'yaml'
import { NAME, parseAudiences } from '../audiences.mjs'
import { loadData, buildBundles } from '../bundle.mjs'
import { parseAnswers } from '../coverage.mjs'
import { recipientOf, encryptTo, decryptWith, isRecipient } from '../crypto.mjs'
import { paths, readConfig, writeConfig, readKey, encodeJoin, isRelayUrl } from '../config.mjs'
import { relay } from '../relay-client.mjs'
import { audiencesTemplate, DOMAINS_TEMPLATE, GITIGNORE_TEMPLATE } from '../templates.mjs'
import { ensureKey, secret } from './device.mjs'

function ownerConfig() {
  const cfg = readConfig()
  if (!cfg.data) throw new Error('this command runs on the owner device only')
  return cfg
}

function writeBuild(dir) {
  const data = loadData(dir)
  const bundles = buildBundles(data)
  mkdirSync(join(dir, '.build'), { recursive: true })
  for (const [name, bundle] of Object.entries(bundles)) writeFileSync(join(dir, '.build', `${name}.json`), JSON.stringify(bundle, null, 2) + '\n')
  return { data, bundles }
}

export async function init({ positionals: [folder], values }, io) {
  if (!folder || !values.relay || !values['admin-token']) {
    throw new Error('usage: digi-me init <folder> --relay <url> --admin-token <token> [--owner <name>] [--device <name>]')
  }
  if (existsSync(paths().config)) throw new Error('this device already has a digi-me config; it cannot init')
  if (!isRelayUrl(values.relay)) throw new Error('--relay must be https (http only for localhost)')
  const dir = resolve(folder)
  if (existsSync(dir) && readdirSync(dir).length) throw new Error(`${dir} is not empty`)
  const owner = values.owner ?? basename(dir).replace(/^digi-/, '')
  const device = values.device ?? hostname().split('.')[0]
  if (!NAME.test(owner) || !NAME.test(device)) throw new Error('owner and device names: letters, digits and -')
  const ownerKey = await recipientOf(await ensureKey())
  const adminToken = secret(values['admin-token'], io)
  mkdirSync(join(dir, 'facts'), { recursive: true })
  mkdirSync(join(dir, 'answers'))
  writeFileSync(join(dir, 'audiences.yaml'), audiencesTemplate({ owner, device, key: ownerKey }))
  writeFileSync(join(dir, 'domains.md'), DOMAINS_TEMPLATE)
  writeFileSync(join(dir, '.gitignore'), GITIGNORE_TEMPLATE)
  writeFileSync(join(dir, 'facts', '.gitkeep'), '')
  writeFileSync(join(dir, 'answers', '.gitkeep'), '')
  execFileSync('git', ['init', '-q', '--', dir])
  let token
  try {
    ;({ token } = await relay({ relay: values.relay, owner }).createOwner(owner, adminToken))
  } catch (err) {
    rmSync(dir, { recursive: true, force: true })
    throw err
  }
  writeConfig({ relay: values.relay, owner, device, token, ownerKey, audiences: ['my-agents', 'work-agents'], data: dir })
  io.out(`created ${dir} for owner ${owner}, device ${device}`)
}

export async function deviceAdd({ positionals: [name, key], values }, io) {
  const cfg = ownerConfig()
  const audiences = (values.audiences ?? '').split(',').filter(Boolean)
  if (!name || !NAME.test(name) || !key?.startsWith('age1') || !audiences.length) {
    throw new Error('usage: digi-me device add <name> <age1… public key> --audiences a,b')
  }
  if (!(await isRecipient(key))) throw new Error('invalid age public key')
  const file = join(cfg.data, 'audiences.yaml')
  const doc = parseDocument(readFileSync(file, 'utf8'))
  if (doc.hasIn(['devices', name])) throw new Error(`device ${name} exists; remove it first`)
  doc.setIn(['devices', name], key)
  for (const audience of audiences) {
    const members = doc.getIn(['audiences', audience, 'members'])
    if (!members) throw new Error(`audience ${audience} has no members list`)
    members.add(name)
  }
  parseAudiences(String(doc))
  const { token } = await relay(cfg).createDevice(name)
  writeFileSync(file, String(doc))
  io.out(encodeJoin({ ...cfg, device: name, token, audiences }))
  await publish({ positionals: [], values: {} }, { out: () => {} })
}

export async function deviceRemove({ positionals: [name] }, io) {
  const cfg = ownerConfig()
  if (!name) throw new Error('usage: digi-me device remove <name>')
  if (name === cfg.device) throw new Error('the owner device cannot be removed')
  const file = join(cfg.data, 'audiences.yaml')
  const doc = parseDocument(readFileSync(file, 'utf8'))
  if (!doc.hasIn(['devices', name])) throw new Error(`no device ${name}`)
  try {
    await relay(cfg).revokeDevice(name)
  } catch (err) {
    if (err.status !== 404) throw err
  }
  doc.deleteIn(['devices', name])
  for (const pair of doc.get('audiences').items) {
    const members = pair.value?.get?.('members')
    if (members) members.items = members.items.filter((node) => (node?.value ?? node) !== name)
  }
  parseAudiences(String(doc))
  writeFileSync(file, String(doc))
  io.out(`removed ${name}`)
  await publish({ positionals: [], values: {} }, { out: () => {} })
}

export async function build(_, io) {
  const { bundles } = writeBuild(ownerConfig().data)
  io.out(`built ${Object.keys(bundles).join(', ')}`)
}

export async function publish(_, io) {
  const cfg = ownerConfig()
  const { data, bundles } = writeBuild(cfg.data)
  const versionFile = join(cfg.data, '.build', 'version')
  const version = (existsSync(versionFile) ? Number(readFileSync(versionFile, 'utf8')) : 0) + 1
  const published = new Date().toISOString()
  const client = relay(cfg)
  for (const [name, bundle] of Object.entries(bundles)) {
    const members = data.audiences[name].members ?? []
    if (!members.length) continue
    const bytes = await encryptTo(JSON.stringify({ ...bundle, version, published }), members.map((m) => data.devices[m]))
    await client.putBundle(name, bytes)
    io.out(`published ${name} v${version} to ${members.join(', ')}`)
  }
  writeFileSync(versionFile, `${version}\n`)
}

export async function inbox(_, io) {
  const cfg = ownerConfig()
  const identity = readKey()
  const client = relay(cfg)
  const dir = join(cfg.data, 'answers')
  mkdirSync(dir, { recursive: true })
  const seen = new Set(readdirSync(dir).filter((f) => f.endsWith('.jsonl'))
    .flatMap((f) => parseAnswers(readFileSync(join(dir, f), 'utf8')).map((e) => e.id)))
  const { ids } = await client.listInbox()
  let added = 0
  let unreadable = 0
  let dropped = 0
  for (const id of ids) {
    let entries
    try {
      entries = parseAnswers(await decryptWith(await client.getInbox(id), identity))
    } catch {
      unreadable++
      io.out(`inbox: batch ${id} unreadable, left at the relay`)
      continue
    }
    const fresh = []
    for (const e of entries) {
      if (!e || typeof e !== 'object' || !e.id || !e.domain) dropped++
      else if (!seen.has(e.id)) {
        seen.add(e.id)
        fresh.push(e)
      }
    }
    const month = new Date(Number(id.split('-')[0])).toISOString().slice(0, 7)
    if (fresh.length) appendFileSync(join(dir, `${month}.jsonl`), fresh.map((e) => JSON.stringify(e) + '\n').join(''))
    added += fresh.length
    await client.deleteInbox(id)
  }
  io.out(`inbox: ${ids.length} batches, ${added} new answers${unreadable ? `, ${unreadable} unreadable` : ''}${dropped ? `, ${dropped} dropped` : ''}`)
}
