export function r2() {
  const store = new Map()
  const object = (bytes) => ({
    text: async () => new TextDecoder().decode(bytes),
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  })
  return {
    store,
    async get(key) { return store.has(key) ? object(store.get(key)) : null },
    async head(key) { return store.has(key) ? {} : null },
    async put(key, value) { store.set(key, typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value)) },
    async delete(key) { store.delete(key) },
    async list({ prefix = '' } = {}) {
      return { objects: [...store.keys()].filter((k) => k.startsWith(prefix)).sort().map((key) => ({ key })), truncated: false }
    },
  }
}
