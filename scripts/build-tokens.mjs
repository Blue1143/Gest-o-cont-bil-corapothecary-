#!/usr/bin/env node
/**
 * Generates packages/ui/src/styles/tokens.generated.css from ccih-integra/tokens.json, the single
 * source of truth shared with the published design system. `--check` fails when the file is stale.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(root, 'ccih-integra/tokens.json');
const OUT = resolve(root, 'packages/ui/src/styles/tokens.generated.css');

const tokens = JSON.parse(readFileSync(SRC, 'utf8'));
const themes = tokens.color.themes.map((t) => t.id);
const [first] = themes;

const valueFor = (v, theme) => (typeof v === 'string' ? v : (v[theme] ?? v[first]));
const resolveAlias = (v) => {
  const m = /^\{(.+)\}$/.exec(v);
  return m ? `var(--${m[1]})` : v;
};
const decl = (name, value) => `  --${name}: ${value};`;

function themeBlock(theme) {
  const colors = tokens.color.tokens.map((t) => decl(t.name, resolveAlias(valueFor(t.value, theme))));
  const shadows = (tokens.shadow?.tokens ?? []).map((t) => decl(t.name, valueFor(t.value, theme)));
  return [...colors, ...shadows].join('\n');
}

const scalarFamilies = Object.entries(tokens).filter(
  ([key, fam]) => !['color', 'type', 'shadow'].includes(key) && fam && Array.isArray(fam.tokens),
);
const scalars = scalarFamilies.flatMap(([, fam]) => fam.tokens.map((t) => decl(t.name, t.value)));
const families = Object.entries(tokens.type.families).map(([k, v]) => decl(`font-${k}`, v));

const styles = tokens.type.groups.flatMap((g) => g.styles.map((s) => ({ ...s, family: s.family ?? g.family })));
const typeVars = styles.flatMap((s) => [
  decl(`${s.name}-size`, s.fontSize),
  decl(`${s.name}-line`, s.lineHeight),
  decl(`${s.name}-weight`, String(s.fontWeight)),
]);
const typeClasses = styles
  .map((s) => {
    const props = [
      `font-family: var(--font-${s.family})`,
      `font-size: var(--${s.name}-size)`,
      `line-height: var(--${s.name}-line)`,
      `font-weight: var(--${s.name}-weight)`,
      s.letterSpacing ? `letter-spacing: ${s.letterSpacing}` : null,
    ].filter(Boolean);
    return `.${s.name} { ${props.join('; ')}; }`;
  })
  .join('\n');

const dark = themes.find((t) => t === 'dark');
const css = `/* ${tokens.name} — generated from ccih-integra/tokens.json by scripts/build-tokens.mjs. Do not edit. */
:root, [data-theme="${first}"] {
  color-scheme: light;
${themeBlock(first)}
}
${themes
  .filter((t) => t !== first)
  .map((t) => `[data-theme="${t}"] {\n  color-scheme: dark;\n${themeBlock(t)}\n}`)
  .join('\n')}
${dark ? `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme]) {\n    color-scheme: dark;\n${themeBlock(dark).replace(/^ {2}/gm, '    ')}\n  }\n}` : ''}
:root {
${[...scalars, ...families, ...typeVars].join('\n')}
}
${typeClasses}
`;

if (process.argv.includes('--check')) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  if (current !== css) {
    console.error('tokens.generated.css está desatualizado. Rode `npm run tokens`.');
    process.exit(1);
  }
  console.warn('tokens.generated.css em dia.');
} else {
  writeFileSync(OUT, css);
  console.warn(`Gerado ${OUT}`);
}
