import type { SimulationConfig } from "../simulation/simulator";
import { MAX_CHECKPOINTS, MAX_TIME_BUDGET_MS } from "../simulation/constants";
import {
  DEFAULT_REPLICATOR_PRESET_ID,
  REPLICATOR_PRESETS,
  replicatorPresetById
} from "../simulation/replicatorPresets";
import {
  CHART_METRICS,
  CHART_SCALE_OPTIONS,
  CHART_WINDOW_OPTIONS,
  renderChartMetricEquation
} from "./metricChart";

export function renderAppShell(
  config: SimulationConfig,
  defaults: SimulationConfig
): string {
  return `
    <section class="shell">
      <div id="tooltipLayer" class="tooltip-layer" role="tooltip" hidden></div>
      <section class="workspace">
        <div class="simulation-layout">
          <div class="viewport" id="viewport">
            <canvas id="dish" width="1920" height="1080" aria-label="2D BFF soup"></canvas>
            <div class="canvas-hud canvas-hud-top" aria-label="Canvas controls">
              <button id="playPause" class="icon-button" type="button" aria-label="Play simulation" title="Play simulation" data-tip="Play simulation">Play</button>
              <button id="reset" class="icon-button" type="button" aria-label="Reset simulation" title="Reset" data-tip="Reset the soup using the current parameter values; fixed seed replays the exact run">Reset</button>
              <button id="fullscreen" class="icon-button" type="button" aria-label="Enter fullscreen" title="Fullscreen" data-tip="Enter fullscreen">Full</button>
            </div>
            <div class="canvas-scrubber" aria-label="Checkpoint scrubber">
              <div id="checkpointLabel">Checkpoint 0/0</div>
              <input id="checkpointScrubber" type="range" min="0" max="0" step="1" value="0" aria-label="Checkpoint scrubber" />
              <div id="checkpointEpochLabel">Epoch: 0</div>
              <button id="checkpointLatest" class="icon-button checkpoint-latest-button" type="button" aria-label="Jump to live latest state" title="Jump to live latest state" data-tip="Jump back to the live latest state">›</button>
            </div>
          </div>

          <section class="docs-section collapsible-section collapsed" aria-label="Documentation" data-collapsible-section="docs">
            ${sectionHead("Docs", "Core rules, replication meaning, and source links.", true)}
            <div class="section-body docs-body" data-collapse-body>
              <p><strong>State.</strong> The world is a fixed 240 by 135 grid. Each cell stores one 64-byte BFF tape. The cell count is fixed: there are no organisms, resources, fitness scores, births, or deaths; only bytes change.</p>
              <p><strong>Language.</strong> BFF is a self-modifying <a href="https://www.brainfuck.org/brainfuck.html" target="_blank" rel="noreferrer">Brainfuck</a> variant: the tape is both program and memory. Two heads read and write the same tape. <code>&lt; &gt;</code> move head 0, <code>{ }</code> move head 1, <code>+ -</code> edit head 0, <code>.</code> copies head 0 to head 1, <code>,</code> copies head 1 to head 0, and <code>[ ]</code> loop on whether head 0 reads byte <code>0</code>. Other byte values are inert data until execution changes or copies them.</p>
              <p><strong>Epoch.</strong> Each epoch visits cells in random order. An unused cell samples one radius-2 neighbor; if that neighbor is unused, the ordered pair executes once. Each cell participates in at most one interaction per epoch.</p>
              <p><strong>Interaction.</strong> The two selected 64-byte tapes are copied into a fresh 128-byte execution buffer. Mutation applies to that copy first. The buffer is the program and memory being executed, so the original cells are untouched while the pair runs. The BFF interpreter starts at program counter <code>0</code> with both heads wrapped at index <code>0</code>, runs until it reaches the end, hits an unmatched loop, or reads <code>8192</code> instructions, then splits the buffer back into cell A and cell B.</p>
              <p><strong>Skipped cells.</strong> Cells that do not execute still receive per-byte mutation. No cell is protected.</p>
              <p><strong>Replication.</strong> The simulator does not label replicators. A functional replicator may be a whole 64-byte tape or a smaller substring that copies itself with an offset. The repeated-program list shows exact whole-cell repeats as a practical proxy; the real signal is a pattern that keeps writing itself, or close variants, into neighboring cells often enough to spread.</p>
              <p><strong>Spatial dynamics.</strong> Local interactions make replication spread as neighborhoods or waves. This locality lets variants coexist and compete; mutation can create variants, damage existing copies, or change which variant spreads fastest.</p>
              <p><strong>Timing.</strong> Exact 2D runs can take a long time. Random soups may run thousands of epochs without a visible wave; a stalled run by 16,000 epochs is normal. Hidden tabs switch to a tiny maintenance tick and stop movie capture so the browser stays safe in the background.</p>
              <p class="docs-links">
                <a href="https://arxiv.org/abs/2406.19108" target="_blank" rel="noreferrer">Original paper</a>
                <a href="https://whatisintelligence.antikythera.org/chapter-01/#artificial-life" target="_blank" rel="noreferrer">Online book chapter</a>
                <a href="https://youtu.be/07NoZwvgJ_M?si=WuSU2ahXNOH80wUV&amp;t=108" target="_blank" rel="noreferrer">Example emergence run</a>
              </p>
            </div>
          </section>

          <section class="panel parameters-panel collapsible-section collapsed" aria-label="Simulation parameters" data-collapsible-section="parameters">
            ${sectionHead("Parameters", "Defaults favor autonomous emergence; tune mutation, checkpoints, and update speed.", true)}
            <div class="section-body panel-grid" data-collapse-body>
              ${controlMarkup(defaults, "Mutation rate", "mutationRate", String(config.mutationRate), "Probability that each byte is replaced by a random byte during an epoch. The default keeps low background mutation on so random soups can keep exploring candidate programs instead of only preserving injected presets.")}
              ${controlMarkup(defaults, "Checkpoint interval", "checkpointInterval", String(config.checkpointInterval), `Number of epochs between saved scrub states. Coarser checkpoints use less memory. The simulator keeps at most ${MAX_CHECKPOINTS} checkpoints under a fixed memory ceiling.`)}
              ${controlMarkup(defaults, "Metric interval", "metricInterval", String(config.metricInterval), "Number of epochs between heavier metric calculations.")}
              ${controlMarkup(defaults, "Time budget (milliseconds)", "timeBudgetMs", String(config.timeBudgetMs), `Foreground worker compute budget per update. Values are capped at ${MAX_TIME_BUDGET_MS}ms, and hidden tabs are throttled automatically.`)}
              <div class="reproducible-run" aria-label="Reproducible run controls">
                <label class="seed-toggle">
                  <input id="fixedSeedEnabled" type="checkbox" />
                  <span>Use fixed seed on reset</span>
                </label>
                <label>
                  <span class="label-row">Seed ${info("When fixed seed is enabled, Reset reuses this unsigned 32-bit seed with the current parameter values. When disabled, Reset chooses a fresh random seed.")}</span>
                  <input id="seed" type="number" min="0" max="4294967295" step="1" value="${config.seed}" title="Fixed run seed" />
                </label>
                <label class="run-import-field">
                  <span class="label-row">Load params ${info("Paste run JSON or a URL containing run parameters. Supported JSON fields: seed, mutationRate, checkpointInterval, metricInterval, timeBudgetMs, and fixedSeed.")}</span>
                  <textarea id="runParamsInput" rows="4" spellcheck="false" placeholder='{"seed":1,"mutationRate":0.0001220703125,"metricInterval":64,"checkpointInterval":256,"timeBudgetMs":32}'></textarea>
                </label>
                <input id="runParamsFile" class="file-input" type="file" accept="application/json,.json" />
                <div class="run-param-actions" aria-label="Run parameter import and export controls">
                  <button id="applyRunParams" type="button" title="Apply the pasted JSON or URL and reset the simulation.">Apply</button>
                  <button id="uploadRunParams" type="button" title="Upload a JSON file and reset the simulation.">Upload JSON</button>
                  <button id="copyRunParamsJson" type="button" title="Copy the current run parameters as JSON.">Copy JSON</button>
                  <button id="copyRunParamsUrl" type="button" title="Copy a shareable URL for the current run parameters.">Copy URL</button>
                </div>
                <p id="reproStatus" class="repro-status" aria-live="polite">Reset uses a fresh random seed unless fixed seed is enabled.</p>
              </div>
              <div class="control-actions">
                <button id="resetDefaults" type="button" title="Restore all parameter controls to their default values.">Reset to defaults</button>
              </div>
            </div>
          </section>

          <section class="panel replicator-section collapsible-section collapsed" aria-label="Replicator injection" data-collapsible-section="replicator">
            ${sectionHead("Replicator Injection", "Optional known-copy BFF tapes for comparison runs.", true)}
            <div class="section-body" data-collapse-body>
              ${replicatorInjectionMarkup(config)}
            </div>
          </section>

          <section class="panel movie-section collapsible-section collapsed" aria-label="Movie capture" data-collapsible-section="movie-capture">
            ${sectionHead("Movie Capture", "Auto-save on replication or manually mark the current frame.", true)}
            <div class="section-body" data-collapse-body>
              ${movieCaptureMarkup()}
            </div>
          </section>
        </div>

        <section class="chart-section collapsible-section collapsed" aria-label="Emergence metric chart" data-collapsible-section="emergence">
          ${sectionHead("Emergence Signal", CHART_METRICS.structureScore.description, true, "chartDescription")}

          <div class="section-body" data-collapse-body>
            <section class="metric-card">
              <div class="metric-card-head">
                <span id="chartMetricLabel">Structure score</span>
                <span id="phaseBadge" class="phase-badge">baseline</span>
              </div>
              <strong id="chartMetricValue">0.000</strong>
              <div class="chart-toolbar" aria-label="Chart controls">
                <label>
                  <span>Metric</span>
                  <select id="chartMetric">
                    ${Object.entries(CHART_METRICS)
                      .map(
                        ([key, option]) =>
                          `<option value="${key}">${option.label}</option>`
                      )
                      .join("")}
                  </select>
                </label>
                <label>
                  <span>Window</span>
                  <select id="chartWindow">
                    ${CHART_WINDOW_OPTIONS.map(
                      (option) =>
                        `<option value="${option.value}">${option.label}</option>`
                    ).join("")}
                  </select>
                </label>
                <label>
                  <span>Y scale</span>
                  <select id="chartScale">
                    ${CHART_SCALE_OPTIONS.map(
                      (option) =>
                        `<option value="${option.value}">${option.label}</option>`
                    ).join("")}
                  </select>
                </label>
              </div>
              <div id="chartReadout" class="chart-readout" aria-live="polite">Waiting for metric samples.</div>
              <canvas id="metricChart" width="920" height="310" aria-label="Selected emergence metric over time"></canvas>
              <div class="metric-exposition" aria-live="polite">
                <div id="chartEquation" aria-label="${escapeAttribute(CHART_METRICS.structureScore.equation)}">${renderChartMetricEquation("structureScore")}</div>
                <p id="chartCommentary">${CHART_METRICS.structureScore.commentary}</p>
              </div>
            </section>
          </div>
        </section>

        <div class="analysis-layout">
          <section class="programs-section collapsible-section collapsed" aria-label="Repeated programs" data-collapsible-section="programs">
            ${sectionHead("Repeated Programs", "64-byte tapes that occupy more than one cell.", true)}
            <div class="section-body program-browser" data-collapse-body>
              <div id="programList" class="program-list"></div>
              <div class="program-detail">
                <canvas id="programDetailCanvas" width="256" height="256" aria-label="Selected program tile"></canvas>
                <div>
                  <h3 id="programDetailTitle">No repeated program yet</h3>
                  <p id="programDetailStats">The top program list updates with the emergence metric.</p>
                  <code id="programDetailCode"></code>
                </div>
              </div>
            </div>
          </section>

          <section class="interaction-section collapsible-section collapsed" aria-label="Pair interaction lab" data-collapsible-section="interaction">
            ${sectionHead("Pair Interaction Lab", "Run one deterministic two-cell BFF step outside the soup.", true)}
            <div class="section-body interaction-lab" data-collapse-body>
              <p class="interaction-note">Use this to inspect one two-cell execution step. The lab omits random mutation so the direct effect of the two tapes is reproducible. Inputs decode to 64 bytes; shorter cells are padded with <code>\\0</code>, longer cells are truncated, and escapes such as <code>\\0</code> and <code>\\x2b</code> let you enter exact byte values.</p>
              <div class="interaction-editors">
                <label class="cell-editor">
                  <span class="label-row">Cell A ${info("Editable first 64-byte BFF tape. Plain text becomes byte values; use \\0 for null and \\xNN for exact hex bytes.")}</span>
                  <textarea id="interactionCellA" spellcheck="false" rows="5" aria-label="Cell A input">+</textarea>
                </label>
                <label class="cell-editor">
                  <span class="label-row">Cell B ${info("Editable second 64-byte BFF tape. Empty input means all 64 bytes are null because the remaining bytes are padded with \\0.")}</span>
                  <textarea id="interactionCellB" spellcheck="false" rows="5" aria-label="Cell B input"></textarea>
                </label>
              </div>
              <div class="interaction-controls">
                <label class="interaction-limit">
                  <span class="label-row">Instruction cap ${info("Maximum instruction reads for this single pair evaluation. The simulation default is 8192.")}</span>
                  <input id="interactionMaxReads" type="number" min="1" step="1" value="8192" />
                </label>
                <button id="evaluateInteraction" type="button" title="Run this pair through the BFF evaluator">Evaluate pair</button>
                <button id="loadTopProgramA" type="button" title="Copy the selected top program into Cell A">Selected to A</button>
                <button id="loadTopProgramB" type="button" title="Copy the selected top program into Cell B">Selected to B</button>
                <button id="zeroInteractionCells" type="button" title="Clear both inputs to all-null cells">Zero cells</button>
              </div>
              <p id="interactionStatus" class="interaction-status" aria-live="polite">Ready.</p>
              <div class="interaction-results">
                ${interactionCellResultMarkup("A")}
                ${interactionCellResultMarkup("B")}
              </div>
            </div>
          </section>
        </div>

        <section class="metrics-section collapsible-section collapsed" aria-label="Run diagnostics" data-collapsible-section="diagnostics">
          ${sectionHead("Diagnostics", "Throughput and execution health.", true)}
          <dl class="section-body metrics" data-collapse-body>
            ${metricMarkup("Epochs per second", "epochsPerSecond", "Current simulation throughput from the worker.")}
            ${metricMarkup("Render frames per second", "renderFps", "How often the current soup image is redrawn.")}
            ${metricMarkup("Pairs per epoch", "pairsPerEpoch", "Average number of local program-pair interactions executed per epoch.")}
            ${metricMarkup("Reads per pair", "readsPerPair", "Average BFF instruction reads per interacting pair. Long-running loops push this upward.")}
            ${metricMarkup("Active operations per epoch", "activeOps", "Executable BFF operations executed per epoch.")}
          </dl>
        </section>
      </section>
    </section>
  `;
}

function replicatorInjectionMarkup(config: SimulationConfig): string {
  const defaultPreset = replicatorPresetById(DEFAULT_REPLICATOR_PRESET_ID);
  const maxCells = config.gridWidth * config.gridHeight;
  return `
    <div class="replicator-controls" aria-label="Preset replicator injection controls">
      <label>
        <span class="label-row">Replicator ${info("Preset 64-byte BFF tape to insert. The current library contains the paper example plus neutral no-op filler variants that copy exactly under the BFF evaluator.")}</span>
        <select id="replicatorPreset">
          ${REPLICATOR_PRESETS.map(
            (preset) =>
              `<option value="${escapeAttribute(preset.id)}" ${preset.id === defaultPreset.id ? "selected" : ""}>${preset.name}</option>`
          ).join("")}
        </select>
      </label>
      <label>
        <span class="label-row">Copies ${info(`Number of random grid cells to overwrite with the selected preset. Positions are sampled without replacement. Default: ${defaultPreset.defaultCount}.`)}</span>
        <input id="replicatorCount" type="number" min="1" max="${maxCells}" step="1" value="${defaultPreset.defaultCount}" title="Default: ${defaultPreset.defaultCount}" />
      </label>
      <div class="replicator-preview">
        <canvas id="replicatorPreviewCanvas" width="96" height="96" aria-label="Selected preset replicator"></canvas>
        <div>
          <p id="replicatorDescription">${defaultPreset.description}</p>
          <code id="replicatorCode"></code>
        </div>
      </div>
      <div class="replicator-actions">
        <button id="injectReplicator" type="button" title="Randomly insert this preset into the current frame">Inject randomly</button>
        <button id="loadReplicatorToLab" type="button" title="Copy this preset into the pair interaction lab">Load in lab</button>
      </div>
      <p id="injectorStatus" class="injector-status" aria-live="polite">Ready to inject.</p>
    </div>
  `;
}

function sectionHead(
  title: string,
  subtitle: string,
  collapsed = false,
  subtitleId?: string
): string {
  const subtitleAttribute = subtitleId ? ` id="${subtitleId}"` : "";
  return `
    <div class="section-head section-toggle" role="button" tabindex="0" data-collapse-toggle aria-expanded="${collapsed ? "false" : "true"}">
      <div>
        <h2>${title}</h2>
        <p${subtitleAttribute}>${subtitle}</p>
      </div>
      <span class="section-chevron" aria-hidden="true"></span>
    </div>
  `;
}

function controlMarkup(
  defaults: SimulationConfig,
  label: string,
  id: keyof SimulationConfig,
  value: string,
  tooltip: string
): string {
  const maxAttribute =
    id === "timeBudgetMs" ? ` max="${MAX_TIME_BUDGET_MS}"` : "";
  return `
    <label>
      <span class="label-row">${label} ${info(`${tooltip} Default: ${defaults[id]}.`)}</span>
      <input id="${id}" type="number" min="0" step="any" value="${value}" title="Default: ${defaults[id]}"${maxAttribute} />
    </label>
  `;
}

function movieCaptureMarkup(): string {
  return `
    <div class="movie-capture-controls">
      <label class="movie-capture-toggle">
        <input id="autoMovieCapture" type="checkbox" />
        <span>Auto-save replication movie</span>
      </label>
      <p id="movieCaptureStatus" class="movie-capture-status" aria-live="polite">Movie capture off.</p>
      <div class="movie-capture-actions">
        <button id="manualMovieCapture" type="button" title="Mark the current frame as the event and save a WebM movie after the post-roll.">Save movie now</button>
        <button id="shareMovieCapture" type="button" hidden>Share last movie</button>
      </div>
      <canvas id="movieCaptureCanvas" class="movie-capture-canvas" width="1440" height="810" aria-hidden="true"></canvas>
    </div>
  `;
}

function metricMarkup(label: string, id: string, tooltip: string): string {
  return `
    <div>
      <dt>${label} ${info(tooltip)}</dt>
      <dd id="${id}">0</dd>
    </div>
  `;
}

function interactionCellResultMarkup(name: "A" | "B"): string {
  return `
    <article class="interaction-cell-result">
      <div class="interaction-cell-head">
        <h3>Cell ${name}</h3>
        <span id="interactionChange${name}">0 changes</span>
      </div>
      <div class="interaction-cell-canvases">
        <figure>
          <canvas id="interactionBefore${name}" width="96" height="96" aria-label="Cell ${name} before interaction"></canvas>
          <figcaption>Before</figcaption>
        </figure>
        <figure>
          <canvas id="interactionAfter${name}" width="96" height="96" aria-label="Cell ${name} after interaction"></canvas>
          <figcaption>After</figcaption>
        </figure>
      </div>
      <p id="interactionStats${name}" class="interaction-cell-stats">Awaiting evaluation.</p>
      <code id="interactionOutput${name}" class="interaction-output"></code>
    </article>
  `;
}

function info(text: string): string {
  const escaped = escapeAttribute(text);
  return `<button class="info" type="button" aria-label="${escaped}" title="${escaped}" data-tip="${escaped}">?</button>`;
}

function escapeAttribute(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
