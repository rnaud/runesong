// Original songs for every realm. Melodies are [midi, beats]; midi 0 is a rest.
// The same melody is played by a synth lead (Instrumental) or sung by the
// Chimera physical-model voice (Choir mode, stems rendered by tools/render-vocals.mjs).

const L5 = (a, b, c, d, e) => [[a, 1], [b, 1], [c, 1], [d, 1], [e, 2], [0, 2]];
const L6 = (a, b, c, d, e, f) => [[a, 1], [b, 1], [c, 1], [d, 1], [e, 1], [f, 1], [0, 2]];

// chord = [root midi (bass register), 'm' | 'M']
export const LEVELS = [
  {
    id: 'hollow',
    name: 'Verdant Hollow',
    tagline: 'where the old roots dream',
    bpm: 112,
    body: 'female',
    shift: 0,
    scale: [62, 64, 65, 67, 69, 72, 74, 76, 77, 79, 81, 84],
    chords: [[38, 'm'], [41, 'M'], [36, 'M'], [43, 'M'], [38, 'm'], [41, 'M'], [36, 'M'], [38, 'm']],
    palette: { bg: 0x031208, fog: 0x0a3a1c, a: 0x6dffb0, b: 0xffe27a, c: 0x2fbf71, enemy: 0xff7a5c },
    verses: [
      {
        lyrics: 'Wake now, green and gold, morning in the leaves. Follow where the old river sings and weaves.',
        notes: [...L5(62, 65, 69, 67, 69), ...L5(67, 64, 67, 69, 67), ...L5(69, 72, 74, 72, 69), ...L5(67, 64, 65, 64, 62)],
      },
      {
        lyrics: 'Lantern moths arise, lead me through the fern. Under amber skies all the old roots turn.',
        notes: [...L5(69, 67, 65, 67, 69), ...L5(72, 71, 69, 71, 67), ...L5(74, 72, 69, 72, 74), ...L5(72, 69, 67, 64, 62)],
      },
    ],
  },
  {
    id: 'sanctum',
    name: 'Tidal Sanctum',
    tagline: 'bells beneath the tide',
    bpm: 98,
    body: 'male',
    shift: -12,
    scale: [57, 60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84],
    chords: [[33, 'm'], [29, 'M'], [36, 'M'], [31, 'M'], [33, 'm'], [29, 'M'], [31, 'M'], [33, 'm']],
    palette: { bg: 0x020a1c, fog: 0x06305a, a: 0x6fe8ff, b: 0xc9f6ff, c: 0x2a7bff, enemy: 0xff6fd0 },
    verses: [
      {
        lyrics: 'Deep below the tide silver bells are ringing. Hold your breath and glide, hear the water singing.',
        notes: [...L5(64, 69, 72, 71, 69), ...L6(67, 69, 72, 71, 69, 67), ...L5(64, 69, 72, 74, 72), ...L6(74, 72, 71, 67, 71, 69)],
      },
      {
        lyrics: 'Coral halls of blue keep an ancient promise. Each bright pearl is true, each small wave is honest.',
        notes: [...L5(69, 72, 76, 74, 72), ...L6(72, 72, 76, 74, 74, 71), ...L5(69, 72, 76, 77, 76), ...L6(74, 71, 72, 71, 69, 69)],
      },
    ],
  },
  {
    id: 'citadel',
    name: 'Ember Citadel',
    tagline: 'the forge that never sleeps',
    bpm: 126,
    body: 'male',
    shift: -12,
    scale: [64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83],
    chords: [[40, 'm'], [40, 'm'], [41, 'M'], [41, 'M'], [40, 'm'], [38, 'm'], [41, 'M'], [40, 'm']],
    palette: { bg: 0x140402, fog: 0x4a1206, a: 0xffa13d, b: 0xffe9a8, c: 0xff4a1c, enemy: 0x7af0ff },
    verses: [
      {
        lyrics: 'Iron gates are burning, hammers fall like rain. Hear the great wheel turning, break the ember chain.',
        notes: [...L6(64, 64, 67, 69, 71, 69), ...L5(65, 65, 69, 72, 69), ...L6(64, 67, 71, 72, 74, 72), ...L5(72, 69, 65, 65, 64)],
      },
      {
        lyrics: 'Ashes on the mountain, fire in the stone. Drink the molten fountain, stand and hold your own.',
        notes: [...L6(71, 71, 72, 71, 69, 67), ...L5(72, 72, 69, 72, 77), ...L6(76, 74, 72, 71, 72, 74), ...L5(72, 72, 69, 65, 64)],
      },
    ],
  },
  {
    id: 'spire',
    name: 'Star Spire',
    tagline: 'above the last storm',
    bpm: 132,
    body: 'female',
    shift: 0,
    scale: [60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84, 86],
    chords: [[36, 'M'], [31, 'M'], [33, 'm'], [29, 'M'], [36, 'M'], [31, 'M'], [29, 'M'], [36, 'M']],
    palette: { bg: 0x07031a, fog: 0x2a1466, a: 0xc7a6ff, b: 0xffffff, c: 0x7a5cff, enemy: 0xffd36f },
    verses: [
      {
        lyrics: "Higher than the storm, wings of light unfolding. All the stars are warm in the song we're holding.",
        notes: [...L5(67, 72, 76, 74, 74), ...L6(76, 76, 77, 76, 72, 69), ...L5(72, 76, 77, 76, 74), ...L6(77, 76, 72, 69, 74, 72)],
      },
      {
        lyrics: 'Sing the world awake, let the darkness scatter. One more dawn to make, nothing else will matter.',
        notes: [...L5(72, 74, 76, 72, 74), ...L6(76, 76, 72, 76, 77, 72), ...L5(76, 77, 76, 72, 71), ...L6(69, 72, 77, 76, 74, 72)],
      },
    ],
  },
];

export const VOCAL_LEAD_IN = 0.3; // seconds of pre-roll in every rendered stem
export const vocalUrl = (level, verse) => `assets/vocals/${level.id}-${verse}.m4a`;
