import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { NAME } from './audiences.mjs'

export function paths() {
  const home = process.env.DIGI_ME_HOME ?? homedir()
  const dir = join(home, '.config', 'digi-me')
  return { dir, key: join(dir, 'key.txt'), config: join(dir, 'config.json'), cache: join(home, '.digi-me', 'bundles') }
}

export function writePrivate(file, text, flag = 'w') {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  writeFileSync(file, text, { mode: 0o600, flag })
  chmodSync(file, 0o600)
  chmodSync(dirname(file), 0o700)
}

export function readConfig() {
  const file = paths().config
  if (!existsSync(file)) throw new Error('no config: run `digi-me init` or `digi-me login --join <code>` first')
  return JSON.parse(readFileSync(file, 'utf8'))
}

export const writeConfig = (cfg) => writePrivate(paths().config, JSON.stringify(cfg, null, 2) + '\n')

export function readKey() {
  const file = paths().key
  if (!existsSync(file)) throw new Error('no key: run `digi-me login` first')
  return readFileSync(file, 'utf8').trim()
}

export const writeKey = (identity) => writePrivate(paths().key, identity + '\n', 'wx')

const JOIN_FIELDS = ['relay', 'owner', 'device', 'token', 'ownerKey', 'audiences']

export const encodeJoin = (values) =>
  Buffer.from(JSON.stringify(Object.fromEntries(JOIN_FIELDS.map((k) => [k, values[k]])))).toString('base64url')

const isText = (v) => typeof v === 'string' && v.length > 0
export function isRelayUrl(url) {
  try {
    const { protocol, hostname } = new URL(url)
    return protocol === 'https:' || (protocol === 'http:' && ['localhost', '127.0.0.1'].includes(hostname))
  } catch { return false }
}

const isName = (v) => typeof v === 'string' && NAME.test(v)
const isJoinValue = (k, v) => {
  if (k === 'audiences') return Array.isArray(v) && v.length > 0 && v.every(isName)
  if (k === 'relay') return isText(v) && isRelayUrl(v)
  if (k === 'owner' || k === 'device') return isName(v)
  return isText(v)
}

export function decodeJoin(code) {
  let values
  try { values = JSON.parse(Buffer.from(code, 'base64url').toString('utf8')) } catch { throw new Error('invalid join code') }
  if (!values || typeof values !== 'object') throw new Error('invalid join code')
  for (const k of JOIN_FIELDS) if (!isJoinValue(k, values[k])) throw new Error(`invalid join code: ${k} missing or invalid`)
  return Object.fromEntries(JOIN_FIELDS.map((k) => [k, values[k]]))
}
