// Raster export of the actual Web SVG components / CSS overlay; does not redraw artwork.
import { Buffer } from 'node:buffer';
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE || 'sharp');
const ts = require('typescript');
const { renderToStaticMarkup } = require('react-dom/server');
const React = require('react');
const source = readFileSync(new URL('../../../app/ChatIcon.tsx', import.meta.url), 'utf8');
const context = { exports: {}, require };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText, context);
const destination = fileURLToPath(new URL('../assets/chat-controls/', import.meta.url));
mkdirSync(destination, { recursive: true });
for (const kind of ['back', 'sound', 'smile', 'plus', 'shield', 'image', 'audio', 'close']) {
  const svg = renderToStaticMarkup(React.createElement(context.exports.ChatIcon, { kind })).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" ').replaceAll('currentColor', '#202923');
  await sharp(Buffer.from(svg)).png().toFile(`${destination}${kind}.png`);
}
const overlay = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="800"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffebb1" stop-opacity=".77"/><stop offset=".43" stop-color="#e6f4ff" stop-opacity=".74"/><stop offset=".63" stop-color="#e6f4ff" stop-opacity=".74"/><stop offset="1" stop-color="#ffedb9" stop-opacity=".77"/></linearGradient></defs><rect width="400" height="800" fill="url(#g)"/></svg>';
await sharp(Buffer.from(overlay)).png().toFile(`${destination}wallpaper-overlay.png`);
console.log('Exported approved Web chat controls and translucent wallpaper overlay.');
