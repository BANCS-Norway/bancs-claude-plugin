---
description: Sync mission timestamps from GitHub issue events
---

# Sync Mission Timestamps

Sync `Started` and `Completed` timestamps in all mission files from GitHub issue events.

**Timestamp priority:**

- **Started**: `status: in progress` label added → fallback: issue `created_at`
- **Completed**: `status: in progress` label removed → fallback: issue `closed_at`

Run the following bash script:

```bash
MISSIONS_DIR="$HOME/.claude/missions"
DEFAULT_REPO="BANCS-Norway/home"
UPDATED=0
SKIPPED=0

update_field() {
  local file="$1" field="$2" value="$3"
  if grep -q "^\*\*${field}:\*\*" "$file"; then
    sed -i "s|^\*\*${field}:\*\* .*|\*\*${field}:\*\* ${value}|" "$file"
  fi
}

process_mission() {
  local file="$1"
  local issue_num repo
  issue_num=$(grep -m1 "^\*\*Issue:\*\*" "$file" | grep -oE '#[0-9]+' | tr -d '#' | head -1)
  [ -z "$issue_num" ] && return

  # Read per-file Repo:; fall back to DEFAULT_REPO if missing (legacy files)
  repo=$(grep -m1 "^\*\*Repo:\*\*" "$file" | sed 's/\*\*Repo:\*\* *//' | tr -d ' ')
  [ -z "$repo" ] && { echo "  ⚠ $(basename "$file") — no Repo: field, falling back to $DEFAULT_REPO"; repo="$DEFAULT_REPO"; }

  local current_start current_end
  current_start=$(grep -m1 "^\*\*Started:\*\*" "$file" | sed 's/\*\*Started:\*\* *//')
  current_end=$(grep -m1 "^\*\*Completed:\*\*" "$file" | sed 's/\*\*Completed:\*\* *//')

  # Fetch label events
  local label_start label_end
  label_start=$(gh api "repos/$repo/issues/$issue_num/events" \
    --jq '[.[] | select(.event == "labeled" and .label.name == "status: in progress")] | last | .created_at' 2>/dev/null)
  label_end=$(gh api "repos/$repo/issues/$issue_num/events" \
    --jq '[.[] | select(.event == "unlabeled" and .label.name == "status: in progress")] | last | .created_at' 2>/dev/null)

  # Fetch issue metadata as fallback
  local issue_data created_at closed_at
  issue_data=$(gh api "repos/$repo/issues/$issue_num" --jq '{created_at, closed_at}' 2>/dev/null)
  created_at=$(echo "$issue_data" | jq -r '.created_at // empty')
  closed_at=$(echo "$issue_data" | jq -r '.closed_at // empty')

  # Resolve start: label event > created_at
  local new_start=""
  if [ -n "$label_start" ] && [ "$label_start" != "null" ]; then
    new_start=$(date -d "$label_start" '+%Y-%m-%d %H:%M')
  elif [ -n "$created_at" ] && [ "$created_at" != "null" ]; then
    new_start=$(date -d "$created_at" '+%Y-%m-%d %H:%M')
  fi

  # Resolve end: label event > closed_at (only for done missions)
  local new_end=""
  if [ -n "$label_end" ] && [ "$label_end" != "null" ]; then
    new_end=$(date -d "$label_end" '+%Y-%m-%d %H:%M')
  elif [ -n "$closed_at" ] && [ "$closed_at" != "null" ]; then
    new_end=$(date -d "$closed_at" '+%Y-%m-%d %H:%M')
  fi

  local changed=0
  if [ -n "$new_start" ] && [ "$current_start" != "$new_start" ]; then
    update_field "$file" "Started" "$new_start"
    changed=1
  fi
  if [ -n "$new_end" ] && [ "$current_end" != "$new_end" ] && [[ "$file" == */done/* ]]; then
    update_field "$file" "Completed" "$new_end"
    changed=1
  fi

  if [ "$changed" -eq 1 ]; then
    echo "  ✓ $repo#$issue_num — updated (start: ${new_start:-—}, end: ${new_end:-—})"
    UPDATED=$((UPDATED + 1))
  else
    SKIPPED=$((SKIPPED + 1))
  fi
}

echo "=== MISSIONS SYNC ==="
echo "Dir:  $MISSIONS_DIR"
echo "(per-file Repo: field drives which repo each mission syncs against; fallback: $DEFAULT_REPO)"
echo ""

find "$MISSIONS_DIR" -name "*.md" \
  ! -name "MISSION_TEMPLATE.md" \
  ! -name "README.md" | sort | while read -r f; do
  process_mission "$f"
done

echo ""
echo "Done."
```

Run the script above and report which files were updated.
