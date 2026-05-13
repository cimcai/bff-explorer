# BFF Explorer

An interactive browser tool for studying 2D BFF artificial-life dynamics from
https://arxiv.org/abs/2406.19108.

The app is intentionally canvas-first: start or pause the soup, scrub saved
checkpoints, inject a known BFF replicator, and open details only when needed.

## Features

- Fast TypeScript implementation of the paper-style 2D BFF substrate.
- Web Worker simulation with OffscreenCanvas rendering when available.
- Checkpoint scrubbing with deterministic branch/resume behavior.
- Known replicator presets for quick demonstrations of spread.
- Minimal repeated-program browser and pair interaction lab.
- Emergence metrics for structure, phase shift, dominant program share,
  executable byte fraction, and unique program fraction.

## Development

```sh
npm install
npm test
npm run build
npm run dev
```

For browser-level verification:

```sh
BFF_EXPLORER_URL=http://127.0.0.1:5173/bff/ npm run test:browser
```

The production app is served from `/bff/`.
