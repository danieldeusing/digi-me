import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadData } from '../bundle.mjs'
import { answerCounts, coverage } from '../coverage.mjs'
import { paths, readConfig } from '../config.mjs'
import { relay } from '../relay-client.mjs'

export async function status(_, io) {
  const cfg = readConfig()
  if (cfg.data) {
    const data = loadData(cfg.data)
    const counts = answerCounts(data.answers)
    for (const d of data.domains) io.out(`${d.id.padEnd(18)} ${String(Math.min(counts[d.id] ?? 0, d.target)).padStart(3)}/${d.target}`)
    io.out(`coverage ${Math.round(coverage(data.domains, counts) * 100)} %`)
    const versionFile = join(cfg.data, '.build', 'version')
    io.out(`published version ${existsSync(versionFile) ? readFileSync(versionFile, 'utf8').trim() : 'none'}`)
    const { ids } = await relay(cfg).listInbox()
    io.out(`inbox: ${ids.length} batches waiting`)
  }
  for (const audience of cfg.audiences) {
    const metaFile = join(paths().cache, audience, 'meta.json')
    const meta = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, 'utf8')) : null
    io.out(`${audience}: ${meta ? `v${meta.version} (${meta.published})` : 'not cached'}`)
  }
}
