---
name: digi-me-distill
description: Use in the user's digi-me data repo when the user says "seed digi-me", "distill", "update my digi-me" or "process my interview answers" — turns sources or interview answers into facts, with the user's approval, then publishes.
---

# digi-me seed and distill

Work in the user's data repo (the `data` path in `~/.config/digi-me/config.json`). Below,
`digi-me` means `node <that path>`. Find the path once:

    find ~/.claude/plugins -path '*digi-me*/cli/dist/digi-me.mjs' 2>/dev/null | head -1

Fact format, in `facts/<domain>.md`:

`- <fact> {id: f-<4 random chars>, sees: [<circles>], c: <0–1>, t: <YYYY-MM>, a: [<answer ids or seed>]}`

`sees: []` keeps a fact with the owner only.
Optional label: `core: true` (always loaded).
Domains and their default circles are in `domains.md`.

## Seed (once, before the interview)

1. Ask before reading each source. Sources:
   - the Claude Code memory files under `~/.claude/projects/*/memory/` (personal facts only);
   - the global rules under `~/.claude/rules/`;
   - the claude.ai memory (the `anthropic-skills:import-memory` skill);
   - a ChatGPT memory export, if the user gives one;
   - public texts by the user, also as samples for `voice`.
2. Write facts with `sees` from the domain's default circles, `c: 0.5` and `a: [seed]`. Mark at most 15 facts `core: true`: name, languages, tone, length of answers, hard dislikes.
3. Show the facts per file. Change what the user corrects.
4. Continue at step 5 of "Distill".

## Distill (weekly or on request)

1. Run `digi-me inbox`. It appends new answers to `answers/<YYYY-MM>.jsonl`.
2. Read the answers after the cursor in `answers/.distilled` (`<file>:<line>`; no file means from the start).
3. Propose edits per answer:
   - a new fact, with `sees` from the answer entry and `c: 0.8` (1 for a free-text answer the user typed);
   - a raised `c` and a new `t` for a fact the answer confirms (a `confirm` card answered "yes");
   - an answer about an existing fact: a narrower `sees` in the answer narrows the fact at once; a wider one is only proposed (step 4);
   - a lowered `c`, or a corrected text, for "partly" or "no";
   - a contradiction: add `⚠ conflicts with a-…` to the fact text; never overwrite silently;
   - a skipped answer: nothing; a "don't ask again" answer: nothing (the stop is in the log).
   - An answer `id` seen before (in an earlier file or line) is the same answer: count it once.
   - `answer` is the index of the chosen option for every format; for a `scale` card the value is `options[answer]` (1 to 5). (`free` answers, and the "other" option of `either`/`choice`, have their words in `text`.)
   - In learn mode use the entry's `meaning`, not the typed text.
   - An entry without `sees`: use `[]` and ask the user.
4. Only propose `core: true` or wider circles for the user to accept, and name the circles in plain words (for example "sichtbar für Familie und Beste Freunde").
5. Show the diff per file. Apply what the user approves.
6. Run `digi-me build`. Fix any error it names (file and line).
7. Move the cursor: write the last distilled `<file>:<line>` to `answers/.distilled`.
8. Commit only after the user's yes, by path. Push only after a second yes.
9. Run `digi-me publish` only after the user's yes: it sends the new bundles to every device at its next session start.
