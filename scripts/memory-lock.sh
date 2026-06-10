#!/usr/bin/env bash
# bcp PreToolUse / PostToolUse hook — serialize MEMORY.md writes across concurrent
# clone sessions so two saves can't clobber each other mid read-modify-write.
#
# Mode (arg 1):
#   acquire  — PreToolUse:  take the lock before a Write/Edit to a MEMORY.md
#   release  — PostToolUse: drop the lock after the write
#
# The lock scope follows the write path: whichever MEMORY.md the tool targets is
# the one we guard. A global install protects global memory; a project-scoped
# install only ever sees that project's memory. No install-mode awareness needed.
#
# Acquisition is atomic via `mkdir` (atomic on POSIX *and* Windows; `flock` is
# not — see #9). Contention waits a bounded time; on timeout we hand the call to
# the human (the stale-lock gate) rather than guess whether the holder crashed or
# is merely slow. Real holds are sub-second, so a timeout almost always means a
# crashed or permission-denied holder — but only the human can be sure.
set -euo pipefail

MODE="${1:-}"

# Hook event payload arrives on stdin as JSON.
PAYLOAD="$(cat || true)"

# Pull a JSON string field out of the payload without requiring jq — consistent
# with the rest of the plugin's pure-shell hooks. First match wins.
json_field() {
  printf '%s' "$PAYLOAD" \
    | grep -o "\"$1\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" \
    | head -1 \
    | sed "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*/\\1/" \
    || true
}

FILE_PATH="$(json_field file_path)"

# Only MEMORY.md writes are guarded; everything else passes straight through.
# Coverage is the file-editing tools wired in hooks.json (Write/Edit/MultiEdit).
# A memory write made some other way — e.g. a raw `echo >> MEMORY.md` from the
# Bash tool — never reaches this hook and would need its own guard. The memory
# protocol uses the Write tool, so that boundary is fine today; flag it here so a
# future switch to append-via-shell doesn't silently lose protection.
case "$FILE_PATH" in
  */MEMORY.md|MEMORY.md) ;;
  *) exit 0 ;;
esac

LOCK="$(dirname "$FILE_PATH")/MEMORY.md.lock"

if [ "$MODE" = "release" ]; then
  # Intentionally identity-blind: clear whatever lock sits at this path, without
  # checking that this invocation created it. With a single live holder that's a
  # plain release. It is also what makes the human-approved break-in below work —
  # the breaking write's release clears the stale holder's lock. (rm -rf, not
  # rmdir, because the holder facts live inside the dir.)
  rm -rf "$LOCK" 2>/dev/null || true
  exit 0
fi

# --- acquire ---
TIMEOUT="${BCP_MEMORY_LOCK_TIMEOUT:-10}"   # seconds; real holds are sub-second
deadline=$(( $(date +%s) + TIMEOUT ))

while :; do
  if mkdir "$LOCK" 2>/dev/null; then
    # Won the lock. Record holder facts for the stale-lock gate.
    {
      echo "clone=${BCP_CLONE:-unknown}"
      echo "session=$(json_field session_id)"
      echo "pid=$$"
      echo "since=$(date '+%Y-%m-%d %H:%M:%S')"
    } > "$LOCK/holder" 2>/dev/null || true
    exit 0
  fi
  # Contended — wait for the holder to release, up to the deadline.
  [ "$(date +%s)" -ge "$deadline" ] && break
  sleep 0.2 2>/dev/null || sleep 1
done

# Timed out. Hand the decision to the human instead of breaking the lock blindly.
HOLDER="$(tr '\n' ' ' < "$LOCK/holder" 2>/dev/null || true)"
REASON="MEMORY.md is locked ($LOCK) — held by [${HOLDER:-unknown}]. A normal write releases in well under a second, so the holder most likely crashed or had its write denied. Approve to break the stale lock and proceed; reject to leave it for the live holder."
ESCAPED="$(printf '%s' "$REASON" | sed 's/\\/\\\\/g; s/"/\\"/g')"
printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"%s"}}\n' "$ESCAPED"
exit 0
