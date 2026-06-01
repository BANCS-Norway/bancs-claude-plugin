#!/usr/bin/env bash
# bcp SessionStart hook — seed the active workforce.
#
# On the first session after install, copy the default bundled workforce to
# ~/.claude/bcp/workforce.json so the engine (worktree/mission skills) always has
# a roster to read. No external tools required — pure shell + a tiny JSON peek.
#
# Switch or update the active workforce any time with /bcp:workforce.
set -euo pipefail

# Consume the hook event payload (delivered on stdin) so the pipe stays happy.
cat >/dev/null 2>&1 || true

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-}"
[ -z "$PLUGIN_ROOT" ] && exit 0   # not running as an installed plugin; nothing to seed

WF_DIR="$PLUGIN_ROOT/workforces"
INDEX="$WF_DIR/index.json"
ACTIVE_DIR="$HOME/.claude/bcp"
ACTIVE="$ACTIVE_DIR/workforce.json"

# Already seeded, or no bundled workforces — nothing to do.
[ -f "$ACTIVE" ] && exit 0
[ -f "$INDEX" ] || exit 0

# Pull the "default" id out of index.json without requiring jq.
DEFAULT_ID=$(grep -o '"default"[[:space:]]*:[[:space:]]*"[^"]*"' "$INDEX" \
  | head -1 | sed 's/.*"\([^"]*\)"[[:space:]]*$/\1/')
[ -z "$DEFAULT_ID" ] && exit 0

SRC="$WF_DIR/$DEFAULT_ID.json"
[ -f "$SRC" ] || exit 0

mkdir -p "$ACTIVE_DIR"
cp "$SRC" "$ACTIVE"
echo "bcp: seeded default workforce '$DEFAULT_ID' → $ACTIVE" >&2

exit 0
