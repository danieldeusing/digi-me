import { parseArgs } from 'node:util'
import { init, deviceAdd, deviceRemove, build, publish, inbox } from './commands/owner.mjs'
import { login, pull, answer } from './commands/device.mjs'
import { status } from './commands/status.mjs'

const COMMANDS = { init, 'device add': deviceAdd, 'device remove': deviceRemove, build, publish, inbox, login, pull, answer, status }
const OPTIONS = {
  relay: { type: 'string' }, 'admin-token': { type: 'string' }, owner: { type: 'string' },
  device: { type: 'string' }, audiences: { type: 'string' }, join: { type: 'string' },
}

export async function run(argv, io) {
  const { values, positionals } = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true })
  const two = positionals.slice(0, 2).join(' ')
  const [name, rest] = COMMANDS[two] ? [two, positionals.slice(2)] : [positionals[0], positionals.slice(1)]
  const command = COMMANDS[name]
  if (!command) throw new Error(`usage: digi-me <${Object.keys(COMMANDS).join('|')}>`)
  await command({ positionals: rest, values }, io)
}
