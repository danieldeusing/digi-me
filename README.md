# digi-me

One personal "about me" for every coding agent and chat. Your facts live in your own
private repository, and reach each of your devices end-to-end encrypted.

## How it works

- **The data repo** `digi-<name>` is yours and private. It holds your facts (each with the
  circles that may see it), the audiences and their rules, a coverage map of what is known, and
  your interview answers.
- **The CLI** (`cli/dist/digi-me.mjs`) builds one bundle per audience and encrypts it with
  [age](https://age-encryption.org) to the devices of that audience.
- **The relay** is a small Cloudflare Worker with an R2 bucket. It stores only ciphertext.
- **The Claude Code plugin** pulls the bundles when a session starts. It adds the core facts
  to the system prompt of the session: `my-agents`, or `work-agents` in the folders of
  `workPaths`. It also lends a deck of interview cards to a host mod that draws lent decks (the
  deck contract in §16 and §17.6 of the design spec), so that the host can ask you what the facts
  still miss.

## Install

```bash
claude plugin marketplace add danieldeusing/digi-me
claude plugin install digi-me@digi-me
```

For the interview you also need a host mod that draws lent decks. digi-me works without one;
only the interview needs it.

## Set up

Ask Claude to "set up digi-me". The `digi-me-setup` skill guides you:

- **First device:** `init` creates the data repo and registers you at your relay. You need
  the relay URL and its admin token.
- **Every other device:** `login` makes the device key. The first device adds the device and
  prints a join code. The new device joins with that code.

Then say "seed digi-me" once, to fill the first facts from your notes and memory files. From
time to time say "distill" to turn interview answers into facts (the `digi-me-distill`
skill). Nothing is published until you have reviewed the changes and said yes.

## Settings

Set these in the plugin's settings.

| key | what it sets | default |
| --- | --- | --- |
| `workPaths` | folders or globs whose sessions get `work-agents` instead of `my-agents`. `*` is one folder name, `**` any depth, `?` one character, `[..]` one of a set. | none |
| `perDay` | new interview cards a day, at most | `10` |
| `language` | the language of the interview (`de` or `en`), without learn mode | `de` |

## Your own relay

You need a Cloudflare account and Node 20 or newer.

1. Go to the relay folder: `cd relay`.
2. Add an `[env.<name>]` block to `wrangler.toml`: your `routes`, `workers_dev = false`, an
   R2 bucket and a rate limit. The existing env block in `relay/wrangler.toml` is an example.
   Pick your own `namespace_id` for the rate limit, and give your block its own
   `[[env.<name>.ratelimits]]` block.
3. Create the bucket: `npx wrangler r2 bucket create <bucket>`.
4. Set the admin token. Pipe the value in, so that it stays out of your shell history:
   `<command that prints the token> | npx wrangler secret put ADMIN_TOKEN --env <name>`.
5. Deploy: `npx wrangler deploy --env <name>`.

The admin token is needed once, for `init`. The CLI never stores it.

## Privacy

- The relay sees owner and device names, sizes and times. It never sees content.
- Each fact lists the circles that may see it: `familie`, `beste-freunde`, `freunde`,
  `arbeitsfreunde`, `arbeit`, `firmen`, `alle`. An audience gets the facts of its circle or `alle`.
  `my-agents` (`circle: any`) gets every fact except those with no circle.
- A fact with `sees: []` never leaves the data repo.
- Sessions in work folders get the `work-agents` bundle only in the system prompt. The interview
  runs in every session and always uses the `my-agents` facts.
- Removing a device revokes its token at once and publishes new bundles without it; it keeps
  what it already downloaded.

## Develop

```bash
npm install
npm test
npm run build                      # rebuilds cli/dist/digi-me.mjs, which is committed
claude plugin test .
claude plugin validate . --strict
```

## License

[MIT](LICENSE)
