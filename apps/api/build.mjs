// Bundles the API for production: workspace packages (TypeScript source) are inlined,
// npm dependencies stay external and are installed with `npm ci --omit=dev`.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const external = Object.keys(pkg.dependencies).filter((d) => !d.startsWith('@ccih/'));

for (const entry of ['server', 'db/cli']) {
  await build({
    entryPoints: [`src/${entry}.ts`],
    outfile: `dist/${entry === 'server' ? 'server' : 'cli'}.js`,
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'esm',
    sourcemap: true,
    external,
    logLevel: 'warning',
  });
}
console.warn('API gerada em apps/api/dist');
