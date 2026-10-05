// Generates lesson demo clips by flying scripted pilots with the real physics.
// Uses Vite to load the TypeScript sources, so no extra tooling is needed.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { PILOTS, flyDemo } = await server.ssrLoadModule('/scripts/demo-pilots.ts');
  mkdirSync('content/clips', { recursive: true });
  for (const pilot of PILOTS) {
    const clip = flyDemo(pilot);
    const file = `content/clips/${pilot.id}.json`;
    writeFileSync(file, JSON.stringify(clip) + '\n');
    const last = clip.frames.at(-1);
    console.log(`${file}: ${clip.frames.length} frames, ends at y=${last[2].toFixed(2)}`);
  }
} finally {
  await server.close();
}
