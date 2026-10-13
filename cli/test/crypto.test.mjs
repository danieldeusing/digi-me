import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newIdentity, recipientOf, encryptTo, decryptWith } from '../src/crypto.mjs'

test('every recipient can decrypt, a stranger cannot', async () => {
  const [a, b, stranger] = await Promise.all([newIdentity(), newIdentity(), newIdentity()])
  assert.match(a, /^AGE-SECRET-KEY-1/)
  const bytes = await encryptTo('hello', [await recipientOf(a), await recipientOf(b)])
  assert.equal(await decryptWith(bytes, a), 'hello')
  assert.equal(await decryptWith(bytes, b), 'hello')
  await assert.rejects(decryptWith(bytes, stranger), /no identity matched/)
})

test('refuses to encrypt to nobody', async () => {
  await assert.rejects(encryptTo('hello', []), /no recipients/)
})
