import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, mkdtempSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { paths, readConfig, writeConfig, readKey, writeKey, encodeJoin, decodeJoin } from '../src/config.mjs'

beforeEach(() => { process.env.DIGI_ME_HOME = mkdtempSync(join(tmpdir(), 'digi-config-')) })

test('paths follow DIGI_ME_HOME', () => {
  assert.equal(paths().config, join(process.env.DIGI_ME_HOME, '.config', 'digi-me', 'config.json'))
  assert.equal(paths().cache, join(process.env.DIGI_ME_HOME, '.digi-me', 'bundles'))
})

test('config and key are private files', () => {
  writeConfig({ relay: 'https://r', owner: 'daniel' })
  writeKey('AGE-SECRET-KEY-1TEST')
  assert.deepEqual(readConfig(), { relay: 'https://r', owner: 'daniel' })
  assert.equal(readKey(), 'AGE-SECRET-KEY-1TEST')
  assert.equal(statSync(paths().config).mode & 0o777, 0o600)
  assert.equal(statSync(paths().key).mode & 0o777, 0o600)
})

test('a rewrite tightens an existing wide-mode file and folder', () => {
  mkdirSync(paths().dir, { recursive: true })
  chmodSync(paths().dir, 0o755)
  writeFileSync(paths().config, '{}', { mode: 0o644 })
  chmodSync(paths().config, 0o644)
  writeConfig({ relay: 'https://r', owner: 'daniel' })
  assert.equal(statSync(paths().config).mode & 0o777, 0o600)
  assert.equal(statSync(paths().dir).mode & 0o777, 0o700)
})

test('a key is never overwritten', () => {
  writeKey('AGE-SECRET-KEY-1ONE')
  assert.throws(() => writeKey('AGE-SECRET-KEY-1TWO'), /EEXIST/)
})

test('a missing config says what to run', () => {
  assert.throws(() => readConfig(), /run `digi-me init` or `digi-me login --join <code>` first/)
})

test('the join code round-trips and drops other fields', () => {
  const values = { relay: 'https://r', owner: 'daniel', device: 'ddAir', token: 't', ownerKey: 'age1x', audiences: ['my-agents'] }
  assert.deepEqual(decodeJoin(encodeJoin({ ...values, data: '/secret/path' })), values)
})

test('a join code keeps only the join fields', () => {
  const values = { relay: 'https://r', owner: 'daniel', device: 'ddAir', token: 't', ownerKey: 'age1x', audiences: ['my-agents'] }
  const code = Buffer.from(JSON.stringify({ ...values, data: '/secret/path' })).toString('base64url')
  assert.deepEqual(decodeJoin(code), values)
})

test('a join code with audiences that are not an array of strings is refused', () => {
  const values = { relay: 'https://r', owner: 'daniel', device: 'ddAir', token: 't', ownerKey: 'age1x', audiences: ['my-agents'] }
  const code = (v) => Buffer.from(JSON.stringify(v)).toString('base64url')
  assert.throws(() => decodeJoin(code({ ...values, audiences: 'x' })), /invalid join code: audiences missing or invalid/)
})

test('a join code with a null token is refused', () => {
  const values = { relay: 'https://r', owner: 'daniel', device: 'ddAir', token: 't', ownerKey: 'age1x', audiences: ['my-agents'] }
  const code = Buffer.from(JSON.stringify({ ...values, token: null })).toString('base64url')
  assert.throws(() => decodeJoin(code), /invalid join code: token missing or invalid/)
})

test('an invalid join code is refused', () => {
  assert.throws(() => decodeJoin('nonsense'), /invalid join code/)
  assert.throws(() => decodeJoin(Buffer.from('{"relay":"https://r"}').toString('base64url')), /invalid join code: owner missing/)
})
