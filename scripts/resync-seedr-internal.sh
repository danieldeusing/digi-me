#!/usr/bin/env bash
# Publishes the digi-me plugin to seedr-internal from THIS repository's release tag.
#
#   scripts/resync-seedr-internal.sh                   # the tag matching .claude-plugin/plugin.json
#   scripts/resync-seedr-internal.sh digi-me--v0.1.0   # or a tag named explicitly
#
# Like vu3-agent-kit's script of the same name: the registry copies the folder that this Mac's
# .seedr/local-sources.json names, so the tag is exported to a temporary folder, the record points
# there for the run and back at this working tree afterwards, also after a failure. A new item is
# created with add-local, an existing one refreshed with resync-source. It neither commits nor
# pushes seedr-internal; the release-everywhere skill does that.
set -euo pipefail

plugin="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
internal="$HOME/Work/danieldeusing/apps/seedr-internal"
sources="$internal/.seedr/local-sources.json"
[ -d "$internal/registry-internal" ] || { echo "resync: no seedr-internal checkout at $internal" >&2; exit 2; }

version=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$plugin/.claude-plugin/plugin.json")
tag="${1:-digi-me--v$version}"
git -C "$plugin" rev-parse --verify --quiet "$tag" >/dev/null \
  || { echo "resync: no tag $tag — commit the release and run 'claude plugin tag .' first" >&2; exit 1; }
if [ -n "$(git -C "$internal" status --porcelain)" ]; then
  echo "resync: the seedr-internal worktree has changes — the transaction refuses to run on one" >&2
  exit 1
fi

export_dir=$(mktemp -d)
operation=$(mktemp)
record() {  # record <path>: point this Mac's source record of plugin/digi-me at <path>
  python3 - "$sources" "$1" <<'PY'
import json, os, sys
path, source = sys.argv[1:]
try:
    data = json.load(open(path))
except OSError:
    data = {"version": 1, "sources": {}}
data.setdefault("sources", {}).setdefault("plugin/digi-me", {})["path"] = source
os.makedirs(os.path.dirname(path), exist_ok=True)
json.dump(data, open(path, "w"), indent=2)
PY
}
finish() { record "$plugin"; rm -rf "$export_dir" "$operation"; }
trap finish EXIT

git -C "$plugin" archive "$tag" | tar -x -C "$export_dir"
echo "=== publishing $tag (exported, not the working tree)"
cd "$internal"
item="registry-internal/plugins/digi-me"
if [ -f "$item/item.json" ]; then
  record "$export_dir"
  hash=$(npx tsx scripts/registry-op.ts hash plugin digi-me 2>/dev/null \
    | python3 -c 'import json,sys; t=sys.stdin.read(); print(json.loads(t[t.index("{"):])["hash"])')
  printf '{ "v": 1, "kind": "resync-source", "type": "plugin", "slug": "digi-me", "expectedHash": "%s" }\n' "$hash" > "$operation"
else
  python3 - "$export_dir" > "$operation" <<'PY'
import json, sys
print(json.dumps({
    "v": 1, "kind": "add-local", "type": "plugin", "slug": "digi-me", "sourcePath": sys.argv[1],
    "name": "digi-me",
    "description": "Your digital me: your core facts in every Claude Code session, and an interview deck for a host mod.",
    "longDescription": (
        "digi-me gives every coding agent the same picture of you.\n\n"
        "- **Core facts** in each session's system prompt, chosen per folder: `my-agents` for personal "
        "sessions, `work-agents` for the folders in `workPaths`\n"
        "- **An interview** that a host mod asks in the band above the prompt, in German or English, or in the "
        "language you learn with corrections\n"
        "- **Skills** `digi-me`, `digi-me-setup` and `digi-me-distill` to set it up and turn answers into facts\n\n"
        "Your data stays in your own private data repository and reaches each device end-to-end encrypted "
        "through a small relay."
    ),
    "compatibility": ["claude"],
    "author": {"name": "Daniel Deusing", "url": "https://github.com/danieldeusing"},
    "externalUrl": "https://github.com/danieldeusing/digi-me",
}))
PY
fi

npx tsx scripts/registry-op.ts run --op "$operation" 2>&1 | grep -v "DeprecationWarning\|trace-deprecation" | tail -4
if npx tsx scripts/registry-op.ts validate plugin digi-me 2>&1 | grep -q '"ok": *false'; then
  echo "resync: plugin/digi-me does not validate; seedr-internal is left uncommitted for a look" >&2
  exit 1
fi
echo "=== item now at: $(grep -o '"version": *"[^"]*"' "$item/.claude-plugin/plugin.json")"
[ -e "$item/.git" ] && echo "resync: STRAY .git in the copy" >&2
echo "=== changed, all of it inside the item:"
git status --porcelain | sed 's/^/    /' | head -12
echo
echo "Next: commit and push seedr-internal, then danieldeusing-infra/seedr/update.sh --force"
