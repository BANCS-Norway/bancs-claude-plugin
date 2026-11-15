// What a Bash command line actually runs, for the hooks that guard a command (#88).
// Convention: docs/hook-conventions.md.
//
// A guard that looks for `git commit` in the raw text also finds it in a commit message, a PR body
// or the body of a heredoc that writes a file. `codeOf` walks the command once and keeps only what
// the shell would run: quoted text becomes `""` and heredoc bodies are dropped. A command
// substitution inside double quotes is code, so it is kept (after a `;`) and scanned the same way.
// It never throws: an unterminated quote or substitution just ends at the end of the command, and
// substitutions nested deeper than MAX_DEPTH are read as plain text, so the recursion is bounded.

const MAX_DEPTH = 100;

const HEREDOC = /^<<(-?)[ \t]*(?:'([^']*)'|"([^"]*)"|\\?([^\s;&|()<>'"]+))/;

/** Skips the bodies of the heredocs started on the line that just ended; returns the next index. */
function skipBodies(s, i, pending) {
  for (const { word, strip } of pending) {
    while (i < s.length) {
      let end = s.indexOf('\n', i);
      if (end < 0) end = s.length;
      const line = s.slice(i, end);
      i = Math.min(end + 1, s.length);
      if ((strip ? line.replace(/^\t+/, '') : line) === word) break;
    }
  }
  return i;
}

/** Inside double quotes from `i`: returns { code, i } with the code of any `$(...)` and the index after the closing quote. */
function scanDouble(s, i, depth) {
  let code = '';
  while (i < s.length) {
    const c = s[i];
    if (c === '\\') i += 2;
    else if (c === '"') return { code, i: i + 1 };
    else if (c === '$' && s[i + 1] === '(' && depth < MAX_DEPTH) {
      const nested = scan(s, i + 2, true, depth + 1);
      code += ` ; ${nested.out} ; `;
      i = nested.i;
    } else i++;
  }
  return { code, i };
}

/** Scans from `i`. With `nested`, stops after the `)` that closes a `$(`. Returns { out, i }. */
function scan(s, i, nested = false, depth = 0) {
  let out = '';
  let parens = 0;
  const pending = [];
  while (i < s.length) {
    const c = s[i];
    if (c === '\\') {
      out += s.slice(i, i + 2);
      i += 2;
    } else if (c === "'") {
      const end = s.indexOf("'", i + 1);
      out += '""';
      i = end < 0 ? s.length : end + 1;
    } else if (c === '"') {
      const { code, i: next } = scanDouble(s, i + 1, depth);
      out += `""${code}`;
      i = next;
    } else if (c === '<' && s.startsWith('<<<', i)) {
      out += '<<<'; // a here-string takes a word, not a body
      i += 3;
    } else if (c === '<' && s[i + 1] === '<' && HEREDOC.test(s.slice(i, i + 200))) {
      const m = HEREDOC.exec(s.slice(i, i + 200));
      pending.push({ word: m[2] ?? m[3] ?? m[4], strip: m[1] === '-' });
      out += '<<""';
      i += m[0].length;
    } else if (c === '\n') {
      out += c;
      i = pending.length ? skipBodies(s, i + 1, pending.splice(0)) : i + 1;
    } else if (nested && c === ')' && parens === 0) {
      return { out, i: i + 1 };
    } else {
      if (c === '(') parens++;
      else if (c === ')') parens = Math.max(0, parens - 1);
      out += c;
      i++;
    }
  }
  return { out, i };
}

/** The command line with quoted text blanked and heredoc bodies removed. */
export function codeOf(command) {
  return scan(String(command), 0).out;
}

// Where a `git` command can start, for the guards that look for one in `codeOf()` output (#87).
// A command starts at the beginning, after ; & | ( { or a newline, then may be led by `VAR=x`
// assignments, a keyword (then, do, else, if, ...) or a wrapper that runs its next word (sudo, env,
// command, time, xargs, ...) and `!`. A wrapper's own options (`sudo -u root git`) are not read: that
// form passes. `git` may carry a path. Its global options come before the subcommand: `-c k=v`, `-p`,
// `--no-pager`, `--exec-path=x`, and the few that take their value as a separate word. They are listed
// by name so that `git --no-pager log -C` is not read as `--no-pager` taking `log`.
// A word stops at a separator, not only at a space: `\S*` here would run over a long row of `;` from every
// one of them, and a hook must not stall on an odd command.
const WORD = String.raw`[^\s;&|(){}]`;
// After the separator only blanks are skipped, not `\s`: a newline is a separator itself, and `\s*` would
// run across a long row of them from each one.
const START = String.raw`(?:^|[;&|({\n][ \t]*)`;
const LEADERS = String.raw`(?:(?:then|do|else|elif|if|while|until|time|command|exec|sudo|env|xargs|nohup|!)\s+|\w+=${WORD}+\s+)*`;
const GIT = String.raw`(?:${WORD}*/)?git\s+`;
const GLOBAL_OPTIONS = String.raw`(?:(?:-c\s+\S+|-[pP]|--(?:git-dir|work-tree|namespace|super-prefix|config-env)\s+\S+|--[\w-]+(?:=\S+)?)\s+)*`;

/** A RegExp for `git <global options> <tail>` in command position; `tail` is a regex source. Test it against `codeOf()` output. */
export function gitCommandPattern(tail) {
  return new RegExp(START + LEADERS + GIT + GLOBAL_OPTIONS + tail);
}
