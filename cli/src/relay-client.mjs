export function relay(cfg) {
  async function call(method, path, { body, token = cfg.token, headers = {} } = {}) {
    const res = await fetch(`${cfg.relay}/v1${path}`, { method, body, signal: AbortSignal.timeout(15000), headers: { authorization: `Bearer ${token}`, ...headers } })
    if (res.status >= 400) {
      const err = new Error(`relay ${method} ${path}: ${res.status} ${await res.text()}`)
      err.status = res.status
      throw err
    }
    return res
  }
  const jsonBody = (value) => ({ body: JSON.stringify(value), headers: { 'content-type': 'application/json' } })
  const base = `/${cfg.owner}`
  return {
    createOwner: async (owner, adminToken) => (await call('POST', '/owners', { ...jsonBody({ owner }), token: adminToken })).json(),
    createDevice: async (device) => (await call('POST', `${base}/devices`, jsonBody({ device }))).json(),
    revokeDevice: (device) => call('DELETE', `${base}/devices/${device}`),
    putBundle: (audience, bytes) => call('PUT', `${base}/bundles/${audience}`, { body: bytes }),
    async getBundle(audience, etag) {
      const res = await call('GET', `${base}/bundles/${audience}`, { headers: etag ? { 'if-none-match': etag } : {} })
      if (res.status === 304) return null
      return { etag: res.headers.get('etag'), bytes: new Uint8Array(await res.arrayBuffer()) }
    },
    postInbox: async (bytes) => (await call('POST', `${base}/inbox`, { body: bytes })).json(),
    listInbox: async () => (await call('GET', `${base}/inbox`)).json(),
    getInbox: async (id) => new Uint8Array(await (await call('GET', `${base}/inbox/${id}`)).arrayBuffer()),
    deleteInbox: (id) => call('DELETE', `${base}/inbox/${id}`),
  }
}
