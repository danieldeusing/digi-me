import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handle } from '../src/handler.mjs'
import { r2 } from './r2-stub.mjs'

const ADMIN = 'admin-secret'

function relay() {
  const env = { BUCKET: r2(), ADMIN_TOKEN: ADMIN }
  const call = (method, path, token, body, headers = {}) =>
    handle(new Request(`https://relay.test/v1${path}`, {
      method, body, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    }), env)
  const owner = async (name = 'daniel') => (await (await call('POST', '/owners', ADMIN, JSON.stringify({ owner: name }))).json()).token
  const device = async (ownerToken, name = 'ddAir', o = 'daniel') =>
    (await (await call('POST', `/${o}/devices`, ownerToken, JSON.stringify({ device: name }))).json()).token
  return { env, call, owner, device }
}

test('no token or an unknown token gives 401', async () => {
  const { call } = relay()
  assert.equal((await call('GET', '/daniel/bundles/my-agents')).status, 401)
  assert.equal((await call('GET', '/daniel/bundles/my-agents', 'nope')).status, 401)
})

test('only the admin creates owners, once, with a valid name', async () => {
  const { call, owner } = relay()
  const token = await owner()
  assert.equal((await call('POST', '/owners', token, JSON.stringify({ owner: 'eve' }))).status, 403)
  assert.equal((await call('POST', '/owners', ADMIN, JSON.stringify({ owner: 'daniel' }))).status, 409)
  assert.equal((await call('POST', '/owners', ADMIN, JSON.stringify({ owner: '../x' }))).status, 400)
  assert.equal((await call('POST', '/owners', ADMIN, JSON.stringify({ owner: 'owners' }))).status, 400)
})

test('the admin cannot read owner data', async () => {
  const { call, owner } = relay()
  await owner()
  assert.equal((await call('GET', '/daniel/bundles/my-agents', ADMIN)).status, 403)
})

test('the owner stores a bundle and a device reads it with ETag and 304', async () => {
  const { call, owner, device } = relay()
  const o = await owner(); const d = await device(o)
  assert.equal((await call('PUT', '/daniel/bundles/my-agents', o, new Uint8Array([1, 2, 3]))).status, 204)
  const res = await call('GET', '/daniel/bundles/my-agents', d)
  assert.equal(res.status, 200)
  assert.deepEqual(new Uint8Array(await res.arrayBuffer()), new Uint8Array([1, 2, 3]))
  const etag = res.headers.get('etag')
  assert.match(etag, /^"[0-9a-f]{64}"$/)
  assert.equal((await call('GET', '/daniel/bundles/my-agents', d, undefined, { 'if-none-match': etag })).status, 304)
  assert.equal((await call('GET', '/daniel/bundles/nothing', d)).status, 404)
})

test('a device cannot write bundles or read another owner', async () => {
  const { call, owner, device } = relay()
  const o = await owner(); const d = await device(o)
  const other = await owner('eve')
  await call('PUT', '/eve/bundles/my-agents', other, new Uint8Array([9]))
  assert.equal((await call('PUT', '/daniel/bundles/my-agents', d, new Uint8Array([1]))).status, 403)
  assert.equal((await call('GET', '/eve/bundles/my-agents', d)).status, 403)
  assert.equal((await call('POST', '/daniel/devices', d, JSON.stringify({ device: 'x' }))).status, 403)
})

test('a body over 1 MiB gives 413', async () => {
  const { call, owner } = relay()
  const o = await owner()
  assert.equal((await call('PUT', '/daniel/bundles/my-agents', o, new Uint8Array(1048577))).status, 413)
  assert.equal((await call('POST', '/daniel/inbox', o, new Uint8Array(1048577))).status, 413)
})

test('a device posts to the inbox, only the owner lists, reads and deletes', async () => {
  const { call, owner, device } = relay()
  const o = await owner(); const d = await device(o)
  const posted = await call('POST', '/daniel/inbox', d, new Uint8Array([7]))
  assert.equal(posted.status, 201)
  const { id } = await posted.json()
  assert.match(id, /^[0-9]{15}-[A-Za-z0-9_-]{8}$/)
  assert.equal((await call('GET', '/daniel/inbox', d)).status, 403)
  assert.deepEqual(await (await call('GET', '/daniel/inbox', o)).json(), { ids: [id] })
  assert.deepEqual(new Uint8Array(await (await call('GET', `/daniel/inbox/${id}`, o)).arrayBuffer()), new Uint8Array([7]))
  assert.equal((await call('DELETE', `/daniel/inbox/${id}`, o)).status, 204)
  assert.deepEqual(await (await call('GET', '/daniel/inbox', o)).json(), { ids: [] })
  assert.equal((await call('GET', '/daniel/inbox/bad', o)).status, 400)
})

test('a revoked or replaced device token gives 401', async () => {
  const { call, owner, device } = relay()
  const o = await owner()
  const first = await device(o)
  const second = await device(o)
  assert.equal((await call('POST', '/daniel/inbox', first, new Uint8Array([1]))).status, 401)
  assert.equal((await call('DELETE', '/daniel/devices/ddAir', o)).status, 204)
  assert.equal((await call('POST', '/daniel/inbox', second, new Uint8Array([1]))).status, 401)
  assert.equal((await call('DELETE', '/daniel/devices/ddAir', o)).status, 404)
})

test('the relay stores no plaintext token', async () => {
  const { env, owner } = relay()
  const token = await owner()
  for (const [key, value] of env.BUCKET.store) {
    assert.ok(!key.includes(token))
    assert.ok(!new TextDecoder().decode(value).includes(token))
  }
})

test('concurrent device tokens are all revoked by one DELETE', async () => {
  const { call, owner, device } = relay()
  const o = await owner()
  const [t1, t2] = await Promise.all([device(o), device(o)])
  assert.equal((await call('DELETE', '/daniel/devices/ddAir', o)).status, 204)
  assert.equal((await call('POST', '/daniel/inbox', t1, new Uint8Array([1]))).status, 401)
  assert.equal((await call('POST', '/daniel/inbox', t2, new Uint8Array([1]))).status, 401)
})

test('malformed or non-object JSON gives 400, not 500', async () => {
  const { call, owner, device } = relay()
  const o = await owner()
  assert.equal((await call('POST', '/owners', ADMIN, '{')).status, 400)
  assert.equal((await call('POST', '/owners', ADMIN, 'null')).status, 400)
  assert.equal((await call('POST', '/daniel/devices', o, '{')).status, 400)
  assert.equal((await call('POST', '/daniel/devices', o, 'null')).status, 400)
  assert.ok(await device(o))
})

test('non-string names give 400 and do not burn the name', async () => {
  const { call } = relay()
  assert.equal((await call('POST', '/owners', ADMIN, JSON.stringify({ owner: ['eve'] }))).status, 400)
  assert.equal((await call('POST', '/owners', ADMIN, JSON.stringify({ owner: 'eve' }))).status, 201)
  const { call: call2, owner } = relay()
  const o = await owner()
  assert.equal((await call2('POST', '/daniel/devices', o, JSON.stringify({ device: 5 }))).status, 400)
})

test('a client over its budget gets 429 before any token is checked; others go on', async () => {
  const used = new Map()
  const limiter = { limit: async ({ key }) => ({ success: (used.set(key, (used.get(key) ?? 0) + 1), used.get(key) <= 2) }) }
  const env = { BUCKET: r2(), ADMIN_TOKEN: ADMIN, LIMITER: limiter }
  const get = (ip) => handle(new Request('https://relay.test/v1/daniel/bundles/my-agents', { headers: { 'cf-connecting-ip': ip } }), env)
  assert.equal((await get('1.1.1.1')).status, 401)
  assert.equal((await get('1.1.1.1')).status, 401)
  const third = await get('1.1.1.1')
  assert.equal(third.status, 429)
  assert.deepEqual(await third.json(), { error: 'too many requests' })
  assert.equal((await get('2.2.2.2')).status, 401)
})
