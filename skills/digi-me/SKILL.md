---
name: digi-me
description: Use when a task depends on the user's own taste, habits or voice and the system prompt has a "# digi-me" section — recommendations (food, places, media, gifts, products), planning for the user, writing in their voice, or choosing between options they would care about.
---

# digi-me

The "# digi-me" section of the system prompt holds the user's core facts and names a folder
with one file per domain (`<domain>.md`). Each line is one fact:

`- <fact> {id: f-…, sees: [<circles>], c: <confidence 0–1>, t: <YYYY-MM last confirmed>}`

## Steps

1. Pick the domains the task touches. Read only those files from the named folder.
2. Prefer facts with a high `c`. Treat `c` below 0.6 as a guess, and say so when the guess matters.
3. `sees` lists the circles that may see a fact: familie, beste-freunde, freunde, arbeitsfreunde, arbeit, firmen, alle. In text that other people read (commits, merge requests, tickets, wiki pages, documents, posts), use only facts whose `sees` includes those readers; in public text only facts with `alle`.
4. A fact the files do not hold: say "I don't know that about you yet". Do not invent one. The user can add it through the interview in the host mod that draws lent decks.
5. A fact that seems out of date: use it, and say which fact and its `t`.
