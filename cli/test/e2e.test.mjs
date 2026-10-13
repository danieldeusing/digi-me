import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { handle } from '../../relay/src/handler.mjs'
import { r2 } from '../../relay/test/r2-stub.mjs'
import { run } from '../src/main.mjs'

const env = { BUCKET: r2(), ADMIN_TOKEN: 'admin-secret' }
globalThis.fetch = async (url, init) => handle(new Request(url, init), env)

const temp = (name) => mkdtempSync(join(tmpdir(), name))
const homeA = temp('digi-a-')
const homeB = temp('digi-b-')
const data = join(temp('digi-data-'), 'digi-daniel')

async function as(home, argv, stdin = '') {
  process.env.DIGI_ME_HOME = home
  const out = []
  await run(argv, { out: (line) => out.push(line), stdin })
  return out
}

test('owner and a second device exchange bundles and answers', async () => {
  await as(homeA, ['init', data, '--relay', 'https://relay.test', '--admin-token', 'admin-secret', '--device', 'ddStudio'])
  assert.ok(existsSync(join(data, '.git')))
  writeFileSync(join(data, 'facts', 'food.md'), [
    '- Likes dark roast. {id: f-1, sees: [familie, beste-freunde, freunde, arbeitsfreunde], c: 0.9, t: 2026-10, a: [a-1]}',
    '- Is afraid of flying. {id: f-2, sees: [familie, beste-freunde], c: 1, t: 2026-10, a: [a-2]}',
    '',
  ].join('\n'))
  writeFileSync(join(data, 'facts', 'communication.md'), '- Writes plain English. {id: f-3, sees: [familie, beste-freunde, freunde, arbeitsfreunde, arbeit], c: 0.5, t: 2026-10, a: [seed], core: true}\n')
  assert.deepEqual(await as(homeA, ['publish']), ['published my-agents v1 to ddStudio', 'published work-agents v1 to ddStudio'])

  const [key] = await as(homeB, ['login'])
  assert.match(key, /^age1/)
  const [joinCode] = await as(homeA, ['device', 'add', 'ddAir', key, '--audiences', 'my-agents'])
  await as(homeB, ['login', '--join', joinCode])
  assert.deepEqual(await as(homeB, ['pull']), ['my-agents: v2'])
  const cache = join(homeB, '.digi-me', 'bundles', 'my-agents')
  assert.match(readFileSync(join(cache, 'core.md'), 'utf8'), /Writes plain English/)
  assert.match(readFileSync(join(cache, 'food.md'), 'utf8'), /afraid of flying/)
  assert.ok(existsSync(join(cache, 'interview.json')))
  assert.deepEqual(await as(homeB, ['pull']), [])

  const entry = { id: 'a-9', domain: 'food', topic: 'coffee', skipped: false }
  await as(homeB, ['answer'], JSON.stringify(entry) + '\n')
  assert.deepEqual(await as(homeA, ['inbox']), ['inbox: 1 batches, 1 new answers'])
  const month = new Date().toISOString().slice(0, 7)
  assert.deepEqual(JSON.parse(readFileSync(join(data, 'answers', `${month}.jsonl`), 'utf8').trim()), entry)

  const status = await as(homeA, ['status'])
  assert.ok(status.includes(`${'food'.padEnd(18)}   1/20`))
  assert.ok(status.includes('coverage 0 %'))

  await as(homeA, ['device', 'remove', 'ddAir'])
  await assert.rejects(as(homeB, ['pull']), (err) => err.status === 401)
})

test('owner-only commands refuse to run on another device', async () => {
  const home = temp('digi-c-')
  const [key] = await as(home, ['login'])
  const [joinCode] = await as(homeA, ['device', 'add', 'ddPhone', key, '--audiences', 'work-agents'])
  await as(home, ['login', '--join', joinCode])
  await assert.rejects(as(home, ['publish']), /runs on the owner device only/)
})

test('an unknown command prints the usage', async () => {
  await assert.rejects(as(homeA, ['fly']), /usage: digi-me </)
})
