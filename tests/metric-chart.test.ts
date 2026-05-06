import { describe, expect, it } from "vitest";
import {
  CHART_METRICS,
  drawMetricChart,
  formatChartMetricValue,
  renderChartMetricEquation
} from "../src/ui/metricChart";
import type { MetricSnapshot } from "../src/simulation/metrics";

const metric: MetricSnapshot = {
  epoch: 10,
  byteEntropyBpb: 7.91234,
  compressedBpb: 7.5,
  structureScore: 0.12345,
  compressionGain: 0.321,
  activeInstructionFraction: 0.04567,
  instructionEnrichmentScore: 0.12,
  dominantProgramFraction: 0.03456,
  uniqueProgramFraction: 0.9,
  phaseTransitionScore: 0.22,
  phaseTransitionDetected: false
};

describe("metric chart definitions", () => {
  it("formats scalar metrics consistently", () => {
    expect(formatChartMetricValue(metric, "structureScore")).toBe("0.123");
    expect(formatChartMetricValue(metric, "phaseTransitionScore")).toBe("0.220");
  });

  it("formats fraction metrics as percentages", () => {
    expect(formatChartMetricValue(metric, "dominantProgramFraction")).toBe(
      "3.46%"
    );
    expect(formatChartMetricValue(metric, "uniqueProgramFraction")).toBe("90.00%");
  });

  it("defines equations and commentary for every chart metric", () => {
    const jargonyWords = /\bclonal\b|\bdictionary\b|\blineages\b|\bmotif\b/i;
    for (const definition of Object.values(CHART_METRICS)) {
      expect(definition.equation.length).toBeGreaterThan(8);
      expect(definition.equationTex.length).toBeGreaterThan(8);
      expect(definition.equation).toMatch(/\bwhere\b/i);
      expect(definition.equationTex).toContain("\\text{");
      expect(definition.commentary.length).toBeGreaterThan(40);
      expect(definition.commentary).not.toMatch(jargonyWords);
    }
  });

  it("keeps displayed formulas self-contained instead of using bare shorthand", () => {
    for (const definition of Object.values(CHART_METRICS)) {
      const unresolvedBareSymbols =
        /\\frac\{\\max_i n_i\}|S_t-\\mu_\{?0\}?\\b|\\sigma_0\)\s*$/;

      expect(definition.equationTex).not.toMatch(unresolvedBareSymbols);
    }
  });

  it("keeps the chart menu to the five simplest useful metrics", () => {
    expect(Object.keys(CHART_METRICS)).toEqual([
      "structureScore",
      "phaseTransitionScore",
      "dominantProgramFraction",
      "activeInstructionFraction",
      "uniqueProgramFraction"
    ]);
  });

  it("renders equations as KaTeX HTML", () => {
    const html = renderChartMetricEquation("structureScore");

    expect(html).toContain("katex");
    expect(html).toContain("math");
  });

  it("draws labelled axes without placeholder text before samples arrive", () => {
    const labels: string[] = [];
    const canvas = mockCanvas(labels);

    drawMetricChart(canvas, [], "structureScore");

    expect(labels).toContain("Structure score");
    expect(labels).toContain("14.2");
    expect(labels).toContain("0.00");
    expect(labels).toContain("Epoch");
    expect(labels).not.toContain("Waiting for metric samples");
  });

  it("uses a fixed y-axis scale for every metric", () => {
    expect(CHART_METRICS.structureScore.yDomain).toEqual([0, 14.15]);
    expect(CHART_METRICS.phaseTransitionScore.yDomain).toEqual([-14.15, 14.15]);
    expect(CHART_METRICS.dominantProgramFraction.yDomain).toEqual([0, 1]);
    expect(CHART_METRICS.activeInstructionFraction.yDomain).toEqual([0, 1]);
    expect(CHART_METRICS.uniqueProgramFraction.yDomain).toEqual([0, 1]);
  });

  it("draws fixed full-range y-axis labels instead of sample ranges", () => {
    const labels: string[] = [];
    const canvas = mockCanvas(labels);

    drawMetricChart(
      canvas,
      [
        { ...metric, epoch: 0, structureScore: 0.01 },
        { ...metric, epoch: 10, structureScore: 0.02 }
      ],
      "structureScore"
    );

    expect(labels).toContain("14.2");
    expect(labels).toContain("0.00");
    expect(labels).not.toContain("0.02");
  });

  it("always labels fraction metric axes as 0% to 100%", () => {
    const labels: string[] = [];
    const canvas = mockCanvas(labels);

    drawMetricChart(
      canvas,
      [
        { ...metric, epoch: 0, dominantProgramFraction: 0.02 },
        { ...metric, epoch: 10, dominantProgramFraction: 0.03 }
      ],
      "dominantProgramFraction"
    );

    expect(labels).toContain("100%");
    expect(labels).toContain("0%");
    expect(labels).not.toContain("2%");
    expect(labels).not.toContain("3%");
  });

  it("does not draw vertical phase-transition markers", () => {
    const fillRects: Array<{ x: number; y: number; width: number; height: number }> = [];
    const canvas = mockCanvas([], fillRects);

    drawMetricChart(
      canvas,
      [
        { ...metric, epoch: 0, structureScore: 0.1 },
        { ...metric, epoch: 10, structureScore: 0.9, phaseTransitionDetected: true }
      ],
      "structureScore"
    );

    expect(fillRects).toEqual([{ x: 0, y: 0, width: 920, height: 220 }]);
  });
});

function mockCanvas(
  labels: string[],
  fillRects: Array<{ x: number; y: number; width: number; height: number }> = []
): HTMLCanvasElement {
  const context = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    font: "",
    textAlign: "left",
    textBaseline: "alphabetic",
    clearRect: () => undefined,
    fillRect: (x: number, y: number, width: number, height: number) => {
      fillRects.push({ x, y, width, height });
    },
    beginPath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    stroke: () => undefined,
    arc: () => undefined,
    fill: () => undefined,
    fillText: (text: string) => {
      labels.push(text);
    }
  } as unknown as CanvasRenderingContext2D;

  return {
    width: 920,
    height: 220,
    getContext: () => context
  } as unknown as HTMLCanvasElement;
}
