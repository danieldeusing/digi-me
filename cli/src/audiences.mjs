import { parse } from 'yaml'
import { CIRCLES } from './circles.mjs'

export const NAME = /^[A-Za-z0-9][A-Za-z0-9-]{0,62}$/

export function parseAudiences(text) {
  const doc = parse(text) ?? {}
  if (!doc.owner || !NAME.test(doc.owner)) throw new Error('audiences.yaml: owner missing or invalid')
  const devices = doc.devices ?? {}
  for (const [name, key] of Object.entries(devices)) {
    if (!NAME.test(name)) throw new Error(`audiences.yaml: invalid device name ${name}`)
    if (typeof key !== 'string' || !key.startsWith('age1')) throw new Error(`audiences.yaml: device ${name} needs an age1… public key`)
  }
  const audiences = doc.audiences ?? {}
  for (const [name, audience] of Object.entries(audiences)) {
    if (!NAME.test(name)) throw new Error(`audiences.yaml: invalid audience name ${name}`)
    if (audience?.circle !== 'any' && !CIRCLES.includes(audience?.circle)) {
      throw new Error(`audiences.yaml: ${name}: circle must be any or one of ${CIRCLES.join(', ')}`)
    }
    for (const member of audience.members ?? []) {
      if (!devices[member]) throw new Error(`audiences.yaml: ${name}: unknown member ${member}`)
    }
  }
  return { owner: doc.owner, devices, audiences }
}
