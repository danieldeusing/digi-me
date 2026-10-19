---
name: digi-me-distill
description: Use in the user's digi-me data repo when the user says "seed digi-me", "distill", "update my digi-me" or "process my interview answers" — turns sources or interview answers into facts, with the user's approval, then publishes. Also the scheduled memory loop, which runs "Unattended" below without asking.
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

1. Take the lock: `mkdir answers/.loop.lock`. If it exists, the memory loop runs: wait, or stop. Remove it
   when you are done. Then run `digi-me inbox`. It appends new answers to `answers/<YYYY-MM>.jsonl`.
2. Read the answers after the cursor in `answers/.distilled` (`<file>:<line>`; no file means from the start).
3. Propose edits per answer:
   - a new fact, with `sees` from the answer entry and `c: 0.8` (1 for a free-text answer the user typed);
   - a raised `c` and a new `t` for a fact the answer confirms (a `confirm` card answered "yes");
   - an answer about an existing fact: a narrower `sees` in the answer narrows the fact at once; a wider one is only proposed (step 4);
   - a lowered `c`, or a corrected text, for "partly" or "no";
   - a contradiction: add `⚠ conflicts with a-…` to the fact text; never overwrite silently;
   - a skipped answer: nothing; a "don't ask again" answer: nothing (the stop is in the log).
   - An answer `id` seen before (in an earlier file or line) is the same answer: count it once.
   - `answer` is the index of the chosen option for every format; for a `scale` card the value is `options[answer]` (1 to 5), and `scaleLabels` names what 1 and 5 mean (older entries have none: then the question must say it, or the fact says the ends are unknown). (`free` answers, and the "other" option of `either`/`choice`, have their words in `text`.) An own answer on an `either`, `choice` or `confirm` card has `answer: null` and its words in `text`: read the text as the answer; on a `confirm` card it is a correction of the fact.
   - In learn mode use the entry's `meaning`, not the typed text.
   - An entry without `sees`: use `[]` and ask the user.
4. Only propose `core: true` or wider circles for the user to accept, and name the circles in plain words (for example "sichtbar für Familie und Beste Freunde").
5. Show the diff per file. Apply what the user approves.
6. Run `digi-me build`. Fix any error it names (file and line).
7. Move the cursor: write the last distilled `<file>:<line>` to `answers/.distilled`.
8. Commit only after the user's yes, by path. Push only after a second yes.
9. Run `digi-me publish` only after the user's yes: it sends the new bundles to every device at its next session start.

## Unattended (the scheduled memory loop)

Run this mode only when the prompt says **unattended** or **memory loop**. The owner allowed it to
change facts, commit, push and publish without asking. It never asks, and it never waits for an
answer. It runs "Distill" with these differences:

1. Use the newest CLI: `ls -d ~/.claude/plugins/cache/digi-me/digi-me/*/ | sort -V | tail -1`, then
   `cli/dist/digi-me.mjs` in it. Run every git command with `GIT_TERMINAL_PROMPT=0`.
2. Lock: `mkdir answers/.loop.lock`. If it exists and is younger than two hours, end with "skipped:
   another run holds the lock" and leave it. If it is older, remove it and take it. Remove your own
   lock at the end, also after an error.
3. Clean start: `git status --porcelain -- facts answers` must show nothing but the lock. Otherwise
   end with **Blocked**: "uncommitted changes in facts/ or answers/: the owner reviews them first".
4. `git pull --rebase`. On a conflict: `git rebase --abort`, then **Blocked**.
5. Catch up: if the branch is ahead of its upstream, `git push`.
6. `digi-me inbox`. If it added answers, commit `answers/` by path at once
   (`Memory loop: <n> answers in`) and push: the relay no longer holds them.
7. Distill the answers after the cursor with the rules of step 3 above, and these:
   - a new fact gets the circles of its answer; an entry without `sees` gets `[]`;
   - the circles of an existing fact never widen. A wider answer keeps the fact's circles. A
     narrower answer goes into a fact of its own, with its circles, never into a wider fact;
   - one fact per subject: for the same subject, raise `c`, set `t` to the current month and add the
     answer id to `a:`; add a new fact only for something new;
   - a contradiction, or a `confirm` card answered "partly" or "no": lower the old fact's `c` to
     0.3, mark it `⚠ conflicts with a-<answer id>`, and add the owner's words as a new fact. Never
     rewrite a fact's text;
   - learn mode: the entry's `meaning`; without one, its `text`;
   - facts are in English, like the others;
   - a new fact: `id: f-` and four characters from `a-z0-9` that no fact has yet; `t:` the current
     month; `a: [<answer id>]`;
   - never set `core: true`.
8. `digi-me build` must pass. If it still fails after two fixes: `git checkout -- facts` and
   `git clean -fd -- facts`, leave the cursor, end with **Blocked** and the error.
9. Move the cursor. Commit `facts/` and `answers/.distilled` by path
   (`Memory loop: <n> answers, <m> facts`). Push.
10. Publish when HEAD differs from the commit in `.build/published` (none yet: publish): run
    `digi-me publish`, then write HEAD to `.build/published`. If it fails, end with **Blocked**;
    the next run publishes again.
11. Nothing new, nothing to push, nothing to publish: end with "nothing new", without a commit.
12. Never touch other files, and never run `git config`.
13. End with one line: answers in, facts added and changed, the commits, the bundle version; or a
    **Blocked** line that names what failed.
