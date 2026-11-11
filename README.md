# RUNESONG

An original rhythm rail shooter in four singing realms, built with three.js and the Web Audio API.

Hold and sweep to lock on to as many as eight foes, release to send the volley. Every strike is
quantised to the beat and plays a note in the realm's scale, so playing well plays the song.

- **Instrumental** — a fully procedural score (drums, bass, pads, arpeggios, synth lead) that
  adds layers as each realm progresses.
- **Choir** — the lead line is *sung*: two original verses per realm, rendered with
  [Chimera](https://github.com/jamesondh/chimera-vocal-synth), a physical-model voice synthesizer (MIT).

Controls: move to aim · hold mouse / touch / Space to lock · release to fire · Esc pauses · V switches the lead voice.

## Run locally

No build step. Serve the folder over HTTP:

```sh
python3 -m http.server 5188
```

## Re-rendering the vocals

Melodies and lyrics live in `src/songs.js`. The stems in `assets/vocals/` are rendered offline by the Chimera CLI:

```sh
git clone https://github.com/jamesondh/chimera-vocal-synth
(cd chimera-vocal-synth && cargo build --release -p chimera-cli)
node tools/render-vocals.mjs ./chimera-vocal-synth   # needs macOS afconvert
```

## Credits

World, music, lyrics and code are original to this project. Vocal synthesis by Chimera (MIT). Rendering by three.js (MIT).
