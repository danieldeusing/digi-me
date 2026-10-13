import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { handle } from '../../relay/src/handler.mjs'
import { r2 } from '../../relay/test/r2-stub.mjs'
import { run } from '../src/main.mjs'
import { checkDomainNames, loadData } from '../src/bundle.mjs'
import { decryptWith, encryptTo, isRecipient, newIdentity, recipientOf } from '../src/crypto.mjs'
import { decodeJoin, encodeJoin, readConfig } from '../src/config.mjs'
import { relay } from '../src/relay-client.mjs'
import { audiencesTemplate, DOMAINS_TEMPLATE } from '../src/templates.mjs'

const env = { BUCKET: r2(), ADMIN_TOKEN: 'admin-secret' }
const seen = [] // every request the relay got: "METHOD path"
let failNext = null // { method, includes } -> the next matching request gets a 503
let onRequest = null
globalThis.fetch = async (url, init) => {
  const { pathname } = new URL(url)
  seen.push(`${init?.method ?? 'GET'} ${pathname}`)
  onRequest?.(init?.method ?? 'GET', pathname)
  if (failNext && failNext.method === init?.method && pathname.includes(failNext.includes)) {
    failNext = null
    return new Response('down', { status: 503 })
  }
  return handle(new Request(url, init), env)
}

const temp = (name) => mkdtempSync(join(tmpdir(), name))
async function as(home, argv, stdin = '') {
  process.env.DIGI_ME_HOME = home
  const out = []
  await run(argv, { out: (line) => out.push(line), stdin })
  return out
}

let counter = 0
// An owner device (home + data folder) and a joined second device.
async function setup({ join: joinAudiences = 'my-agents' } = {}) {
  const n = ++counter
  const owner = `owner${n}`
  const homeA = temp('cmd-a-')
  const data = join(temp('cmd-data-'), `digi-${owner}`)
  await as(homeA, ['init', data, '--relay', 'https://relay.test', '--admin-token', 'admin-secret', '--device', 'ddStudio'])
  const homeB = temp('cmd-b-')
  const [key] = await as(homeB, ['login'])
  const [joinCode] = await as(homeA, ['device', 'add', 'ddAir', key, '--audiences', joinAudiences])
  await as(homeB, ['login', '--join', joinCode])
  return { owner, homeA, homeB, data, key, joinCode }
}
const configOf = (home) => { process.env.DIGI_ME_HOME = home; return readConfig() }

test('device remove: a relay failure leaves the device listed, a retry succeeds and revokes', async () => {
  const { homeA, homeB, data, joinCode } = await setup()
  const yaml = () => readFileSync(join(data, 'audiences.yaml'), 'utf8')
  failNext = { method: 'DELETE', includes: '/devices/' }
  await assert.rejects(as(homeA, ['device', 'remove', 'ddAir']), /503/)
  assert.match(yaml(), /ddAir/)
  await as(homeA, ['device', 'remove', 'ddAir'])
  assert.doesNotMatch(yaml(), /ddAir/)
  const device = { ...decodeJoin(joinCode) }
  await assert.rejects(relay(device).getBundle('my-agents'), (err) => err.status === 401)
  const removedIdentity = readFileSync(join(homeB, '.config', 'digi-me', 'key.txt'), 'utf8').trim()
  const bytes = env.BUCKET.store.get(`${device.owner}/bundles/my-agents.age`)
  assert.ok(bytes)
  await assert.rejects(decryptWith(bytes, removedIdentity))
})

test('isRecipient accepts an age recipient and refuses a typo', async () => {
  assert.equal(await isRecipient(await recipientOf(await newIdentity())), true)
  assert.equal(await isRecipient('age1typo'), false)
})

test('device add: an invalid key is refused before anything is written', async () => {
  const { homeA, data } = await setup()
  const before = readFileSync(join(data, 'audiences.yaml'), 'utf8')
  const calls = seen.length
  await assert.rejects(as(homeA, ['device', 'add', 'x', 'age1typo', '--audiences', 'my-agents']), /invalid age public key/)
  assert.equal(readFileSync(join(data, 'audiences.yaml'), 'utf8'), before)
  assert.equal(seen.length, calls)
})

test('device add: a relay failure leaves audiences.yaml unchanged', async () => {
  const { homeA, data } = await setup()
  const before = readFileSync(join(data, 'audiences.yaml'), 'utf8')
  const key = await recipientOf(await newIdentity())
  failNext = { method: 'POST', includes: '/devices' }
  await assert.rejects(as(homeA, ['device', 'add', 'ddPhone', key, '--audiences', 'my-agents']), /503/)
  assert.equal(readFileSync(join(data, 'audiences.yaml'), 'utf8'), before)
})

test('init: files exist before the owner is created; a failure removes the folder', async () => {
  const first = await setup()
  const home = temp('cmd-init-')
  const data = join(temp('cmd-data-'), `digi-${first.owner}`)
  let existedAtCreate = null
  onRequest = (method, pathname) => { if (method === 'POST' && pathname === '/v1/owners') existedAtCreate = existsSync(join(data, 'audiences.yaml')) }
  await assert.rejects(as(home, ['init', data, '--relay', 'https://relay.test', '--admin-token', 'admin-secret', '--owner', first.owner]), /409/)
  onRequest = null
  assert.equal(existedAtCreate, true)
  assert.equal(existsSync(data), false)
  assert.equal(existsSync(join(home, '.config', 'digi-me', 'config.json')), false)
})

test('pull: a bundle with an unsafe domain name is not written', async () => {
  const { homeA, homeB, key, owner } = await setup()
  const ownerClient = relay(configOf(homeA))
  for (const bad of ['../escape', 'core', 'Core']) {
    const bundle = { owner, audience: 'my-agents', core: 'CORE', domains: { food: 'f', [bad]: 'x' }, interview: null, version: 9, published: 'now' }
    await ownerClient.putBundle('my-agents', await encryptTo(JSON.stringify(bundle), [key]))
    const cache = join(homeB, '.digi-me', 'bundles', 'my-agents')
    assert.deepEqual(await as(homeB, ['pull']), ['my-agents: invalid bundle, not written'])
    assert.equal(existsSync(join(homeB, '.digi-me', 'bundles', 'escape.md')), false)
    assert.equal(existsSync(join(cache, 'food.md')), false)
    assert.notEqual(existsSync(join(cache, 'core.md')) && readFileSync(join(cache, 'core.md'), 'utf8'), 'CORE')
  }
})

test('pull: an audience name that is not a name in config is refused', async () => {
  const { homeB } = await setup()
  const file = join(homeB, '.config', 'digi-me', 'config.json')
  const cfg = JSON.parse(readFileSync(file, 'utf8'))
  writeFileSync(file, JSON.stringify({ ...cfg, audiences: ['../../x'] }))
  await assert.rejects(as(homeB, ['pull']), /invalid audience name/)
})

test('loadData refuses a facts file named core.md', async () => {
  const dir = temp('cmd-load-')
  mkdirSync(join(dir, 'facts'))
  writeFileSync(join(dir, 'audiences.yaml'), audiencesTemplate({ owner: 'o', device: 'd', key: await recipientOf(await newIdentity()) }))
  writeFileSync(join(dir, 'domains.md'), DOMAINS_TEMPLATE)
  writeFileSync(join(dir, 'facts', 'core.md'), '- A fact. {id: f-1, sees: [familie, beste-freunde, freunde, arbeitsfreunde], c: 1, t: 2026-10, a: [seed]}\n')
  assert.throws(() => loadData(dir), /facts\/core\.md: core is reserved/)
})

test('inbox: unreadable batches stay at the relay, readable ones are stored, duplicates and bad entries are dropped', async () => {
  const { homeA, homeB, data, key } = await setup()
  const device = relay(configOf(homeB))
  const ownerCfg = configOf(homeA)
  const garbage = await device.postInbox(new Uint8Array([1, 2, 3]))
  const notJson = await device.postInbox(await encryptTo('this is not json\n', [ownerCfg.ownerKey]))
  await as(homeB, ['answer'], JSON.stringify({ id: 'a-1', domain: 'food' }) + '\n')
  const lines = [{ id: 'a-2', domain: 'food' }, { id: 'a-2', domain: 'food' }, { topic: 'no id' }].map((e) => JSON.stringify(e))
  await device.postInbox(await encryptTo(lines.join('\n') + '\n', [ownerCfg.ownerKey]))
  assert.ok(key)
  const out = await as(homeA, ['inbox'])
  // two batches posted in the same millisecond list by their random suffix: either order
  assert.equal(out.length, 3)
  assert.deepEqual(out.slice(0, 2).sort(), [
    `inbox: batch ${garbage.id} unreadable, left at the relay`,
    `inbox: batch ${notJson.id} unreadable, left at the relay`,
  ].sort())
  assert.equal(out[2], 'inbox: 4 batches, 2 new answers, 2 unreadable, 1 dropped')
  const month = new Date().toISOString().slice(0, 7)
  const stored = readFileSync(join(data, 'answers', `${month}.jsonl`), 'utf8').trim().split('\n').map((l) => JSON.parse(l).id)
  assert.deepEqual(stored.sort(), ['a-1', 'a-2'])
  const again = await as(homeA, ['inbox'])
  assert.equal(again.length, 3)
  assert.match(again[2], /^inbox: 2 batches, 0 new answers, 2 unreadable$/)
})

test('secrets can come from stdin with -', async () => {
  const { joinCode } = await setup()
  const home = temp('cmd-stdin-')
  const [key] = await as(home, ['login'])
  assert.match(key, /^age1/)
  assert.deepEqual(await as(home, ['login', '--join', '-'], joinCode + '\n'), [`joined ${decodeJoin(joinCode).owner} as ddAir: my-agents`])

  const data = join(temp('cmd-data-'), 'digi-stdinowner')
  const homeA = temp('cmd-init2-')
  await as(homeA, ['init', data, '--relay', 'https://relay.test', '--admin-token', '-'], 'admin-secret\n')
  assert.ok(existsSync(join(data, '.git')))
})

test('pull: two domains that differ only in case are not written', async () => {
  const { homeA, homeB, key, owner } = await setup()
  const bundle = { owner, audience: 'my-agents', core: 'CORE', domains: { food: 'f', Food: 'x' }, interview: null, version: 9, published: 'now' }
  await relay(configOf(homeA)).putBundle('my-agents', await encryptTo(JSON.stringify(bundle), [key]))
  assert.deepEqual(await as(homeB, ['pull']), ['my-agents: invalid bundle, not written'])
})

test('init: a device that already has a config cannot init', async () => {
  const { homeB, owner } = await setup()
  const calls = seen.length
  const data = join(temp('cmd-data-'), `digi-${owner}x`)
  await assert.rejects(as(homeB, ['init', data, '--relay', 'https://relay.test', '--admin-token', 'admin-secret']), /this device already has a digi-me config; it cannot init/)
  assert.equal(seen.length, calls)
  assert.equal(existsSync(data), false)
  assert.equal(env.BUCKET.store.has(`${owner}x/owner.json`), false)
})

test('init: a relay URL that is http and not localhost is refused', async () => {
  const data = join(temp('cmd-data-'), 'digi-insecure')
  await assert.rejects(as(temp('cmd-init3-'), ['init', data, '--relay', 'http://example.com', '--admin-token', 'admin-secret']), /--relay must be https \(http only for localhost\)/)
  assert.equal(existsSync(data), false)
})

test('loadData refuses fact files with an invalid or reserved domain name', async () => {
  const dir = temp('cmd-load2-')
  mkdirSync(join(dir, 'facts'))
  writeFileSync(join(dir, 'audiences.yaml'), audiencesTemplate({ owner: 'o', device: 'd', key: await recipientOf(await newIdentity()) }))
  writeFileSync(join(dir, 'domains.md'), DOMAINS_TEMPLATE)
  const fact = '- A fact. {id: f-1, sees: [familie, beste-freunde, freunde, arbeitsfreunde], c: 1, t: 2026-10, a: [seed]}\n'
  writeFileSync(join(dir, 'facts', 'tech_taste.md'), fact)
  assert.throws(() => loadData(dir), /facts\/tech_taste\.md: invalid domain name/)
  rmSync(join(dir, 'facts', 'tech_taste.md'))
  writeFileSync(join(dir, 'facts', 'Core.md'), fact)
  assert.throws(() => loadData(dir), /facts\/Core\.md: core is reserved/)
})

test('checkDomainNames refuses names that differ only in case', () => {
  assert.doesNotThrow(() => checkDomainNames(['food.md', 'work.md']))
  assert.throws(() => checkDomainNames(['Food.md', 'food.md']), /facts\/food\.md: domain differs from Food\.md only in case/)
  assert.throws(() => checkDomainNames(['Core.md']), /facts\/Core\.md: core is reserved/)
})

test('a join code with a bad relay URL or name is refused', () => {
  const values = { relay: 'https://r', owner: 'daniel', device: 'ddAir', token: 't', ownerKey: 'age1x', audiences: ['my-agents'] }
  assert.throws(() => decodeJoin(encodeJoin({ ...values, relay: 'http://example.com' })), /invalid join code: relay missing or invalid/)
  assert.throws(() => decodeJoin(encodeJoin({ ...values, owner: '../x' })), /invalid join code: owner missing or invalid/)
  assert.throws(() => decodeJoin(encodeJoin({ ...values, device: 'a/b' })), /invalid join code: device missing or invalid/)
  assert.throws(() => decodeJoin(encodeJoin({ ...values, audiences: ['../x'] })), /invalid join code: audiences missing or invalid/)
  assert.deepEqual(decodeJoin(encodeJoin({ ...values, relay: 'http://localhost:8787' })).relay, 'http://localhost:8787')
  assert.deepEqual(decodeJoin(encodeJoin({ ...values, relay: 'http://127.0.0.1:8787' })).relay, 'http://127.0.0.1:8787')
})
