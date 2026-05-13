# BFF Explorer Architecture Notes

Audience: future dev agents.

## Runtime Flow

- `src/main.ts` renders the shell, resolves DOM refs, creates UI controllers,
  starts the worker, and routes worker messages.
- `src/worker/sim.worker.ts` owns `BffSimulator`, rendering, status publishing,
  checkpoint views, and program injection.
- `src/simulation/` contains deterministic core logic. UI code should not mutate
  simulator state directly.
- `src/ui/` contains browser controllers. Each controller should own one concern:
  viewport gestures, checkpoints, runtime controls, metrics, repeated programs,
  replicator controls, interaction lab, tooltips, or shared canvas drawing.

## Determinism Invariants

- `BffSimulator` uses independent RNG streams for initial soup, scheduling,
  mutation, and interventions.
- Checkpoints store soup plus all RNG stream states. Previewing a checkpoint must
  not discard future checkpoints. Resuming from a preview commits a branch.
- Injection uses the intervention RNG and samples without replacement. It should
  not disturb future schedule or mutation RNG streams.
- Runtime updates for mutation/checkpoint/metric/time budget must not reset the
  soup.

## UI Invariants

- First viewport should stay canvas-first on desktop and mobile.
- All non-canvas sections start collapsed.
- Controls panel flow: preset injection first, advanced numeric tuning second.
- Repeated Programs should show only programs with `count > 1`.
- Long explanations belong in collapsed docs or tooltips, not in always-visible
  first-load UI.

## Deferred Recording

Auto-capture was removed to keep the app small and simpler. A future recording
feature should be designed as explicit export:

- Put it in a collapsed Export panel.
- Lazy-load any WebM duration or muxing dependency.
- Add focused tests for MediaRecorder availability, cancellation, save metadata,
  and browser fallback behavior.
- Do not let recording state leak into the main runtime loop.
