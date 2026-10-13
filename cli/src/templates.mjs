export const audiencesTemplate = ({ owner, device, key }) => `# Who may see what. The rules: digi-me spec, section 17.3.
owner: ${owner}
devices:
  ${device}: ${key}
audiences:
  my-agents:   { members: [${device}], circle: any, interview: true }
  work-agents: { members: [${device}], circle: arbeit }
`

export const DOMAINS_TEMPLATE = `# Coverage map. One line per domain: - id | description | target answers | default circles (spec §17.4)
- identity | name, home, languages, life basics | 15 | familie beste-freunde freunde arbeitsfreunde arbeit
- communication | tone, length and language per context | 20 | familie beste-freunde freunde arbeitsfreunde arbeit
- voice | how you write and talk, with samples | 15 | familie beste-freunde freunde arbeitsfreunde arbeit
- work | job, projects, ways of working | 25 | familie beste-freunde freunde arbeitsfreunde arbeit firmen
- tech-taste | tools, stacks, code style | 20 | familie beste-freunde freunde arbeitsfreunde arbeit firmen
- learning | what you learn and how | 10 | familie beste-freunde freunde arbeitsfreunde arbeit
- food | what you eat and drink | 20 | familie beste-freunde freunde arbeitsfreunde
- media | music, film, books, games | 30 | familie beste-freunde freunde arbeitsfreunde
- travel-places | places you love and want to see | 20 | familie beste-freunde freunde arbeitsfreunde
- home-routines | daily life, habits, home | 15 | familie beste-freunde freunde arbeitsfreunde
- values-decisions | what matters, how you decide | 20 | familie beste-freunde freunde
- shopping-brands | what you buy and why | 15 | familie beste-freunde freunde arbeitsfreunde
- humor | what makes you laugh | 10 | familie beste-freunde freunde arbeitsfreunde
- pet-peeves | what annoys you | 10 | familie beste-freunde freunde arbeitsfreunde
- health-sport | health and sport | 15 | familie beste-freunde
- people | the people in your life | 10 | familie beste-freunde
`

export const GITIGNORE_TEMPLATE = '.build/\n'
