# digi-me — design

Date: 2026-10-09. Status: approved (revision 4); revision 5 (2026-10-10) records the rulings of
plan 1's execution: §6.1, §8.1, §11, §12 and §15.
Revision 6 (2026-10-10) adds §16, the rulings for plan 2; where §16 and §4–§8 differ, §16 wins.
Revision 7 (2026-10-12) adds §17, visibility circles. They replace the sensitivity levels
everywhere; where §17 and any earlier section differ, §17 wins.

## 1. Goal

A digital me: one private source of truth about a person, used by every agent, chat and app
that the person allows. It grows through an interview: Capi, the capybara of the capi mod,
asks the questions inside Claude Code. The same interview can teach a language on the way
(for Daniel: Brazilian Portuguese).

The data belongs to its owner. The service in the middle, the relay, stores ciphertext only.
Anybody can fork `digi-me` and replace each part.

## 2. Phases

| Phase | Scope | For |
|---|---|---|
| **1** (this spec in detail) | data model, CLI, relay, Claude Code plugin with the interview deck, seedr-internal | Daniel |
| 2 | Codex, Copilot, OpenCode, Hermes; chat exports; QR pairing; open-source release | Daniel, then everyone |
| 3 | phone app (one-click setup, friends, chat with digis, on-device LLM), web widget | everyone |

Phase 1 builds the data provider for real (keys, encrypted bundles, relay API). Phases 2 and
3 add consumers. They need no data migration.

## 3. Repos

| Repo | Visibility | Holds |
|---|---|---|
| **`digi-me`** | public | all code: CLI, relay, Claude Code plugin, skills, later the packaging for other clients and the app |
| **`digi-daniel`** | private | Daniel's data only: facts, audiences, coverage map, answer archive. No code. |
| `capi-cc-mod` | public | gets a deck extension point (section 8.1). No personal data. |

Everyone else makes their own `digi-<name>` data repo with `digi-me init`.

## 4. Data model

### 4.1 The data repo `digi-<name>`

```
facts/<domain>.md        # one bullet per fact, with labels
audiences.yaml           # members (devices) and rules
domains.md               # the coverage map (section 4.5)
answers/<YYYY-MM>.jsonl  # archive of interview answers, written by `digi-me inbox`
```

### 4.2 Facts

One bullet per fact. The domain is the file name. The labels follow in braces:

```
- Prefers dark roast espresso over filter coffee. {id: f-81c2, s: personal, c: 0.9, t: 2026-10, a: [a-3f2k]}
- Plays poker every Friday with old school friends. {id: f-90aa, s: personal, c: 1, t: 2026-10, a: [a-77qe], deny: [work-agents]}
- Writes short, plain technical English. {id: f-12b0, s: personal, c: 0.5, t: 2026-10, a: [seed], core: true}
```

| Label | Meaning |
|---|---|
| `id` | stable fact id |
| `s` | sensitivity: `public` < `personal` < `private` < `only-me` |
| `c` | confidence, 0 to 1 |
| `t` | month last confirmed |
| `a` | answer ids or `seed` |
| `core` | optional; always loaded (section 7.1) |
| `allow`, `deny` | optional; audiences that this fact reaches or never reaches, whatever the rules say. `deny` wins over `allow`. An audience name that `audiences.yaml` does not define stops the build. |

### 4.3 Audiences and rules (`audiences.yaml`)

```yaml
owner: daniel
devices:
  ddStudio: age1qq…      # public keys only
  ddAir:    age1zz…
audiences:
  only-me:     { builtin: true }                    # never published
  my-agents:   { members: [ddStudio, ddAir], max: private, interview: true }
  work-agents: { members: [ddStudio, ddAir], max: personal,
                 domains: [identity, communication, voice, work, tech-taste, learning] }
  public:      { builtin: true, max: public }        # built, but has no members in phase 1
```

Rules for building the bundle of one audience:
1. Start with no facts (default deny).
2. Take each fact whose `s` is at most the audience's `max`.
3. If the audience lists `domains`, keep only those. If it lists `deny-domains`, drop those.
4. Apply the fact's own `allow` and `deny`. They win over the rules.
5. `only-me` facts never enter a bundle, whatever `allow` says. `only-me` is not a valid
   name in `allow`.

Phases 2 and 3 add members of other kinds (`hermes`, `app:<account>`, `web`). The rules stay
the same.

### 4.4 Bundles

`digi-me build` compiles one bundle for every audience except `only-me`. It is deterministic:
no LLM, no time stamp, the same input gives the same bytes.

```json
{ "owner": "daniel", "audience": "work-agents",
  "core": "- Writes short, plain technical English. {id: f-12b0, s: personal, c: 0.5, t: 2026-10}\n…",
  "domains": { "work": "- … {id: …, s: …, c: …, t: …}\n", "voice": "…" },
  "interview": null }
```

- `core`: the `core: true` facts that this audience may see.
- `domains`: the other facts, one Markdown string per domain. Each fact keeps the labels `id`,
  `s`, `c` and `t`; `a`, `allow`, `deny` and `core` are dropped.
- `interview`: only for an audience with `interview: true` (for Daniel: `my-agents`). It holds
  the coverage map, the answer count per domain (skipped answers do not count) and the `stop`
  topics, so that devices without the data repo can run the interview deck.
- `publish` adds `version` (one more than the last publish, kept in `.build/version`) and
  `published` (the time) before it encrypts. It uploads only bundles whose audience has
  members. In phase 1, `public` has none, so it is built and not uploaded.

### 4.5 Coverage map (`domains.md`)

One line per domain: id, a short description, target answer count, default sensitivity. The
interview deck reads it (section 8.2). `digi-me init` writes this starting list:

| id | target | default `s` |
|---|---|---|
| identity | 15 | personal |
| communication | 20 | personal |
| voice (how the person writes and talks, with samples) | 15 | personal |
| work | 25 | personal |
| tech-taste | 20 | personal |
| learning | 10 | personal |
| food | 20 | personal |
| media (music, film, books, games) | 30 | personal |
| travel-places | 20 | personal |
| home-routines | 15 | personal |
| values-decisions | 20 | personal |
| shopping-brands | 15 | personal |
| humor | 10 | personal |
| pet-peeves | 10 | personal |
| health-sport | 15 | private |
| people | 10 | private |

Coverage is the sum of `min(answers, target)` divided by the sum of targets. Skipped answers
do not count.

## 5. Keys and the relay

### 5.1 Keys

- Every device has an [age](https://age-encryption.org) key pair in
  `~/.config/digi-me/key.txt` (mode 0600). Its public key is listed under `devices`.
- The **owner key** is the key of the device that runs distill (for Daniel: ddStudio). Answers
  are encrypted to it. Daniel keeps a backup of it in a password manager, written straight
  from the file, never printed.
- A bundle is encrypted to the public keys of all members of its audience. age supports many
  recipients per file.
- Removing a device from an audience takes effect with the next publish. The device keeps what
  it already downloaded.

### 5.2 The relay (Cloudflare Worker + R2, in `digi-me/relay/`)

The relay stores no plaintext content: only ciphertext and token hashes. It cannot read a
bundle or an answer.

| Method and path | Token | Does |
|---|---|---|
| `POST /v1/owners` | admin | creates an owner, returns the owner token |
| `POST /v1/<owner>/devices` | owner | creates a device token |
| `DELETE /v1/<owner>/devices/<device>` | owner | revokes a device token |
| `PUT /v1/<owner>/bundles/<audience>` | owner | stores a bundle (ciphertext, at most 1 MB) |
| `GET /v1/<owner>/bundles/<audience>` | device or owner | returns the bundle. `ETag` is the SHA-256 of the ciphertext; `If-None-Match` gives `304` |
| `POST /v1/<owner>/inbox` | device or owner | stores one encrypted answer batch, returns its id |
| `GET /v1/<owner>/inbox` | owner | lists the batches |
| `GET` / `DELETE /v1/<owner>/inbox/<id>` | owner | reads or removes one batch |

- Tokens are 32 random bytes. The relay stores only their SHA-256 hash in R2
  (`tokens/<hash>` → `{ owner, role, device }`). The admin token is a Worker secret.
- R2 layout: `<owner>/bundles/<audience>.age`, `<owner>/inbox/<id>.age`.
- The relay sees metadata: owner ids, device names, sizes and times. It sees no content.
- Cost: bundles are a few KB. The Cloudflare free tier (R2: 10 GB, 1 M writes and 10 M reads
  a month, no egress fees; Workers: 100 k requests a day) carries phase 1 and much more.
- Host for Daniel: a host name on Daniel's Cloudflare account (`<relay host>`), deployed with
  `wrangler`. A fork deploys the same Worker under its own account. Any other host that
  implements this table works too.

## 6. The CLI `digi-me`

Node 20 or newer. One bundled file, `cli/dist/digi-me.mjs`, built with esbuild. Its only
libraries are `age-encryption` (the TypeScript age implementation) and `yaml`, both inside the
bundle, so nothing is installed at run time. The plugin ships the file.

### 6.1 Commands

| Command | Runs on | Does |
|---|---|---|
| `init <folder> --relay <url> --admin-token <token>` | owner device | creates the data repo from templates, makes the owner key, registers the owner at the relay with the admin token (used once, never stored), writes `~/.config/digi-me/config.json` |
| `login` | new device | makes the device key and prints its public key |
| `device add <name> <public key> --audiences a,b` | owner device | adds the device to `audiences.yaml`, creates its relay token, prints a **join code**, then runs `publish` |
| `login --join <code>` | new device | stores the join code's values in `config.json` |
| `device remove <name>` | owner device | removes it from `audiences.yaml`, revokes the token, runs `publish` |
| `build` | owner device | compiles the bundles (section 4.4) into `.build/` (git-ignored) |
| `publish` | owner device | `build`, encrypts each bundle to its members, uploads it |
| `pull` | any device | downloads the bundles of the audiences in `config.json`, decrypts them, writes `~/.digi-me/bundles/<audience>/core.md`, `<domain>.md` and `interview.json` (mode 0600); skips a bundle whose `ETag` did not change |
| `answer` | any device | reads answer entries from stdin, encrypts them to the owner key, posts them to the inbox |
| `inbox` | owner device | downloads all batches, decrypts them, appends them in arrival order to `answers/<YYYY-MM>.jsonl` (the month of arrival), then deletes them at the relay |
| `status` | any device | on the owner device: coverage per domain, bundle versions, batches waiting in the inbox. On other devices: the version of each cached bundle. |

`config.json` holds:
- `relay`, `owner`, `device`;
- `token`: the owner token on the owner device, a device token on every other device;
- `ownerKey`: the owner's public key, for `answer`;
- `audiences`: the audiences this device is a member of, for `pull`;
- `data`: the path of the data repo, on the owner device only.

The join code is these values (without `data`) as one base64 string. A token appears in
output only inside the join code, once.

### 6.2 Which bundle a session gets

A device can be a member of several audiences. The Claude Code plugin picks one per session:
- `workPaths` (userConfig, a list of globs): a session whose folder matches gets
  `work-agents`. For example `~/Work/acme/**`.
- Every other session gets `my-agents`.

In phase 1 this split is a rule of the plugin, not of the encryption: both bundles are on the
same Mac. Real separation needs a device that is only in `work-agents`. The design allows
that, but Daniel has no such device now.

## 7. The Claude Code plugin `digi-me`

```
.claude-plugin/plugin.json        # hooks, skills, userConfig; dependencies: ["capi"] if spike 2 allows
.claude-plugin/marketplace.json
hooks/hooks.json                  # { "modules": ["./register.js"] }
hooks/register.js
hooks/lib/*.js                    # deck request and parse, coverage, CLI calls
skills/digi-me/SKILL.md           # the persona skill
skills/digi-me-setup/SKILL.md     # init or join a device
skills/digi-me-distill/SKILL.md   # seed and distill
cli/dist/digi-me.mjs
templates/                        # facts/, audiences.yaml, domains.md
```

### 7.1 Hooks

- `session.start`: run `digi-me pull` in the background with `$.process.run`. A failure
  shows a toast and keeps the last cache.
- `prompt.compose`: add one section, the `core.md` of this session's bundle (section 6.2),
  and one line that names the bundle folder for the skill. No bundle in the cache: no section.
- The capi deck noun (section 8.2).

### 7.2 Skills

- `digi-me`: the persona skill.
  - `description`: triggers on personal recommendations, writing in the owner's voice,
    planning for the owner, gifts, travel, food, media, and any task where the owner's taste
    matters.
  - Body: read the domain files the task needs from the folder that the `digi-me` section of
    the system prompt names.
  - Rule: never quote a `private` fact in work output (commits, merge requests, tickets, wiki
    pages, client documents).
- `digi-me-setup`: guides `init` on the first device, and `login` / `device add` /
  `login --join` on each further device.
- `digi-me-distill`: seed mode and distill mode (section 9).

### 7.3 userConfig

| Field | Default | Use |
|---|---|---|
| `workPaths` | `[]` | globs for `work-agents` sessions |
| `perDay` | 10 | new interview cards a day |
| `language` | `de` | interview language without learn mode, as a BCP 47 code |

## 8. Interview inside capi

### 8.1 Deck extension point (capi, public)

capi today has one card source. It gets a deck concept, and its facts become the built-in
deck `facts`.

- A deck is a noun on `$` that another plugin adds in `engine.create`. capi publishes the type
  contract `CapiDeck` in `types/index.d.ts`, named in its `plugin.json` as `types`.
- capi uses every loaded noun that matches `CapiDeck`. A new setting `CAPI_DECKS` can limit the
  list (default: all).
- A deck noun may hold **methods only** (spike 1: a data field makes `engine.create` fail and
  unloads the plugin). A deck has:
  - `describe()`: returns `{ id, label, icon, perDay, extras }`;
  - `request(ctx)`: the model request for the next batch. `ctx` holds the config, the date,
    the activity hint, `learn`, and the deck's last 30 entries;
  - `parse(text)`: cards from the model reply;
  - `record(entries)`: stores answer entries. capi keeps an entry in the store key
    `pending:<deck>` until `record` succeeds, and retries at the next sync;
  - in `describe()`: `perDay`, a daily cap of new cards, and `extras`, optional, which of the
    panels gram / conj / tradução the deck shows.
- The facts deck keeps its current log and iCloud sync unchanged.
- Store keys `queue` and `current` become `queue:<deck>` and `current:<deck>`. On first load,
  the old keys move to `facts`.
- New store key `mode`: `{ deck, learn }`, shared across sessions. `learn` affects only decks
  that support it. The facts deck always uses `CAPI_LEARN_LANGUAGE`.
- `/capi <deck id>` switches the deck. `/capi learn on|off` switches learn mode.
- The card view gets an `Input` element (one-line text field, `onSubmit`) for cards whose
  format is `free`.
- A deck noun that is missing or throws makes capi fall back to `facts` and show a toast.

### 8.2 The interview deck (`digi-me` plugin)

The noun is `digiMe`, the deck id is `interview`. `record` pipes the entries into
`digi-me answer`.

Card formats:
- `either`: two options;
- `choice`: three or four options, plus "other";
- `scale`: 1 to 5, with the labels of both ends;
- `free`: the text field;
- `confirm`: "I think you … True?", with yes / partly / no.

Every card also has: skip; the sensitivity buttons `public · personal · private · only me`
(preset from the domain's default); and "don't ask again". Every card carries a short
`topic` (for example `coffee`). "Don't ask again" sets `stop: true` on the entry, and the deck
asks nothing more on that topic.

Language:

| Mode | Question | Answer | After the answer |
|---|---|---|---|
| interview | `language` (`de`) | the same, by button or text | a short thanks, the next card |
| interview + learn | `CAPI_LEARN_LANGUAGE` (pt-BR) | the same language | the correction of the answer, with a note in `CAPI_NATIVE_LANGUAGE`, as in the facts deck |

Question selection, inside `request(ctx)`. The prompt gets:
- the coverage map and the answer count per domain;
- the `stop` marks;
- the facts older than six months;
- the last 30 answers.

On the owner device these come from the data repo. On other devices they come from the
`interview` part and the facts of the `my-agents` bundle (section 4.4), and from the deck's own
entries.

The model picks, in this order:
1. A follow-up on a recent answer that was surprising or vague (at most one per batch).
2. A `confirm` card for a fact older than six months (at most two per batch).
3. New questions for the domains furthest below their target.

Cheap formats come first in a new domain. `free` comes after the domain has five answers.
The batch size is 10.

Answer entry:

```json
{"id":"a-3f2k","ts":"2026-10-09T14:03:11Z","device":"ddStudio","deck":"interview",
 "learn":false,"lang":"de","domain":"food","format":"choice",
 "question":"…","options":["…"],"answer":2,"text":null,
 "corrected":null,"meaning":null,"s":"personal","topic":"coffee","skipped":false,"stop":false}
```

- `lang`: BCP 47 code of the answer (`de`, `pt-BR`).
- `answer` per format: `either` and `choice` the 0-based index of the option ("other" is
  the last index, and `text` holds the answer); `scale` the index 0 to 4 of the options `1`…`5` (value = `options[answer]`); `confirm` 0 = yes,
  1 = partly, 2 = no; `free` `null`, and `text` holds the answer.

The band shows the coverage next to capi's level. When the coverage passes the next 10 %, Capi
says that the digi-me "digivolved".

## 9. Seed and distill (`digi-me-distill`)

### 9.1 Seed (once)

A Claude Code session in the data repo. Sources, each read only after the owner's yes:
- the Claude Code memory files under `~/.claude/projects/*/memory/` (personal facts only);
- the global rules under `~/.claude/rules/`;
- the claude.ai memory, through the `anthropic-skills:import-memory` skill;
- a ChatGPT memory export, if the owner provides one;
- public texts by the owner (for Daniel: the pagr articles), also as `voice` samples.

The output is the first `facts/*.md` with `c: 0.5` and `a: [seed]`. The interview confirms or
corrects them through `confirm` cards.

### 9.2 Distill (weekly or on request)

1. Run `digi-me inbox`.
2. Read the answers after the cursor in `answers/.distilled` (file and line of the last
   distilled answer). `inbox` appends in arrival order, so a late answer is never skipped.
3. Propose edits to `facts/*.md`:
   - Add a fact, with `s` from the answer.
   - Raise its confidence, or update `t`.
   - Mark a contradiction as `⚠ conflicts with a-…`. Never overwrite silently.
   - Propose `core: true`, or a lower sensitivity, only as a proposal.
4. Show the diff per file. The owner approves or changes it.
5. Move the cursor. Commit after the owner's yes. Push after a second yes.
6. Run `digi-me publish`. Every device gets the new bundles at its next session start.

## 10. Distribution for Daniel (phase 1)

- The `digi-me` plugin is a new source in `release-everywhere`, published to seedr-internal
  (its `registry-internal` folder) as a plugin item with compatibility `claude`. A
  `scripts/resync-seedr-internal.sh` in `digi-me` publishes it, as the kit's script does.
- `update-clients.sh` gets `add digi-me plugin claude`.
- capi comes from public seedr or its marketplace, as today. Spike 2 (section 13) decides
  whether `dependencies` installs it.
- Data never goes through seedr. It goes through the relay.
- `digi-daniel` lives at `~/Work/danieldeusing/digi-daniel` on ddStudio. Other Macs need no
  clone.

## 11. Error handling

- The relay is not reachable: `pull` keeps the cache; `answer` fails and capi keeps the
  entries in `pending:interview`. Nothing is lost.
- A removed device keeps what it already downloaded (§5.1 wins over the next point): the relay
  answers `401`, and `pull` keeps the cache. How `pull` reports this is decided in plan 2.
- A bundle of an audience in `config.json` does not decrypt (wrong key): `pull`
  deletes that audience's cache folder and says so.
- The model returns malformed cards: `parse` drops them.
- The deck noun throws: capi falls back to the facts deck.
- `audiences.yaml` is invalid: `build` stops with the line number and publishes nothing.
- A fact without `s`: `build` stops. There is no default sensitivity for a stored fact.

## 12. Testing

- CLI (`node --test`):
  - the rules of section 4.3, one test per rule, including `allow`, `deny` and `only-me`;
  - `build` gives the same output for the same input;
  - encrypt and decrypt round trip for one and for several recipients;
  - a removed device cannot decrypt the next bundle;
  - the session bundle choice of section 6.2;
  - the join code round trip.
- Relay (`node --test` against an in-memory R2 stub, plus a `wrangler dev --local` smoke test;
  `@cloudflare/vitest-pool-workers` 0.23.0 needed vitest 4): every row of the table in 5.2,
  each token role allowed and refused, the size limit, `ETag` and `304`.
- Plugin (`claude plugin test`): `prompt.compose` with and without cache, the deck noun with a
  stub capi, `record` failure keeps entries pending.
- capi: `node --test` and `claude plugin test` for the deck switch, the store key migration,
  `pending:<deck>`, `/capi learn`, the `Input` card and the fallback.
- End to end on two Macs: answer on ddAir, `inbox` and distill on ddStudio, `publish`, new
  session on ddAir sees the new fact.

## 13. Order of work (phase 1)

0. Spikes:
   1. One plugin calls functions on a noun that another plugin added in `engine.create`.
      Fallback: `digi-me` writes card batches into its own `$.store` key and capi reads them.
   2. A plugin with `dependencies: ["capi"]`: does the install pull capi in?
   3. A hook runs `node <plugin root>/cli/dist/digi-me.mjs` with `$.process.run`: does it work,
      and how long does `pull` take at session start?
   4. `age-encryption` in Node 20: encrypt to several recipients and decrypt with the CLI
      `age`, to prove that the files are standard age.
1. CLI: data model, rules, `build`, keys, tests.
2. Relay: Worker, R2, tokens, tests, deploy to `<relay host>`.
3. CLI: `init`, `login`, `device`, `publish`, `pull`, `answer`, `inbox`.
4. capi: the deck extension point, released as a new capi version.
5. Plugin: hooks, interview deck, skills, userConfig.
6. `digi-daniel`: `init`, seed, first `publish`; join ddAir.
7. seedr-internal and `update-clients.sh`.
8. GitHub: create `digi-me` (public) and `digi-daniel` (private) and push. Only with Daniel's
   yes.

## 14. Later phases (sketch)

### 14.1 Phase 2: more consumers

- Codex, Copilot CLI, OpenCode: packaging in `digi-me` (`.codex-plugin/`, `plugin.json`,
  `.opencode/`); a hook or `install-core.sh` writes the `core` of the bundle into each
  client's global instructions file, between `<!-- digi-me:start -->` and
  `<!-- digi-me:end -->`, and respects existing symlinks.
- Hermes: a device key and token; it pulls `my-agents`.
- Chat apps: `digi-me export` prints the core for claude.ai, ChatGPT and Copilot on github.com,
  and builds a skill zip for claude.ai.
- Pairing by QR code instead of copying a token.

### 14.2 Phase 3: app and web

- One-click setup: "Continue with Apple / Google". The app makes the key, stores it in the
  platform keychain, uses the free relay, creates default audiences, and shows the first card.
- Friends: invite link or QR code. The friend's public key reaches the owner through the relay
  inbox. The owner's device adds it and publishes.
- Chat with a digi: the friend's phone decrypts the bundle of its audience and answers with
  its **on-device model** (Apple Foundation Models, Gemini Nano). It is free, and no provider
  sees the content.
- Better answers, optional: "connect your LLM" with an API key. Then the owner pays, with
  caps per friend. Inference runs on the owner's node, on the friend's device with a scoped
  key, or later in an attested enclave.
- Learning loop: an "I don't know" in a friend chat files the topic (not the friend's words)
  into the owner's inbox. It becomes an interview card.
- Web widget: the `public` audience, owner's LLM, rate-limited.
- Open: who sees which chat, abuse handling, legal text.

## 15. Rulings from plan 1's execution (revision 5)

- Secrets never go on the command line: `init --admin-token -` and `login --join -` read the
  value from stdin. The flag form with a value still works.
- `--relay` and the relay in a join code must be `https:` (`http:` only for `localhost`).
- Names from decrypted content never choose file paths: `pull` refuses audience and domain names
  that fail the name rule, and the domain `core` in any letter case. `build` refuses the same
  fact-file names, so the owner sees the error before publishing.
- `init` refuses to run on a device that already has a config, writes the data repo first and
  registers the owner last; `device add` checks the age key and creates the relay token before it
  edits `audiences.yaml`; `device remove` revokes at the relay first.
- `inbox` reports an unreadable batch, leaves it at the relay and goes on.
- The relay accepts a device token only while `<owner>/devices/<device>` holds its hash, and
  answers `400` to a malformed or non-string JSON body. It runs only on its custom domain
  (`workers_dev = false`).

## 16. Rulings for plan 2 (revision 6)

- **The facts deck stays as it is.** It keeps the store keys `queue` and `current`, its code
  path and its iCloud log. Only other decks use keys with their id: `queue:<id>`,
  `current:<id>`, `recent:<id>`, `pending:<id>:<session>`, `refill:<id>`, `count:<id>:<day>`. There is no
  key migration. (Replaces the key part of §8.1.)
- **capi finds decks by name.** `CAPI_DECKS` selects decks (separated by `|`, default
  `digiMe`) among the ones capi knows. The engine forbids `$[name]` and `$` across an import, so
  capi spells each deck noun statically (a facade in `register.js`) and hands `decks.js` an `io`
  object instead of `$`. A new deck needs a branch in `deckIo` and a facade function in capi's `register.js`.
- **A deck noun is pure.** Its methods need no `$`; capi makes every model call, runs the
  record command and passes all data in:
  - `describe()` → `{ id, label, icon, perDay, language, texts }`;
  - `status()` → header pairs, for example `[['Abdeckung', '12 %']]`;
  - `request(ctx)` → `{ system, prompt, call }`; `parse(text)` → cards;
  - `answered(card, entry, ctx)` → `{ line, request? }`; `parseFeedback(text)` →
    `{ line, patch: { corrected, meaning } }`;
  - `recordArgv()` → the command capi runs with the answer entries as JSON lines on stdin.
- **Answer cards** carry `format`, `question`, `options` (empty for `free`; `1`–`5` for
  `scale`, with `scaleLabels`), `other` (the last choice option opens the text field),
  `domain`, `topic`, `s` and an optional `note`. Hotkeys: answers `1`–`6`, sensitivity `7`,
  skip `8`, "don't ask again" `9`.
- **`entry.lang`** is the deck's `language` (`de`), or the name of `CAPI_LEARN_LANGUAGE` in learn
  mode.
- **The interview always reads the pulled `my-agents` bundle**, also on the owner device. Answers
  that are newer than the bundle's `published` time count towards the coverage too. The interview
  runs only in sessions whose audience is `my-agents`; in a work session the deck says so and asks
  nothing, so no personal question or fact reaches a work session or its model account.
- **digi-me declares no `dependencies`.** An unmet dependency would unload the plugin without a
  message (spike 2). digi-me works without capi; only the interview needs it.
- **`DIGI_ME_HOME`** also sets the home folder of the plugin's hooks, as for the CLI.
- **capi changes happen in a git worktree** (branch `decks`), because Daniel's live capi loads
  from the main working tree and reloads on every save.

## 17. Visibility circles (revision 7)

The four sensitivity levels (`public < personal < private < only-me`) asked the owner to think
like a security engineer. A 13-year-old and a 70-year-old should understand who sees a fact at a
glance. So a fact no longer has a level: it names the **circles** of people who may see it.

### 17.1 The circles

| id | Icon | Chip (short) | Name |
|---|---|---|---|
| `familie` | 🏠 | Familie | Familie |
| `beste-freunde` | 💛 | Beste | Beste Freunde |
| `freunde` | 👥 | Freunde | Persönliche Freunde |
| `arbeitsfreunde` | 🤝 | Kollegen | Arbeitsfreunde |
| `arbeit` | 💼 | Arbeit | Arbeit (where the owner works now) |
| `firmen` | 🏢 | Firmen | Firmen (other companies) |
| `alle` | 🌍 | Alle | Alle |

- Each circle stands on its own: there are no levels and no groups. The owner checks any
  combination.
- `alle` includes every other circle.
- No circle checked means **Nur ich** (🔒): the fact never leaves the data repo.
- In English the names are: Family, Best friends, Friends, Work friends, Work, Companies,
  Everyone, Only me. The deck shows the names in its `language`.

### 17.2 Facts (replaces the `s`, `allow` and `deny` labels of §4.2)

```
- Plays football on Sundays. {id: f-3k2a, sees: [familie, beste-freunde, freunde, arbeitsfreunde], c: 0.8, t: 2026-10, a: [a-77qe]}
- Writes short, plain technical English. {id: f-12b0, sees: [familie, beste-freunde, freunde, arbeitsfreunde, arbeit], c: 0.5, t: 2026-10, a: [seed], core: true}
- Has a heart condition. {id: f-9z01, sees: [], c: 1, t: 2026-10, a: [a-1x2y]}
```

- `sees` is required. A fact without it, or with an unknown circle id, stops `build` with the file
  and line. `sees: []` is Nur ich.
- `allow` and `deny` are dropped: the circles say who sees a fact.

### 17.3 Audiences (replaces the rules of §4.3)

An audience names one circle, or `any`:

```yaml
audiences:
  my-agents:   { members: [ddStudio, ddAir], circle: any, interview: true }
  work-agents: { members: [ddStudio, ddAir], circle: arbeit }
```

Rules for the bundle of one audience:
1. A fact with `sees: []` never enters a bundle.
2. `circle: any` takes every other fact. This is the owner's own assistants: they act for the
   owner and may know everything except Nur ich.
3. Any other circle takes the facts whose `sees` holds that circle or `alle`.

- `domains`, `deny-domains` and `max` are dropped. The built-in audiences `only-me` and `public`
  are dropped too. An audience for public output, such as the web widget of phase 3, is an
  ordinary audience with `circle: alle`.
- Phase 3 adds an audience per circle of friends, for example `circle: freunde` with the app
  accounts of those friends as members.
- An unknown circle in `audiences.yaml` stops `build` with the line.

### 17.4 Bundles and the coverage map (changes §4.4 and §4.5)

- Each fact line in a bundle keeps `id`, `sees`, `c` and `t`.
- The fourth column of `domains.md` holds the domain's **default circles**, separated by spaces.
  `digi-me init` writes these defaults:

| Domains | Default circles |
|---|---|
| identity, communication, voice, learning | familie beste-freunde freunde arbeitsfreunde arbeit |
| work, tech-taste | familie beste-freunde freunde arbeitsfreunde arbeit firmen |
| food, media, travel-places, home-routines, shopping-brands, humor, pet-peeves | familie beste-freunde freunde arbeitsfreunde |
| values-decisions | familie beste-freunde freunde |
| health-sport, people | familie beste-freunde |

### 17.5 What agents may quote (changes §7.1 and §7.2)

- The `digi-me:core` prompt section and the `digi-me` skill say: in text that other people read
  (commits, tickets, documents, posts, messages), use only facts whose `sees` includes those
  readers; in public text only facts with `alle`.
- A work session gets the `work-agents` bundle, which by the rules of §17.3 holds only facts
  visible to `arbeit`.

### 17.6 The deck contract (changes §8.1 and §16)

- `describe()` also returns `circles`: an array of 1 to 7 `{ id, icon, short, name }`, in the
  order the card shows them. capi knows no circle of its own.
- A card carries `sees`: the AI's suggestion, an array of circle ids of the deck. capi refuses a
  card whose `sees` names an unknown circle.
- An answer entry carries `sees` (array) instead of `s`.
- The ask stage loses key `7`; `8` skip and `9` "don't ask again" stay.

### 17.7 The card (changes §8.2)

After an answer the reveal stage shows the thanks or the correction, then the circles of the
answer, pre-checked with the AI's suggestion, and one sentence in plain words:

```
Sichtbar für (Vorschlag):  2 🏠 Familie ✓  3 💛 Beste ✓  4 👥 Freunde ✓  5 🤝 Kollegen ✓  6 💼 Arbeit ☐  7 🏢 Firmen ☐  8 🌍 Alle ☐   9 🔒 nur ich   1 weiter
→ Das sehen: Familie, Beste Freunde, Persönliche Freunde, Arbeitsfreunde. Nicht: Arbeit, Firmen, alle anderen.
```

- `2`–`8` toggle the circles in the deck's order (a click works too); `9` unchecks all; `1`
  accepts and shows the next card. Checking `alle` checks every circle; unchecking any circle
  unchecks `alle` too.
- "Vorschlag" disappears after the first change.
- Chips show icon and short name while the band is at least 112 columns wide, otherwise the icon
  only. The sentence uses the full names and is always shown. With no circle it reads
  `→ Das siehst nur du.` (English: `→ Only you see this.`).
- The deck gives capi the words of the row title and the sentence through its `texts`
  (`sees`, `suggested`, `seenBy`, `notSeenBy`, `onlyYou`, `othersNot`).

### 17.8 When an answer is final (changes §16)

- The answer goes into `pending:<deck>:<session>` at once, with the suggested `sees`, so that
  nothing is lost.
- Each toggle changes `sees` of that pending entry.
- capi sends the pending entries when the person presses `1`, when the card is left another way
  (another session moved on, `/capi skip`, a deck switch), or with the next answer.
- A session that ends in the reveal stage leaves the entry pending; it goes out with its last
  `sees` at the next flush.
- A skipped card and "don't ask again" have no reveal stage: their entries go out at once, as
  before.

### 17.9 The interview (changes §8.2)

- The model returns `sees` for each card instead of `s`, starting from the domain's default
  circles and adjusting them to the question (for example `[]` for a medical detail).
- `parse` drops a card with an unknown circle id.

### 17.10 Conversion

Nothing was published under the old labels, and the data repo holds only the templates of
`init`. So there is no migration code:
- `digi-daniel` gets new `audiences.yaml` and `domains.md` from the new templates.
- The seed facts are converted once, before Daniel reviews them:

| Old `s` | `sees` |
|---|---|
| `public` | `[alle]` |
| `personal` in identity, communication, voice, work, tech-taste, learning | `[familie, beste-freunde, freunde, arbeitsfreunde, arbeit]` (these domains reached `work-agents` before) |
| `personal` elsewhere | `[familie, beste-freunde, freunde, arbeitsfreunde]` |
| `private` | `[familie, beste-freunde]` |
| `only-me` | `[]` |

- The seed review page shows the 7 checkboxes per fact, pre-checked from this table.
