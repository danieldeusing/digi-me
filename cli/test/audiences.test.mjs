import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseAudiences } from '../src/audiences.mjs'

const BASE = `owner: daniel
devices:
  ddStudio: age1aaa
audiences:
  my-agents: { members: [ddStudio], circle: any, interview: true }
`

test('parses owner, devices and audiences', () => {
  const { owner, devices, audiences } = parseAudiences(BASE)
  assert.equal(owner, 'daniel')
  assert.deepEqual(devices, { ddStudio: 'age1aaa' })
  assert.equal(audiences['my-agents'].circle, 'any')
})

test('refuses an unknown member', () => {
  assert.throws(() => parseAudiences(BASE.replace('[ddStudio]', '[ddAir]')), /my-agents: unknown member ddAir/)
})

test('an audience needs circle any or a known circle', () => {
  assert.throws(() => parseAudiences(BASE.replace('circle: any', 'circle: nachbarn')), /audiences\.yaml: my-agents: circle must be any or one of familie/)
  assert.throws(() => parseAudiences(BASE.replace('circle: any, ', '')), /audiences\.yaml: my-agents: circle must be any or one of/)
  assert.equal(parseAudiences(BASE.replace('circle: any', 'circle: arbeit')).audiences['my-agents'].circle, 'arbeit')
})

test('there are no built-in audiences', () => {
  assert.deepEqual(Object.keys(parseAudiences(BASE).audiences), ['my-agents'])
})

test('refuses a device without an age public key', () => {
  assert.throws(() => parseAudiences(BASE.replace('age1aaa', 'ssh-ed25519 AAA')), /device ddStudio needs an age1/)
})

test('refuses a missing owner', () => {
  assert.throws(() => parseAudiences('devices: {}\n'), /owner missing or invalid/)
})
