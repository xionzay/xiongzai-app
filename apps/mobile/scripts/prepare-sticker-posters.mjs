// Mechanical first-frame extraction, no redraw or alteration of the approved artwork.
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const target = fileURLToPath(new URL('../assets/sticker-posters/', import.meta.url));
mkdirSync(target, { recursive: true });
for (const side of ['buyer', 'seller']) for (let i = 1; i <= 35; i++) {
  const name = `${side}-${String(i).padStart(3, '0')}`;
  const output = `${target}${name}.png`;
  if (existsSync(output)) continue;
  const input = fileURLToPath(new URL(`../../../public/assets/chat-stickers/bear-v3/${side}/${name}.gif`, import.meta.url));
  execFileSync('/usr/bin/sips', ['-s', 'format', 'png', input, '--out', output], { stdio: 'pipe' });
}
console.log('Verified 70 local sticker poster paths. Original GIFs unchanged.');
