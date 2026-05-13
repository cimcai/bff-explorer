# BFF Explorer Agent Notes

This file is for dev agents. Keep it operational, current, and biased toward
changes that preserve the simulator's substrate fidelity.

## Current Product Shape

- The first screen is the soup canvas with play/reset/fullscreen controls
  and checkpoint scrubbing, followed by the collapsed Controls section below.
- Every non-canvas section starts collapsed. Do not add always-open panels
  without a strong reason.
- Defaults should favor autonomous replicator emergence from random soup.
  Injected presets are secondary comparison/demo tools, not the primary path.
- Numeric simulation tuning is nested under Advanced parameters.
- The program browser intentionally hides singleton programs. Random soup
  produces thousands of one-off tapes; showing them is UI noise.
- Auto-capture was removed. Reintroduce recording only as a deliberately tested
  export workflow, preferably behind a lazy-loaded module.

## Engineering Priorities

- Preserve deterministic simulation semantics: same seed/config should produce
  identical soup, metrics, and checkpoint branches.
- Treat `DEFAULT_MUTATION_RATE` as a product default for autonomous emergence,
  not as a value chosen to protect injected presets.
- Keep `src/main.ts` as bootstrap/orchestration. New UI state should live in a
  focused controller under `src/ui/`.
- Keep browser UI mobile-first, linear, and collapsed by default.
- Avoid heavyweight first-load dependencies. KaTeX and WebM duration fixing
  were removed because they dominated bundle size for non-core features.
- Keep metrics explainable in plain text. Use formulas only if they earn the
  cost in clarity and implementation complexity.

## Checks

Before redeploying app changes:

```sh
npm test
npm run build
BFF_EXPLORER_URL=https://dangirsh.org/bff/ npm run test:browser
```

See `AGENTS.md` for the deployment path through `private-tsurf`.
