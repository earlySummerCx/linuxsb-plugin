import { readFile, mkdir, writeFile } from 'node:fs/promises';
const read = p => readFile(new URL('../' + p, import.meta.url), 'utf8');
const [core, app, css, close] = await Promise.all(['src/core.js', 'src/app.js', 'src/card.css', 'assets/close.svg'].map(read));
const code = `${core}\nglobalThis.LinuxSBCardCSS=${JSON.stringify(css)};\nglobalThis.LinuxSBCardClose=${JSON.stringify('data:image/svg+xml;base64,' + Buffer.from(close).toString('base64'))};\n${app}\n`;
await mkdir('dist', { recursive: true });
await writeFile('dist/content.js', code);
await writeFile('dist/manifest.json', JSON.stringify({ manifest_version: 3, name: 'LINUX SB 用户资料卡', version: '0.1.0', description: '点击头像查看简介、签名、积分与称号，保留论坛阅读位置。', minimum_chrome_version: '114', content_scripts: [{ matches: ['https://linux.sb/*'], js: ['content.js'], run_at: 'document_idle' }] }, null, 2));
console.log('Built Chrome extension in dist/');
