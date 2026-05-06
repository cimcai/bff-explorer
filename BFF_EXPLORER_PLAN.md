# BFF Explorer

## Project Direction

Build a judge-facing interactive explorer of the paper's 2D BFF substrate: a digital petri dish where self-modifying programs interact locally and self-replicating structure can spread across a 2D soup. The project should preserve the 2D BFF mechanics while making the emergence visible, controllable, and shareable.

## Staged Roadmap

### Stage 0: Fidelity Spike

- Scaffold a Vite + TypeScript web app served from `/bff/`.
- Implement a faithful browser-side `bff_noheads` simulation core.
- Run the simulation in a Web Worker so the UI remains responsive.
- Render the full 2D soup as `8 x 8` tiles per 64-byte tape.
- Add deterministic seeds, mutation-rate control, periodic checkpoints, and checkpoint scrubbing.
- Validate the interpreter, grid scheduler, checkpoint restore, and build/test workflow.

### Stage 1A: Scientific Sandbox Basics

- Add zoom and pan so the full 2D soup can be inspected from petri-dish scale down to individual program tiles.
- Make checkpoint scrubbing stable with coarse default checkpoints, stable checkpoint IDs, preview/branch semantics, and memory caps.
- Add hover/focus tooltips for all parameters and metrics.
- Add a live emergence metric based on higher-order organization: byte entropy minus a whole-program dictionary compression estimate.
- Add a small live chart and phase-transition marker.
- Add a calibration script for local seed/mutation sweeps so future defaults can be chosen from reproducible evidence.

### Stage 1B: MVP Demo

- Add a polished petri-dish interface for hackathon judging.
- Add a paint tool that seeds a known stable replicator into a circular brush region.
- Add a live stable-replicator metric and chart.
- Add curated presets that reliably demonstrate spread and competition.

### Stage 2: Performance And Scale

- Benchmark Chrome performance on MacBook Pro at and above `240 x 135`.
- Move the core to C++/WebAssembly if TypeScript is not fast enough for larger runs.
- Add adaptive render quality, checkpoint thinning, and optional WASM threads if deployment can support cross-origin isolation.

### Stage 3: Richer Metrics

- Track stable-replicator count, occupied area, dominant program/hash frequency, diversity, entropy/compressibility, and colony front expansion.
- Add visual overlays for replicator-like regions and dominant lineages.

### Stage 4: Interaction Tools

- Add brushes for random code injection, kill/clear, local mutation-rate fields, barriers, and nutrients.
- Keep each intervention tied to explicit substrate rules rather than hidden fitness functions.

### Stage 5: Save And Share

- Export rendered WebM videos from the replay/checkpoint timeline.
- Save run configs and intervention history.
- Add shareable URLs for small configs and downloadable replay archives for larger runs.

## Stage 0 Implementation Plan

### Simulation Core

- Use `64` byte tapes and concatenate interacting pairs into a `128` byte execution buffer.
- Match `bff_noheads`: valid instructions are `[]+-.,<>{}`, byte `0` is the null value used by loop checks, and all other bytes are no-ops.
- Initialize execution with `pc = 0`, `head0 = 128`, `head1 = 128`; wrap heads with `& 127` before each instruction.
- Run each pair for at most `8192` instruction reads.
- Apply mutation before execution using deterministic seeded randomness.
- Default grid is `240 x 135`, with radius-2, non-wrapping local interactions.

### Browser Runtime

- Own the simulation in a Web Worker.
- Run epochs within an adaptive wall-clock budget, defaulting to roughly `10 ms` per tick.
- Render at most once per tick, using `OffscreenCanvas` when available and a transferred pixel-buffer fallback otherwise.
- Store full soup checkpoints in memory and allow scrubbing only to existing checkpoints.
- Resume deterministically from restored checkpoints.

### UI

- Show a full petri-dish canvas.
- Provide play/pause, reset, seed, mutation-rate, checkpoint interval, and checkpoint scrub controls.
- Show diagnostics for epoch, sim speed, render FPS, pair count, average instruction reads per pair, and checkpoint count.

### Acceptance Criteria

- `npm test` succeeds.
- `npm run build` succeeds.
- Default paper-scale simulation starts without blocking the UI.
- At least 10 checkpoints can be scrubbed in a normal run.
- Production build is compatible with `https://dangirsh.org/bff/`.

## Deployment Note

The target public URL is `https://dangirsh.org/bff/`. Deployment details for `neurosys` are intentionally deferred for Stage 0, but the app is configured with the correct base path.
