// Commands fed to both commit checks, the guard and the Stop step check, so they cannot drift apart (#93).
export const lines = (...l) => l.join('\n');

export const COMMITS = ['git commit -m x', 'git commit', 'cd a && git commit -am x', 'FOO=1 git commit -m x', 'git -c user.name=x commit -m y', 'git add . ; git commit -m x', 'git --no-pager commit -m x', 'git commit -m "add a -h flag and --help text"', "git commit -m 'fix'"];

export const NOT_COMMITS = ['git status', 'git commit --help', 'git log --grep "git commit"', 'echo git commit', 'git commit-tree HEAD^{tree}', 'gitk commit', 'npm run commit', 'echo "x; git commit -m y"'];

export const LED_COMMITS = ['if true; then git commit -m x; fi', 'for d in a; do git commit -m x; done', '{ git commit -m x; }', 'sudo git commit -m x', '/usr/bin/git commit -m x', 'git -p commit -m x', 'git --git-dir g commit -m x'];

export const LED_NOT_COMMITS = ['echo then git commit', 'ls /usr/bin/git commit', 'git --no-pager log commit'];

export const MENTIONS = [
  lines("cat > note.md <<'EOF'", 'A hook\'s filter is not safe: `if: "Bash(git commit *)"` ran for a command that was neither.', 'EOF', 'gh issue comment 85 --body-file note.md'),
  lines('cat > note.md <<EOF', 'see (git commit -m x) in the log', 'EOF'),
  lines('gh pr edit 84 --body "$(cat <<\'EOF\'', "the hook's rule: (git commit) is checked", 'EOF', ')"'),
  lines('cat <<-EOF', '\tgit commit -m x', '\tEOF', 'ls'),
  lines('cat <<A <<B', 'git commit -m x', 'A', '; git commit -m y', 'B', 'ls'),
  'cat <<< "git commit -m x"',
  'gh issue comment 1 --body "run (git commit) later"',
  'echo "a commit is next"',
  'B=$(gh pr view 439 --json body --jq .body) && gh pr edit 439 --body "$B"',
  'gh pr create --title "docs: git commit" --body-file b.md',
  'echo "git commit',
];

export const REAL_COMMITS = [
  lines('git commit -m "$(cat <<\'EOF\'', 'fix: "x" and it\'s fine', 'EOF', ')"'),
  'git add . && git commit -m x',
  lines("cat > f <<'EOF'", 'body', 'EOF', 'git commit -m x'),
  'echo "$(git commit -m x)"',
  lines('git commit -m x <<EOF', 'ignored', 'EOF'),
];
