import type { SimulationConfig } from "../simulation/simulator";
import {
  DEFAULT_REPLICATOR_PRESET_ID,
  REPLICATOR_PRESETS,
  replicatorPresetById
} from "../simulation/replicatorPresets";
import { CHART_METRICS, renderChartMetricEquation } from "./metricChart";

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
              <button id="reset" class="icon-button" type="button" aria-label="Reset simulation" title="Reset simulation" data-tip="Reset simulation with the current parameter values">Reset</button>
              <button id="newRun" class="icon-button" type="button" aria-label="New random soup" title="New random soup" data-tip="Start a new randomized soup with the current parameter values">New</button>
              <button id="fullscreen" class="icon-button" type="button" aria-label="Enter fullscreen" title="Fullscreen" data-tip="Enter fullscreen">Full</button>
            </div>
            <div class="canvas-scrubber" aria-label="Checkpoint scrubber">
              <div id="checkpointLabel">Checkpoint 0/0</div>
              <input id="checkpointScrubber" type="range" min="0" max="0" step="1" value="0" aria-label="Checkpoint scrubber" />
              <div id="checkpointEpochLabel">Epoch: 0</div>
              <button id="checkpointLatest" class="icon-button checkpoint-latest-button" type="button" aria-label="Jump to live latest state" title="Jump to live latest state" data-tip="Jump back to the live latest state">›</button>
            </div>
          </div>

          <section class="panel parameters-panel collapsible-section collapsed" aria-label="Simulation controls" data-collapsible-section="parameters">
            ${sectionHead("Controls", "Inject a known replicator or tune the run.", true)}
            <div class="section-body panel-grid" data-collapse-body>
              ${replicatorInjectionMarkup(config)}
              <details class="advanced-controls">
                <summary>Advanced parameters</summary>
                <div class="advanced-control-grid">
                  ${controlMarkup(defaults, "Mutation rate", "mutationRate", String(config.mutationRate), "Probability that each byte is replaced by a random byte during an epoch. The default is zero because the visual run is most stable when nascent replicators are not damaged by background noise.")}
                  ${controlMarkup(defaults, "Checkpoint interval", "checkpointInterval", String(config.checkpointInterval), "Number of epochs between saved scrub states. Coarser checkpoints use less memory.")}
                  ${controlMarkup(defaults, "Metric interval", "metricInterval", String(config.metricInterval), "Number of epochs between heavier metric calculations.")}
                  ${controlMarkup(defaults, "Time budget (milliseconds)", "timeBudgetMs", String(config.timeBudgetMs), "Approximate worker compute budget per interface update.")}
                  <div class="control-actions">
                    <button id="resetDefaults" type="button" title="Restore all parameter controls to their default values.">Reset to defaults</button>
                  </div>
                </div>
              </details>
            </div>
          </section>
        </div>

        <section class="chart-section collapsible-section collapsed" aria-label="Emergence metric chart" data-collapsible-section="emergence">
          <div class="chart-head">
            <div>
              <h2>Emergence Signal</h2>
              <p id="chartDescription">${CHART_METRICS.structureScore.description}</p>
            </div>
            <div class="section-actions">
              ${collapseButton(true)}
            </div>
          </div>

          <div class="section-body" data-collapse-body>
            <label class="metric-select-label">
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
            <section class="metric-card">
              <div class="metric-card-head">
                <span id="chartMetricLabel">Structure score</span>
                <span id="phaseBadge" class="phase-badge">baseline</span>
              </div>
              <strong id="chartMetricValue">0.000</strong>
              <div class="metric-exposition" aria-live="polite">
                <div id="chartEquation" aria-label="${escapeAttribute(CHART_METRICS.structureScore.equation)}">${escapeText(renderChartMetricEquation("structureScore"))}</div>
                <p id="chartCommentary">${CHART_METRICS.structureScore.commentary}</p>
              </div>
              <canvas id="metricChart" width="920" height="220" aria-label="Selected emergence metric over time"></canvas>
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
            ${sectionHead("Pair Interaction Lab", "Enter two 64-byte cells and run the deterministic BFF execution step used inside a local interaction.", true)}
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

      <div class="docs-layout">
        <section class="explanation collapsible-section collapsed" data-collapsible-section="explanation">
          ${sectionHead("How It Works", "State, interaction rule, and sources of change.", true)}
          <div class="section-body explainer-grid" data-collapse-body>
            <p><strong>State.</strong> The world is a fixed 240 by 135 grid. Each cell stores one 64-byte BFF tape. There are no separate organisms, resources, fitness scores, births, or deaths.</p>
            <p><strong>Language.</strong> BFF is a self-modifying extension of <a href="https://www.brainfuck.org/brainfuck.html" target="_blank" rel="noreferrer">Brainfuck</a>: the tape is both program and memory. Ten byte values execute as instructions: <code>[ ] + - . , &lt; &gt; { }</code>. Byte <code>0</code> is null and controls loops. Every other byte is inert data unless execution changes it.</p>
            <p><strong>Pairing.</strong> Each epoch uses the paper-style local scheduler. The simulator creates a random permutation of all grid cell indices, visits cells in that order, samples one radius-2 neighbor for each unused visited cell, and accepts the pair only if that neighbor is also unused. A cell can participate in at most one interaction per epoch.</p>
            <p><strong>Interaction.</strong> The two 64-byte tapes are joined into one 128-byte buffer. Mutation is applied first: each byte is independently replaced by a random byte with probability equal to the mutation rate. The BFF interpreter starts at program counter <code>0</code> with both heads at wrapped index <code>0</code>, runs for at most <code>8192</code> instruction reads, then writes the first 64 bytes back to the first cell and the last 64 bytes back to the second cell.</p>
            <p><strong>Skipped cells.</strong> A cell that does not execute still receives the same per-byte mutation step. No cell is protected from mutation.</p>
            <p><strong>Replication.</strong> A replicator is not labeled by the simulator. It is a 64-byte tape whose execution tends to write copies of itself, or close variants of itself, into neighboring tapes often enough that the tape becomes more common over time.</p>
            <p><strong>Spatial dynamics.</strong> Because cells only interact with nearby cells, a replicating tape expands through adjacent neighborhoods instead of appearing everywhere at once. Mutation can create variants, damage existing replicators, or change which variant spreads fastest.</p>
            <p><strong>Practical timing.</strong> Exact 2D runs are deliberately hard: a random soup can run for many thousands of epochs without a visible wave. The paper's non-spatial mutation sweep still left about 40-60% of runs below the complexity threshold after 16,000 epochs, and 2D locality slows spread after a replicator appears.</p>
          </div>
        </section>

        <footer class="resources collapsible-section collapsed" data-collapsible-section="resources">
          ${sectionHead("Sources", "Original sources and a reference emergence run.", true)}
          <div class="section-body resources-body" data-collapse-body>
            <div>
            <p>
              <a href="https://arxiv.org/abs/2406.19108" target="_blank" rel="noreferrer">Original paper</a>
              <a href="https://whatisintelligence.antikythera.org/chapter-01/#artificial-life" target="_blank" rel="noreferrer">Online book chapter</a>
              <a href="https://youtu.be/07NoZwvgJ_M?si=WuSU2ahXNOH80wUV&amp;t=108" target="_blank" rel="noreferrer">Example emergence run</a>
            </p>
            </div>
            <p class="emergence-note">A stalled run by 16,000 epochs is normal. In the paper's non-spatial mutation sweep, successful runs reached the complexity threshold after roughly 6,000-7,000 epochs on average, but 40-60% of runs still had not crossed it by 16,000 epochs.</p>
          </div>
        </footer>
      </div>
    </section>
  `;
}

function replicatorInjectionMarkup(config: SimulationConfig): string {
  const defaultPreset = replicatorPresetById(DEFAULT_REPLICATOR_PRESET_ID);
  const maxCells = config.gridWidth * config.gridHeight;
  return `
    <section class="injector-card" aria-label="Preset replicator injection">
      <div class="injector-head">
        <h3>Preset Replicators</h3>
        <p>Insert known exact-copy BFF tapes into random cells of the current frame, then watch whether they spread.</p>
      </div>
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
    </section>
  `;
}

function sectionHead(title: string, subtitle: string, collapsed = false): string {
  return `
    <div class="section-head">
      <div>
        <h2>${title}</h2>
        <p>${subtitle}</p>
      </div>
      ${collapseButton(collapsed)}
    </div>
  `;
}

function collapseButton(collapsed = false): string {
  return `<button class="collapse-toggle" type="button" data-collapse-toggle aria-expanded="${collapsed ? "false" : "true"}">${collapsed ? "Show" : "Hide"}</button>`;
}

function controlMarkup(
  defaults: SimulationConfig,
  label: string,
  id: keyof SimulationConfig,
  value: string,
  tooltip: string
): string {
  return `
    <label>
      <span class="label-row">${label} ${info(`${tooltip} Default: ${defaults[id]}.`)}</span>
      <input id="${id}" type="number" min="0" step="any" value="${value}" title="Default: ${defaults[id]}" />
    </label>
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

function escapeText(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
