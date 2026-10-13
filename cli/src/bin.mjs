import { run } from './main.mjs'

async function readStdin() {
  let text = ''
  process.stdin.setEncoding('utf8')
  for await (const chunk of process.stdin) text += chunk
  return text
}

const argv = process.argv.slice(2)
const stdin = argv[0] === 'answer' || argv.includes('-') ? await readStdin() : ''
try {
  await run(argv, { out: (line) => console.log(line), stdin })
} catch (err) {
  console.error(`digi-me: ${err.message}`)
  process.exit(1)
}
