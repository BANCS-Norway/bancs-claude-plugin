// Skill frontmatter contract. See docs/skill-frontmatter.md.
// Pure functions: text in, data or error strings out.

export const KINDS = ['shim', 'process', 'convention'];

// Flat `key: value` lines between the opening and closing `---`.
// Returns null when the file has no frontmatter block.
export function parseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!m) return null;
  const fields = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (kv) fields[kv[1]] = kv[2].trim().replace(/^(["'])(.*)\1$/, '$2');
  }
  return fields;
}

// YAML block scalar indicators: the value continues on indented lines, which
// this flat parser does not read.
const BLOCK_SCALAR = /^[>|][+-]?$/;

// A skill without `kind` is untagged and passes (#43 tags them and makes it
// required). A skill that declares `kind` must satisfy the whole contract.
export function checkSkillFrontmatter(rel, text) {
  const fm = parseFrontmatter(text);
  if (!fm) return [`${rel}: missing frontmatter block`];
  const errors = [];
  if (fm.kind === undefined) return errors;
  for (const field of ['kind', 'checked', 'fills-gap', 'retire-when']) {
    if (BLOCK_SCALAR.test(fm[field] ?? '')) errors.push(`${rel}: "${field}" must be a single-line value`);
  }
  if (!KINDS.includes(fm.kind)) {
    errors.push(`${rel}: unknown kind ${JSON.stringify(fm.kind)} (expected ${KINDS.join(', ')})`);
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(fm.checked ?? '')) {
    errors.push(`${rel}: "checked" must be YYYY-MM (got ${JSON.stringify(fm.checked)})`);
  }
  if (fm.kind === 'shim') {
    for (const field of ['fills-gap', 'retire-when']) {
      if (!fm[field]) errors.push(`${rel}: shim missing "${field}"`);
    }
  }
  return errors;
}
