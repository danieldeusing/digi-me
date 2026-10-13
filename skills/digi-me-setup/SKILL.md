---
name: digi-me-setup
description: Use when the user wants to set up digi-me — create their private data repo on the first device, add another device, or check the setup ("set up digi-me", "add this Mac to digi-me", "join digi-me").
---

# digi-me setup

The CLI ships with the plugin. Find it once and use the path in every step:

    find ~/.claude/plugins -path '*digi-me*/cli/dist/digi-me.mjs' 2>/dev/null | head -1

Below, `digi-me` means `node <that path>`. Secrets never go on the command line: pass them on stdin with `-`.

## First device (the owner device)

1. Ask the user for the relay URL (the `https://` address of the relay they deployed) and the folder for the data repo.
2. Pass the relay admin token to `init` on stdin, so the token never reaches the screen, a file or the shell history. Use the first option that works:
   - Pipe it straight from the user's secret store (for example `op read …`):

         <command that prints the admin token> | digi-me init <folder> --relay <url> --admin-token -

   - Let the user run `digi-me init <folder> --relay <url> --admin-token -` in their own terminal: paste the value, press Enter, then Ctrl-D.
   - Last option: the user copies the token to the clipboard, and you pipe it: `pbpaste | digi-me init <folder> --relay <url> --admin-token -` (macOS). Some setups block clipboard pipes; then let the user run the command in their own terminal. Tell the user to clear the clipboard afterwards (`pbcopy < /dev/null` on macOS).
3. Show the user the created folder. It holds `audiences.yaml`, `domains.md`, `facts/` and `answers/`.
4. Offer the seed next: the `digi-me-distill` skill in seed mode.

## Another device

1. On the new device: run `digi-me login`. It prints a public key (`age1…`).
2. On the owner device: add the device with `--audiences my-agents` (use `work-agents` for a work machine). `device add` also publishes the current facts to every device: say so and ask the user before you run it. The join code contains the device's token: never show it. Either the user runs `digi-me device add <name> <age1…> --audiences my-agents` in their own terminal, or pipe its output into the clipboard: `digi-me device add <name> <age1…> --audiences my-agents | pbcopy` (macOS). Then tell the user the join code is in the clipboard.
3. On the new device: pass the join code to `digi-me login --join -` on stdin. Either the user runs it in their own terminal: paste the value, press Enter, then Ctrl-D. Or, after the user copied the join code, pipe it from the clipboard: `pbpaste | digi-me login --join -` (macOS). Some setups block clipboard pipes; then let the user run the command in their own terminal.
4. On the new device: run `digi-me pull`. It prints one line per audience with its version.

## Check

Run `digi-me status`. On the owner device it shows the coverage, the published version and the inbox; on other devices the cached versions.
