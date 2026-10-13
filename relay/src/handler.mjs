const MAX_BODY = 1024 * 1024
const NAME = /^[A-Za-z0-9][A-Za-z0-9-]{0,62}$/
const INBOX_ID = /^[0-9]{15}-[A-Za-z0-9_-]{8}$/

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const fail = (status, error) => json({ error }, status)
const empty = (status, headers) => new Response(null, { status, headers })

async function sha256(data) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

async function readBody(request) {
  const body = new Uint8Array(await request.arrayBuffer())
  return body.byteLength > MAX_BODY ? null : body
}

async function readJson(request) {
  try {
    const value = await request.json()
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null
  } catch {
    return null
  }
}

async function whoIs(request, env) {
  const header = request.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return null
  const hash = await sha256(token)
  if (env.ADMIN_TOKEN && hash === (await sha256(env.ADMIN_TOKEN))) return { role: 'admin' }
  const record = await env.BUCKET.get(`tokens/${hash}`)
  if (!record) return null
  const who = JSON.parse(await record.text())
  if (who.role !== 'device') return who
  const current = await env.BUCKET.get(`${who.owner}/devices/${who.device}`)
  return current && (await current.text()) === hash ? who : null
}

async function saveToken(env, record) {
  const token = newToken()
  const hash = await sha256(token)
  await env.BUCKET.put(`tokens/${hash}`, JSON.stringify(record))
  return { token, hash }
}

async function revokeDevice(env, owner, device) {
  const record = await env.BUCKET.get(`${owner}/devices/${device}`)
  if (!record) return false
  await env.BUCKET.delete(`tokens/${await record.text()}`)
  await env.BUCKET.delete(`${owner}/devices/${device}`)
  return true
}

async function listInbox(env, owner) {
  const prefix = `${owner}/inbox/`
  const ids = []
  let cursor
  do {
    const page = await env.BUCKET.list({ prefix, cursor })
    ids.push(...page.objects.map((o) => o.key.slice(prefix.length, -'.age'.length)))
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)
  return ids.sort()
}

export async function handle(request, env) {
  // One budget per client address, spent before any token is checked (the LIMITER binding).
  if (env.LIMITER) {
    const { success } = await env.LIMITER.limit({ key: request.headers.get('cf-connecting-ip') ?? 'unknown' })
    if (!success) return fail(429, 'too many requests')
  }
  const [v1, owner, kind, name, ...extra] = new URL(request.url).pathname.split('/').filter(Boolean)
  if (v1 !== 'v1' || !owner || extra.length) return fail(404, 'not found')
  const who = await whoIs(request, env)
  if (!who) return fail(401, 'unauthorized')
  const method = request.method

  if (owner === 'owners' && !kind) {
    if (method !== 'POST') return fail(405, 'method not allowed')
    if (who.role !== 'admin') return fail(403, 'forbidden')
    const body = await readJson(request)
    if (!body) return fail(400, 'invalid json')
    const id = body.owner
    if (typeof id !== 'string' || !NAME.test(id) || id === 'owners') return fail(400, 'invalid owner name')
    if (await env.BUCKET.head(`${id}/owner.json`)) return fail(409, 'owner exists')
    await env.BUCKET.put(`${id}/owner.json`, '{}')
    const { token } = await saveToken(env, { owner: id, role: 'owner' })
    return json({ owner: id, token }, 201)
  }
  if (!NAME.test(owner) || who.owner !== owner) return fail(403, 'forbidden')
  const isOwner = who.role === 'owner'

  if (kind === 'devices') {
    if (!isOwner) return fail(403, 'forbidden')
    if (method === 'POST' && !name) {
      const body = await readJson(request)
      if (!body) return fail(400, 'invalid json')
      const { device } = body
      if (typeof device !== 'string' || !NAME.test(device)) return fail(400, 'invalid device name')
      await revokeDevice(env, owner, device)
      const { token, hash } = await saveToken(env, { owner, role: 'device', device })
      await env.BUCKET.put(`${owner}/devices/${device}`, hash)
      return json({ device, token }, 201)
    }
    if (method === 'DELETE' && name) return (await revokeDevice(env, owner, name)) ? empty(204) : fail(404, 'no such device')
    return fail(405, 'method not allowed')
  }

  if (kind === 'bundles' && name) {
    if (!NAME.test(name)) return fail(400, 'invalid audience name')
    const key = `${owner}/bundles/${name}.age`
    if (method === 'PUT') {
      if (!isOwner) return fail(403, 'forbidden')
      const body = await readBody(request)
      if (!body) return fail(413, 'too large')
      await env.BUCKET.put(key, body)
      return empty(204)
    }
    if (method === 'GET') {
      const object = await env.BUCKET.get(key)
      if (!object) return fail(404, 'no such bundle')
      const bytes = new Uint8Array(await object.arrayBuffer())
      const etag = `"${await sha256(bytes)}"`
      if (request.headers.get('if-none-match') === etag) return empty(304, { etag })
      return new Response(bytes, { headers: { etag, 'content-type': 'application/octet-stream' } })
    }
    return fail(405, 'method not allowed')
  }

  if (kind === 'inbox') {
    if (method === 'POST' && !name) {
      const body = await readBody(request)
      if (!body) return fail(413, 'too large')
      const id = `${String(Date.now()).padStart(15, '0')}-${newToken().slice(0, 8)}`
      await env.BUCKET.put(`${owner}/inbox/${id}.age`, body)
      return json({ id }, 201)
    }
    if (!isOwner) return fail(403, 'forbidden')
    if (method === 'GET' && !name) return json({ ids: await listInbox(env, owner) })
    if (!INBOX_ID.test(name ?? '')) return fail(400, 'invalid id')
    const key = `${owner}/inbox/${name}.age`
    if (method === 'GET') {
      const object = await env.BUCKET.get(key)
      return object ? new Response(new Uint8Array(await object.arrayBuffer())) : fail(404, 'no such batch')
    }
    if (method === 'DELETE') {
      await env.BUCKET.delete(key)
      return empty(204)
    }
    return fail(405, 'method not allowed')
  }

  return fail(404, 'not found')
}
