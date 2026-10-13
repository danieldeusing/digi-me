// The plugin's wiring against Claude Code's own test kit: env -u CLAUDECODE claude plugin test .
// The files, the store and `digi-me pull` are stubs; nothing leaves the test.
import { expect, mock, test } from 'claude-code/testing'

const HOME = '/Users/test'
const BUNDLES = HOME + '/.digi-me/bundles'
const WORK = { options: { workPaths: '~/Work/client/**' } }
const PERSONAL_DIR = HOME + '/Work/danieldeusing/notes'
const WORK_DIR = HOME + '/Work/client/app'
const MY_CORE = '- Writes plain English. {id: f-1, sees: [familie, beste-freunde, freunde, arbeitsfreunde], c: 1, t: 2026-10}\n'
const WORK_CORE = '- Reviews before lunch. {id: f-9, sees: [alle], c: 1, t: 2026-10}\n'

const COMPOSE = { model: 'claude-opus-5-5', promptModel: 'claude-opus-5-5', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [] }

type Pull = { exitCode: number; stdout: string; stderr: string }

// Stands in for Claude Code: an in-memory file system and store, a scripted `digi-me pull`.
function engine(on: any, cwd: string, files: Record<string, string> = {}, pull: Pull = { exitCode: 0, stdout: '', stderr: '' }, root = cwd) {
  const store = new Map<string, unknown>()
  const toasts: string[] = []
  const pulls: string[][] = []
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 10) })
  const at = { cwd, root }
  const list = (path: string) =>
    Object.keys(files)
      .filter((f) => f.startsWith(path + '/') && !f.slice(path.length + 1).includes('/'))
      .map((f) => ({ name: f.slice(path.length + 1), kind: 'file', size: files[f].length, isLink: false }))
  on('env.get', ($: any, e: any) => ({ value: e.name === 'HOME' ? HOME : undefined }))
  on('session.cwd', () => ({ value: at.cwd }))
  on('session.root', () => ({ value: at.root }))
  on('store.get', ($: any, e: any) => ({ value: store.get(e.key) }))
  on('store.set', ($: any, e: any) => (store.set(e.key, e.value), { value: undefined }))
  on('fs.list', ($: any, e: any) => (list(e.path).length ? { value: list(e.path) } : { deny: 'no such folder ' + e.path }))
  on('fs.read', ($: any, e: any) => (e.path in files ? { value: files[e.path] } : { deny: 'cannot read ' + e.path }))
  on('process.run', ($: any, e: any) => (pulls.push([...e.argv]), { value: pull }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.toast', ($: any, e: any) => (toasts.push(e.text), { value: undefined }))
  on('session.start', () => ({ cwd }))
  on('prompt.compose', () => ({ sections: [] }))
  // what `/cd` does: the session and its project root move
  const move = (dir: string) => Object.assign(at, { cwd: dir, root: dir })
  return { toasts, pulls, clock, move }
}

async function core($: any, clock: any, cwd: string) {
  await $.session.start({ cwd, surface: 'terminal', isInteractive: true })
  await clock.settle()
  const { sections } = await $.prompt.compose(COMPOSE)
  return sections.find((s: any) => s.id === 'digi-me:core')
}

const cached = (audience: string, text: string) => ({ [`${BUNDLES}/${audience}/core.md`]: text })

test('a personal session gets the my-agents core', WORK, async ($, on) => {
  const { clock, pulls } = engine(on, PERSONAL_DIR, { ...cached('my-agents', MY_CORE), ...cached('work-agents', WORK_CORE) })
  const section = await core($, clock, PERSONAL_DIR)
  expect(section?.text).toContain('digi-me audience: my-agents')
  expect(section?.text).toContain(MY_CORE.trim())
  expect(section?.scope).toBe('session')
  expect(pulls.map((argv) => argv.at(-1))).toEqual(['pull'])
})

test('a work session gets the work-agents core', WORK, async ($, on) => {
  const { clock } = engine(on, WORK_DIR, { ...cached('my-agents', MY_CORE), ...cached('work-agents', WORK_CORE) })
  const section = await core($, clock, WORK_DIR)
  expect(section?.text).toContain('digi-me audience: work-agents')
  expect(section?.text).toContain(WORK_CORE.trim())
  expect(section?.text).not.toContain(MY_CORE.trim())
})

test('a work session with only the my-agents bundle cached gets no section', WORK, async ($, on) => {
  const { clock } = engine(on, WORK_DIR, cached('my-agents', MY_CORE))
  expect(await core($, clock, WORK_DIR)).toBeUndefined()
})

test('a session whose project root is a work folder counts as work', WORK, async ($, on) => {
  const { clock } = engine(on, PERSONAL_DIR, cached('my-agents', MY_CORE), undefined, WORK_DIR)
  expect(await core($, clock, PERSONAL_DIR)).toBeUndefined()
})

test('the audience follows the session to a work folder on the next prompt', WORK, async ($, on) => {
  const { clock, move } = engine(on, PERSONAL_DIR, { ...cached('my-agents', MY_CORE), ...cached('work-agents', WORK_CORE) })
  expect((await core($, clock, PERSONAL_DIR))?.text).toContain('digi-me audience: my-agents')
  move(WORK_DIR)
  const { sections } = await $.prompt.compose(COMPOSE)
  const section = sections.find((s: any) => s.id === 'digi-me:core')
  expect(section?.text).toContain('digi-me audience: work-agents')
  expect(section?.text).not.toContain(MY_CORE.trim())
})

test('without a cache there is no section', WORK, async ($, on) => {
  const { clock } = engine(on, PERSONAL_DIR)
  expect(await core($, clock, PERSONAL_DIR)).toBeUndefined()
})

test('a device without a config pulls silently', WORK, async ($, on) => {
  const { clock, toasts } = engine(on, PERSONAL_DIR, cached('my-agents', MY_CORE), { exitCode: 1, stdout: '', stderr: 'digi-me: no config at /Users/test/.config/digi-me\n' })
  expect(await core($, clock, PERSONAL_DIR)).toBeDefined()
  expect(toasts).toEqual([])
})

test('a pull that drops a bundle says so', WORK, async ($, on) => {
  const stdout = 'my-agents: up to date\nwork-agents: cannot decrypt, cache removed\n'
  const { clock, toasts } = engine(on, PERSONAL_DIR, cached('my-agents', MY_CORE), { exitCode: 0, stdout, stderr: '' })
  await core($, clock, PERSONAL_DIR)
  expect(toasts).toEqual(['digi-me: work-agents: cannot decrypt, cache removed'])
})
