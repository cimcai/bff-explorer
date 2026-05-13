# BFF Explorer

An interactive browser tool for studying 2D BFF artificial-life dynamics from
https://arxiv.org/abs/2406.19108.

The app is intentionally canvas-first: start or pause an autonomous random soup,
scrub saved checkpoints, and open details only when needed. Known replicator
injection is available as a secondary comparison tool.

## Features

- Fast TypeScript implementation of the paper-style 2D BFF substrate.
- Web Worker simulation with OffscreenCanvas rendering when available.
- Checkpoint scrubbing with deterministic branch/resume behavior.
- Low nonzero default mutation for autonomous program discovery.
- Optional known replicator presets for controlled comparison runs.
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
