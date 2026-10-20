#!/usr/bin/env node
/**
 * Packs the web export (dist/) into one self-contained HTML file: scripts,
 * styles, fonts and images inlined. Used for hosts that serve a single page,
 * such as a shareable preview link.
 *
 *   npx expo export --platform web --output-dir dist && node scripts/build-showcase.mjs [out.html]
 */
import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve(import.meta.dirname, '../dist');
const out = path.resolve(process.argv[2] ?? path.join(dist, 'kairos-showcase.html'));
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');

const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
const styles = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]);
const read = (p) => fs.readFileSync(path.join(dist, p.replace(/^\//, '')));
const MIME = { '.ttf': 'font/ttf', '.otf': 'font/otf', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

let inlined = 0;
const inlineAssets = (js) =>
  js.replace(/"(\/assets\/[^"]+)"/g, (whole, p) => {
    const file = path.join(dist, p.replace(/^\//, ''));
    if (!fs.existsSync(file)) return whole;
    inlined++;
    return JSON.stringify(`data:${MIME[path.extname(p)] ?? 'application/octet-stream'};base64,${fs.readFileSync(file).toString('base64')}`);
  });

const js = scripts.map((s) => inlineAssets(read(s).toString('utf8')).replace(/<\/script/gi, '<\\/script')).join('\n');
const css = styles.map((s) => read(s).toString('utf8')).join('\n');

const page = `<title>Kairos</title>
<meta name="description" content="Her rhythm. Your moment. A private, cycle-aware companion for couples.">
<style>
:root { --bg: #0D0A0C; color-scheme: dark; }
@media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) { --bg: #F7F2EE; color-scheme: light; } }
:root[data-theme="light"] { --bg: #F7F2EE; color-scheme: light; }
:root[data-theme="dark"] { --bg: #0D0A0C; color-scheme: dark; }
html, body { height: 100%; }
body { overflow: hidden; background: var(--bg); }
#root { display: flex; height: 100%; flex: 1; }
${css}
</style>
<div id="root"></div>
<script>
  // Hosts serve this page from paths the router has never heard of; start it at its own root.
  try { if (location.pathname !== '/') history.replaceState(history.state, '', '/' + location.hash); } catch (e) {}
</script>
<script>
${js}
</script>
`;
fs.writeFileSync(out, page);
console.log(`${out}: ${(page.length / 1048576).toFixed(2)} MB, ${inlined} assets inlined`);
