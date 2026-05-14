import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/simulation/simulator";
import { renderAppShell } from "../src/ui/shell";

describe("app shell markup", () => {
  it("renders runtime controls with default reset values", () => {
    const config = defaultConfig();
    const html = renderAppShell(config, config);

    expect(html).toContain('id="mutationRate"');
    expect(html).toContain(`title="Default: ${config.mutationRate}"`);
    expect(html).toContain(`Default: ${config.mutationRate}.`);
    expect(html).toContain("Defaults favor autonomous emergence");
    expect(html).toContain("Replicator Injection");
    expect(html).toContain('data-collapsible-section="replicator"');
    expect(html).toContain('data-collapsible-section="movie-capture"');
    expect(html).toContain("Movie Capture");
    expect(html).not.toContain("default is zero");
    expect(html).toContain('id="timeBudgetMs"');
    expect(html).toContain(`title="Default: ${config.timeBudgetMs}"`);
    expect(html).toContain(`Default: ${config.timeBudgetMs}.`);
    expect(html).not.toContain('id="autoCapture"');
    expect(html).not.toContain('id="captureStatus"');
    expect(html).toContain('id="replicatorPreset"');
    expect(html).toContain('id="replicatorCount"');
    expect(html).toContain('id="injectReplicator"');
    expect(html).toContain('id="loadReplicatorToLab"');
    expect(html).toContain('id="resetDefaults"');
    expect(html).toContain('id="reset"');
    expect(html).toContain("Reset with a new randomized soup");
    expect(html).not.toContain('id="newRun"');
    expect(html).not.toContain("<summary>Advanced parameters</summary>");
    expect(html).not.toContain("Replication movie capture</summary>");
    expect(html).not.toContain(">Show</button>");
    expect(html).not.toContain(">Hide</button>");
    expect(html).not.toContain('button class="collapse-toggle"');
    expect(html).toContain('id="autoMovieCapture"');
    expect(html).toContain('id="movieCaptureStatus"');
    expect(html).toContain('id="movieCaptureCanvas"');
    expect(html).not.toContain(">Default</button>");
  });

  it("does not expose seed or checksum controls", () => {
    const html = renderAppShell(defaultConfig(), defaultConfig());

    expect(html).not.toContain('id="seed"');
    expect(html).not.toContain("checksum");
  });

  it("renders resource links and top-program browser", () => {
    const html = renderAppShell(defaultConfig(), defaultConfig());

    expect(html).toContain('id="programList"');
    expect(html).toContain('class="analysis-layout"');
    expect(html).toContain('class="docs-section collapsible-section collapsed"');
    expect(html).toContain('data-collapsible-section="docs"');
    expect(html).toContain("Core rules, replication meaning, and source links.");
    expect(html).toContain("copied into a fresh 128-byte execution buffer");
    expect(html).toContain("whole 64-byte tape or a smaller substring");
    expect(html).toContain("ordered pair executes once");
    expect(html).toContain('id="checkpointLatest"');
    expect(html).toContain("Checkpoint 0/0");
    expect(html).toContain("Epoch: 0");
    expect(html).toContain('id="interactionCellA"');
    expect(html).toContain('id="evaluateInteraction"');
    expect(html).toContain('id="loadTopProgramA"');
    expect(html).toContain('id="chartEquation"');
    expect(html).toContain('id="chartCommentary"');
    expect(html).toContain("katex");
    expect(html).toContain("https://arxiv.org/abs/2406.19108");
    expect(html).toContain("https://www.brainfuck.org/brainfuck.html");
    expect(html).toContain(
      "https://whatisintelligence.antikythera.org/chapter-01/#artificial-life"
    );
    expect(html).toContain(
      "https://youtu.be/07NoZwvgJ_M?si=WuSU2ahXNOH80wUV&amp;t=108"
    );
    expect(html).toContain("Example emergence run");
  });

  it("keeps diagnostics labels focused and understandable", () => {
    const html = renderAppShell(defaultConfig(), defaultConfig());

    expect(html).toContain("bits per byte");
    expect(html).toContain("Diagnostics");
    expect(html).toContain("Epochs per second");
    expect(html).toContain("Render frames per second");
    expect(html).toContain("Active operations per epoch");
    expect(html).not.toContain('id="entropyBpb"');
    expect(html).not.toContain('id="compressedBpb"');
    expect(html).not.toContain('id="phaseScore"');
    expect(html).not.toMatch(/\\bbpb\\b/i);
    expect(html).not.toContain("program hash");
  });

  it("starts every non-canvas section collapsed", () => {
    const html = renderAppShell(defaultConfig(), defaultConfig());

    expect(html.match(/data-collapse-toggle/g)).toHaveLength(8);
    expect(html.match(/role="button"/g)).toHaveLength(8);
    expect(html).toContain('data-collapsible-section="docs"');
    expect(html).toContain('data-collapsible-section="parameters"');
    expect(html).toContain('data-collapsible-section="replicator"');
    expect(html).toContain('data-collapsible-section="movie-capture"');
    expect(html).toContain('data-collapsible-section="emergence"');
    expect(html).toContain('data-collapsible-section="programs"');
    expect(html).toContain('data-collapsible-section="interaction"');
    expect(html).toContain(
      'class="interaction-section collapsible-section collapsed"'
    );
    expect(html.match(/aria-expanded="false"/g)).toHaveLength(8);
    expect(html).toContain('data-collapsible-section="diagnostics"');
    expect(html).not.toContain('data-collapsible-section="explanation"');
    expect(html).not.toContain('data-collapsible-section="resources"');
    expect(html).not.toContain('class="viewport" data-collapsible-section');
  });

  it("starts with the canvas workspace instead of a header", () => {
    const html = renderAppShell(defaultConfig(), defaultConfig());

    expect(html).not.toContain("BFF Explorer");
    expect(html).not.toContain("Interactive 2D BFF science sandbox.");
    expect(html).not.toContain('id="runState"');
    expect(html).not.toContain('id="zoomFit"');
    expect(html).not.toContain('id="zoomReadout"');
    expect(html.indexOf('class="workspace"')).toBeLessThan(
      html.indexOf('class="viewport"')
    );
    expect(html.indexOf('class="viewport"')).toBeLessThan(
      html.indexOf('data-collapsible-section="docs"')
    );
    expect(html.indexOf('data-collapsible-section="docs"')).toBeLessThan(
      html.indexOf('data-collapsible-section="parameters"')
    );
    expect(html.indexOf('data-collapsible-section="parameters"')).toBeLessThan(
      html.indexOf('data-collapsible-section="replicator"')
    );
    expect(html.indexOf('data-collapsible-section="replicator"')).toBeLessThan(
      html.indexOf('data-collapsible-section="movie-capture"')
    );
    expect(html.indexOf('data-collapsible-section="movie-capture"')).toBeLessThan(
      html.indexOf('data-collapsible-section="emergence"')
    );
    expect(html.indexOf('data-collapsible-section="programs"')).toBeLessThan(
      html.indexOf('data-collapsible-section="interaction"')
    );
  });
});
