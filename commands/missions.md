---
description: Report current mission status for this project, grouped by the active workforce's members.
---

# Mission Report

Generate a mission status report for the current project by running the following
bash command and presenting the output as a formatted report. Member ids and labels
come from the active workforce (`~/.claude/bcp/workforce.json`); any mission
directory not covered by the workforce is still listed by its raw id.

```bash
MISSIONS_DIR="$HOME/.claude/missions"
ACTIVE="$HOME/.claude/bcp/workforce.json"

if [ ! -d "$MISSIONS_DIR" ]; then
  echo "No missions directory found at $MISSIONS_DIR"
  echo "Start work on an issue (worktree-create) to begin tracking."
  exit 0
fi

# Build parallel arrays of member ids + display labels.
# Source of truth: the active workforce (needs jq); falls back to directory names.
id_arr=()
label_arr=()
WF_NAME="Missions"

if [ -f "$ACTIVE" ] && command -v jq >/dev/null 2>&1; then
  WF_NAME=$(jq -r '.name // "Missions"' "$ACTIVE" 2>/dev/null || echo "Missions")
  while IFS=$'\t' read -r id label; do
    [ -z "$id" ] && continue
    id_arr+=("$id")
    label_arr+=("${label:-$id}")
  done < <(jq -r '.members[]? | [.id, .label] | @tsv' "$ACTIVE" 2>/dev/null)
fi

# Append any mission directories not already covered (e.g. after switching workforce).
for d in "$MISSIONS_DIR"/*/; do
  [ -d "$d" ] || continue
  mid=$(basename "$d")
  found=0
  for existing in "${id_arr[@]:-}"; do [ "$existing" = "$mid" ] && found=1 && break; done
  [ "$found" -eq 0 ] && { id_arr+=("$mid"); label_arr+=("$mid"); }
done

calc_duration() {
  local start="$1"
  local end="$2"
  if [ -z "$start" ] || [ "$start" = "-" ]; then
    echo "—"
    return
  fi
  local start_sec
  start_sec=$(date -d "$start" +%s 2>/dev/null) || { echo "—"; return; }
  local end_sec
  if [ -z "$end" ] || [ "$end" = "-" ]; then
    end_sec=$(date +%s)
  else
    end_sec=$(date -d "$end" +%s 2>/dev/null) || { echo "—"; return; }
  fi
  local total_sec=$(( end_sec - start_sec ))
  local days=$(( total_sec / 86400 ))
  local hours=$(( (total_sec % 86400) / 3600 ))
  local minutes=$(( (total_sec % 3600) / 60 ))
  if [[ "$start" == *" "*:* ]] && [ "$days" -eq 0 ]; then
    echo "${hours}h ${minutes}m"
  elif [ "$days" -eq 0 ]; then
    echo "<1d"
  else
    echo "${days}d"
  fi
}

echo "=== $WF_NAME — MISSION REPORT ==="
echo "Missions: $MISSIONS_DIR (global — all repos)"
echo "Date: $(date '+%Y-%m-%d %H:%M')"
echo ""

TOTAL_CURRENT=0
TOTAL_DONE=0

for idx in "${!id_arr[@]}"; do
  MEMBER="${id_arr[$idx]}"
  LABEL="${label_arr[$idx]}"
  CURRENT_DIR="$MISSIONS_DIR/$MEMBER/current"
  DONE_DIR="$MISSIONS_DIR/$MEMBER/done"

  CURRENT_COUNT=$(find "$CURRENT_DIR" -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
  DONE_COUNT=$(find "$DONE_DIR" -name "*.md" 2>/dev/null | wc -l | tr -d ' ')

  if [ "$CURRENT_COUNT" -gt 0 ] || [ "$DONE_COUNT" -gt 0 ]; then
    echo "--- $LABEL ---"
    if [ "$CURRENT_COUNT" -gt 0 ]; then
      echo "  Active ($CURRENT_COUNT):"
      while IFS= read -r f; do
        ISSUE=$(basename "$f" .md)
        TITLE=$(grep "^# Mission:" "$f" 2>/dev/null | sed 's/^# Mission: //' | head -1)
        REPO=$(grep "^\*\*Repo:\*\*" "$f" 2>/dev/null | sed 's/\*\*Repo:\*\* *//' | head -1)
        REPO_SHORT="${REPO##*/}"
        KEY="${REPO_SHORT:+$REPO_SHORT#}$ISSUE"
        START=$(grep "^\*\*Started:\*\*" "$f" 2>/dev/null | sed 's/\*\*Started:\*\* *//' | head -1)
        DUR=$(calc_duration "$START" "")
        if [ -n "$START" ] && [ "$START" != "-" ]; then
          echo "    • $KEY — $TITLE"
          echo "      started $START · in progress ${DUR}"
        else
          echo "    • $KEY — $TITLE"
        fi
      done < <(find "$CURRENT_DIR" -name "*.md" 2>/dev/null | sort)
    else
      echo "  Active: none"
    fi
    if [ "$DONE_COUNT" -gt 0 ]; then
      echo "  Done ($DONE_COUNT):"
      while IFS= read -r f; do
        ISSUE=$(basename "$f" .md)
        TITLE=$(grep "^# Mission:" "$f" 2>/dev/null | sed 's/^# Mission: //' | head -1)
        REPO=$(grep "^\*\*Repo:\*\*" "$f" 2>/dev/null | sed 's/\*\*Repo:\*\* *//' | head -1)
        REPO_SHORT="${REPO##*/}"
        KEY="${REPO_SHORT:+$REPO_SHORT#}$ISSUE"
        START=$(grep "^\*\*Started:\*\*" "$f" 2>/dev/null | sed 's/\*\*Started:\*\* *//' | head -1)
        END=$(grep "^\*\*Completed:\*\*" "$f" 2>/dev/null | sed 's/\*\*Completed:\*\* *//' | head -1)
        DUR=$(calc_duration "$START" "$END")
        if [ -n "$START" ] && [ "$START" != "-" ]; then
          END_DISP="${END:----}"
          echo "    • $KEY — ${TITLE:-untitled}"
          echo "      $START → $END_DISP · $DUR"
        else
          echo "    • $KEY — ${TITLE:-untitled}"
        fi
      done < <(find "$DONE_DIR" -name "*.md" 2>/dev/null | sort)
    else
      echo "  Done: none"
    fi
    echo ""
  fi

  TOTAL_CURRENT=$((TOTAL_CURRENT + CURRENT_COUNT))
  TOTAL_DONE=$((TOTAL_DONE + DONE_COUNT))
done

if [ $((TOTAL_CURRENT + TOTAL_DONE)) -eq 0 ]; then
  echo "No missions logged yet. Start work on an issue to begin."
else
  echo "=== TOTAL ==="
  echo "  Active: $TOTAL_CURRENT  |  Completed: $TOTAL_DONE  |  Total: $((TOTAL_CURRENT + TOTAL_DONE))"
fi
```

Run the command above and present the results clearly.
