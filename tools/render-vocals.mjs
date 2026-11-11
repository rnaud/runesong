// Renders the Choir-mode vocal stems with the Chimera physical-model voice
// (https://github.com/jamesondh/chimera-vocal-synth, MIT).
//
//   git clone https://github.com/jamesondh/chimera-vocal-synth
//   (cd chimera-vocal-synth && cargo build --release -p chimera-cli)
//   node tools/render-vocals.mjs /path/to/chimera-vocal-synth
//
// Needs macOS `afconvert` for the WAV -> AAC step.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEVELS, VOCAL_LEAD_IN } from '../src/songs.js';

const chimera = process.argv[2];
if (!chimera) throw new Error('usage: node tools/render-vocals.mjs <chimera repo>');
const bin = path.join(chimera, 'target/release/chimera');
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(root, 'assets/vocals');
const tmp = path.join(tmpdir(), 'runesong-vocals');
mkdirSync(outDir, { recursive: true });
mkdirSync(tmp, { recursive: true });

for (const level of LEVELS) {
  level.verses.forEach((verse, i) => {
    const name = `${level.id}-${i}`;
    const json = path.join(tmp, `${name}.json`);
    writeFileSync(json, JSON.stringify({
      bpm: level.bpm,
      vibrato: 30,
      t0: VOCAL_LEAD_IN,
      lyrics: verse.lyrics,
      notes: verse.notes.map(([m, b]) => [m ? m + level.shift : 0, b]),
    }));
    const wav = path.join(tmp, name);
    console.log(execFileSync(bin, ['render', 'notes', json, wav, level.body], { cwd: chimera }).toString().trim());
    execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '72000', `${wav}.wav`, path.join(outDir, `${name}.m4a`)]);
  });
}
rmSync(tmp, { recursive: true, force: true });
console.log('stems written to', outDir);
