import katex from "katex";
import type { MetricSnapshot } from "../simulation/metrics";

export type ChartMetricKey =
  | "structureScore"
  | "phaseTransitionScore"
  | "dominantProgramFraction"
  | "activeInstructionFraction"
  | "uniqueProgramFraction";

export type ChartWindowMode = "all" | "recent" | "transition";
export type ChartScaleMode = "auto" | "detail" | "full";

export interface ChartMetricDefinition {
  label: string;
  description: string;
  equation: string;
  equationTex: string;
  commentary: string;
  format: (value: number) => string;
  yDomain: readonly [number, number];
}

export interface ChartSelectOption<T extends string> {
  value: T;
  label: string;
}

export interface ChartViewOptions {
  windowMode?: ChartWindowMode;
  scaleMode?: ChartScaleMode;
  hoverIndex?: number | null;
}

export interface ChartHoverPoint {
  index: number;
  sample: MetricSnapshot;
  x: number;
  y: number;
  valueText: string;
  transitionLabel: string | null;
}

export interface ChartViewSummary {
  sampleCount: number;
  startEpoch: number | null;
  endEpoch: number | null;
  transitionEpoch: number | null;
  transitionLabel: string | null;
}

const MAX_STRUCTURE_SCORE = 8 + 0.25 * (256 / 10 - 1);
const RECENT_SAMPLE_COUNT = 80;
const TRANSITION_WINDOW_BEFORE = 32;
const TRANSITION_WINDOW_AFTER = 64;
const ESTIMATED_TRANSITION_MIN_GAIN = 0.08;

export const CHART_WINDOW_OPTIONS: readonly ChartSelectOption<ChartWindowMode>[] =
  [
    { value: "all", label: "All" },
    { value: "recent", label: "Recent" },
    { value: "transition", label: "Transition" }
  ];

export const CHART_SCALE_OPTIONS: readonly ChartSelectOption<ChartScaleMode>[] =
  [
    { value: "auto", label: "Auto" },
    { value: "detail", label: "Detail" },
    { value: "full", label: "Full" }
  ];

export const CHART_METRICS: Record<ChartMetricKey, ChartMetricDefinition> = {
  structureScore: {
    label: "Structure score",
    description:
      "A sum of repeated-byte-pattern signal and executable-instruction enrichment.",
    equation:
      "structure = max(0, byte_entropy_bits_per_byte - compressed_bits_per_byte) + 0.25 * max(0, executable_byte_fraction / random_executable_fraction - 1), where byte_entropy_bits_per_byte is Shannon entropy across all byte values, compressed_bits_per_byte is the smaller estimated bits-per-byte cost from repeated 64-byte programs or repeated 8-byte blocks, executable_byte_fraction is executable_instruction_bytes / total_bytes, and random_executable_fraction = 10/256",
    equationTex:
      "\\begin{aligned}\\mathrm{structure}&=\\max(0,H_{\\mathrm{byte}}-C_{\\mathrm{bytes}})+0.25\\max\\!\\left(0,\\frac{f_{\\mathrm{exec}}}{10/256}-1\\right)\\\\H_{\\mathrm{byte}}&=\\text{Shannon entropy of all byte values, in bits per byte}\\\\C_{\\mathrm{bytes}}&=\\text{estimated compressed bits per byte from repeated tapes or 8-byte blocks}\\\\f_{\\mathrm{exec}}&=\\frac{\\text{number of executable BFF instruction bytes}}{\\text{total number of bytes}}\\end{aligned}",
    commentary:
      "Byte entropy measures how evenly byte values are distributed. Compressed bits per byte estimates how many bits are needed if repeated 64-byte programs or repeated 8-byte blocks are stored once and referenced by index. Executable byte fraction is the share of bytes that are real BFF instructions. This metric rises when exact byte patterns repeat and executable instructions become more common than the random baseline.",
    format: (value) => value.toFixed(3),
    yDomain: [0, MAX_STRUCTURE_SCORE]
  },
  phaseTransitionScore: {
    label: "Phase score",
    description: "How far the structure score has risen above its early baseline.",
    equation:
      "phase = current_structure_score - baseline_mean_structure_score, where baseline_mean_structure_score is the average of the first eight structure-score samples. baseline_standard_deviation is the standard deviation of those same first eight samples. A transition is flagged when phase is greater than max(0.08, 3 * baseline_standard_deviation) for three metric samples in a row.",
    equationTex:
      "\\begin{aligned}\\mathrm{phase}_t&=S_t-\\mu_0\\\\S_t&=\\text{structure score at the current metric sample}\\\\\\mu_0&=\\text{mean of the first eight structure-score samples}\\\\\\sigma_0&=\\text{standard deviation of the first eight structure-score samples}\\\\\\mathrm{transition}&\\iff \\mathrm{phase}_t>\\max(0.08,3\\sigma_0)\\text{ for three samples in a row}\\end{aligned}",
    commentary:
      "The first eight metric samples define the run's starting baseline. A transition is flagged only when structure rises above that baseline by a fixed minimum or by three baseline standard deviations, then remains above the threshold across repeated samples. This avoids treating one-sample noise as sustained repeated-program growth.",
    format: (value) => value.toFixed(3),
    yDomain: [-MAX_STRUCTURE_SCORE, MAX_STRUCTURE_SCORE]
  },
  dominantProgramFraction: {
    label: "Dominant program",
    description: "The share of cells occupied by the most common 64-byte program.",
    equation:
      "dominant_program_fraction = number_of_cells_with_the_most_common_program / total_number_of_cells, where number_of_cells_with_the_most_common_program counts cells whose 64-byte tape exactly matches the most frequent 64-byte tape in the grid.",
    equationTex:
      "\\begin{aligned}\\mathrm{dominant\\ fraction}&=\\frac{n_{\\max}}{N_{\\mathrm{cells}}}\\\\n_{\\max}&=\\text{number of cells holding the most common exact 64-byte tape}\\\\N_{\\mathrm{cells}}&=\\text{total number of grid cells}\\end{aligned}",
    commentary:
      "Each cell contains one 64-byte program. If one exact program appears in more and more cells, interactions are writing that exact byte sequence into additional cells. This is easy to interpret, but it should be read together with the visual pattern and the other metrics because a dominant program is not automatically a self-replicator.",
    format: (value) => `${(value * 100).toFixed(2)}%`,
    yDomain: [0, 1]
  },
  activeInstructionFraction: {
    label: "Executable bytes",
    description: "The share of all bytes that are executable BFF instructions.",
    equation:
      "executable_byte_fraction = executable_instruction_byte_count / total_byte_count, where executable_instruction_byte_count is the number of bytes equal to one of []+-.,<>{} and total_byte_count is grid_cells * 64.",
    equationTex:
      "\\begin{aligned}f_{\\mathrm{exec}}&=\\frac{N_{\\mathrm{exec}}}{N_{\\mathrm{bytes}}}\\\\N_{\\mathrm{exec}}&=\\text{number of bytes equal to }[\\,]\\,+\\,-\\,.\\,,\\,<\\,>\\,\\{\\,\\}\\\\N_{\\mathrm{bytes}}&=\\text{total number of bytes in the grid}\\end{aligned}",
    commentary:
      "Only 10 byte values out of 256 are BFF instructions; all other nonzero byte values are data/no-ops. A random grid starts near 10/256, or about 3.91%. Rising executable-byte density means BFF instruction bytes are becoming more common than expected from random bytes.",
    format: (value) => `${(value * 100).toFixed(2)}%`,
    yDomain: [0, 1]
  },
  uniqueProgramFraction: {
    label: "Unique programs",
    description: "The share of cells that contain distinct 64-byte programs.",
    equation:
      "unique_program_fraction = number_of_distinct_64_byte_tapes / total_number_of_cells, where two tapes are distinct if any byte differs between their 64-byte sequences.",
    equationTex:
      "\\begin{aligned}\\mathrm{unique\\ fraction}&=\\frac{N_{\\mathrm{distinct}}}{N_{\\mathrm{cells}}}\\\\N_{\\mathrm{distinct}}&=\\text{number of distinct exact 64-byte tapes in the grid}\\\\N_{\\mathrm{cells}}&=\\text{total number of grid cells}\\end{aligned}",
    commentary:
      "In a random grid, almost every cell has a distinct 64-byte tape. If exact 64-byte tapes begin repeating, this value falls. A drop means the grid contains fewer distinct programs, which can happen when local interactions write the same program into multiple cells.",
    format: (value) => `${(value * 100).toFixed(2)}%`,
    yDomain: [0, 1]
  }
};

export function renderChartMetricEquation(key: ChartMetricKey): string {
  return katex.renderToString(CHART_METRICS[key].equationTex, {
    displayMode: true,
    throwOnError: false,
    strict: "ignore"
  });
}

export function formatChartMetricValue(
  metric: MetricSnapshot,
  key: ChartMetricKey
): string {
  return CHART_METRICS[key].format(metric[key]);
}

export function drawMetricChart(
  canvas: HTMLCanvasElement,
  history: readonly MetricSnapshot[],
  metricKey: ChartMetricKey,
  options: ChartViewOptions = {}
): void {
  const state = prepareChartState(canvas, history, metricKey, options);
  const { size, plot, plotWidth, view } = state;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  if ("setTransform" in ctx) {
    ctx.setTransform(size.pixelRatio, 0, 0, size.pixelRatio, 0, 0);
  }

  const width = size.width;
  const height = size.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#fbfcfa";
  ctx.fillRect(0, 0, width, height);

  drawChartFrame(ctx, state);

  if (view.samples.length === 0) {
    return;
  }

  drawTransitionMarker(ctx, state);

  if (view.samples.length === 1) {
    const y = metricY(view.samples[0][metricKey], state);
    ctx.fillStyle = "#256c73";
    ctx.beginPath();
    ctx.arc(plot.left + plotWidth / 2, y, 4, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  ctx.strokeStyle = "#2f7880";
  ctx.lineWidth = 2.75;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  view.samples.forEach((sample, index) => {
    const x = sampleX(sample, index, state);
    const y = metricY(sample[metricKey], state);
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();

  if (view.samples.length <= 32) {
    ctx.fillStyle = "#2f7880";
    view.samples.forEach((sample, index) => {
      ctx.beginPath();
      ctx.arc(
        sampleX(sample, index, state),
        metricY(sample[metricKey], state),
        3,
        0,
        Math.PI * 2
      );
      ctx.fill();
    });
  }

  drawHoverPoint(ctx, state);
}

export function metricChartHitTest(
  canvas: HTMLCanvasElement,
  history: readonly MetricSnapshot[],
  metricKey: ChartMetricKey,
  options: ChartViewOptions,
  clientX: number,
  clientY: number
): ChartHoverPoint | null {
  const state = prepareChartState(canvas, history, metricKey, options);
  if (state.view.samples.length === 0) {
    return null;
  }

  const rect =
    typeof canvas.getBoundingClientRect === "function"
      ? canvas.getBoundingClientRect()
      : null;
  if (!rect) {
    return null;
  }

  const x = clientX - rect.left;
  const y = clientY - rect.top;
  if (
    x < state.plot.left ||
    x > state.plot.right ||
    y < state.plot.top ||
    y > state.plot.bottom
  ) {
    return null;
  }

  let nearestViewIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  state.view.samples.forEach((sample, index) => {
    const sampleDistance = Math.abs(sampleX(sample, index, state) - x);
    if (sampleDistance < nearestDistance) {
      nearestDistance = sampleDistance;
      nearestViewIndex = index;
    }
  });

  const sample = state.view.samples[nearestViewIndex];
  const index = state.view.startIndex + nearestViewIndex;
  return {
    index,
    sample,
    x: sampleX(sample, nearestViewIndex, state),
    y: metricY(sample[metricKey], state),
    valueText: CHART_METRICS[metricKey].format(sample[metricKey]),
    transitionLabel: transitionLabelForIndex(state.view.transition, index)
  };
}

export function summarizeChartView(
  history: readonly MetricSnapshot[],
  options: ChartViewOptions = {}
): ChartViewSummary {
  const view = visibleMetricHistory(history, options.windowMode ?? "all");
  const transitionEpoch = visibleTransitionEpoch(view, history);
  return {
    sampleCount: view.samples.length,
    startEpoch: view.samples[0]?.epoch ?? null,
    endEpoch: view.samples.at(-1)?.epoch ?? null,
    transitionEpoch,
    transitionLabel:
      transitionEpoch === null ? null : view.transition?.label ?? null
  };
}

interface ChartPlotArea {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface PreparedCanvasSize {
  width: number;
  height: number;
  pixelRatio: number;
}

interface ChartView {
  samples: readonly MetricSnapshot[];
  startIndex: number;
  transition: TransitionFocus | null;
}

interface TransitionFocus {
  index: number;
  kind: "detected" | "estimated";
  label: "transition" | "steepest rise";
}

interface PreparedChartState {
  size: PreparedCanvasSize;
  plot: ChartPlotArea;
  plotWidth: number;
  plotHeight: number;
  metricKey: ChartMetricKey;
  domain: MetricDomain;
  scaleMode: ChartScaleMode;
  view: ChartView;
  hoverIndex: number | null;
}

function prepareChartState(
  canvas: HTMLCanvasElement,
  history: readonly MetricSnapshot[],
  metricKey: ChartMetricKey,
  options: ChartViewOptions
): PreparedChartState {
  const size = prepareChartCanvas(canvas);
  const plot = {
    left: 62,
    right: size.width - 18,
    top: 30,
    bottom: size.height - 42
  };
  const plotWidth = Math.max(1, plot.right - plot.left);
  const plotHeight = Math.max(1, plot.bottom - plot.top);
  const view = visibleMetricHistory(history, options.windowMode ?? "all");
  const scaleMode = options.scaleMode ?? "auto";
  return {
    size,
    plot,
    plotWidth,
    plotHeight,
    metricKey,
    domain: metricDomain(metricKey, view.samples, scaleMode),
    scaleMode,
    view,
    hoverIndex: options.hoverIndex ?? null
  };
}

function prepareChartCanvas(canvas: HTMLCanvasElement): PreparedCanvasSize {
  const fallbackWidth = Math.max(1, canvas.width);
  const fallbackHeight = Math.max(1, canvas.height);
  const rect =
    typeof canvas.getBoundingClientRect === "function"
      ? canvas.getBoundingClientRect()
      : null;
  const cssWidth = Math.max(
    1,
    Math.round(rect && rect.width > 0 ? rect.width : fallbackWidth)
  );
  const cssHeight = Math.max(
    1,
    Math.round(rect && rect.height > 0 ? rect.height : fallbackHeight)
  );
  const pixelRatio =
    typeof window === "undefined"
      ? 1
      : Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  const backingWidth = Math.round(cssWidth * pixelRatio);
  const backingHeight = Math.round(cssHeight * pixelRatio);

  if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
    canvas.width = backingWidth;
    canvas.height = backingHeight;
  }

  return {
    width: cssWidth,
    height: cssHeight,
    pixelRatio
  };
}

function drawChartFrame(
  ctx: CanvasRenderingContext2D,
  state: PreparedChartState
): void {
  const { plot, plotWidth, metricKey, domain, view } = state;
  ctx.strokeStyle = "#e1e8e4";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const tickValue = domain.max - (i / 4) * (domain.max - domain.min);
    const y = metricY(tickValue, state);
    ctx.beginPath();
    ctx.moveTo(plot.left, y + 0.5);
    ctx.lineTo(plot.right, y + 0.5);
    ctx.stroke();
  }
  for (let i = 0; i <= 4; i += 1) {
    const x = plot.left + (i / 4) * plotWidth;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, plot.top);
    ctx.lineTo(x + 0.5, plot.bottom);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(plot.left + 0.5, plot.top);
  ctx.lineTo(plot.left + 0.5, plot.bottom);
  ctx.lineTo(plot.right, plot.bottom + 0.5);
  ctx.stroke();

  ctx.fillStyle = "#74817b";
  ctx.font = "12px system-ui, sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(CHART_METRICS[metricKey].label, plot.left, 13);
  ctx.textAlign = "right";
  ctx.fillText(scaleLabel(state.scaleMode), plot.right, 13);
  ctx.textAlign = "center";
  ctx.fillText("Epoch", plot.left + plotWidth / 2, plot.bottom + 24);

  ctx.textAlign = "right";
  for (let i = 0; i <= 4; i += 1) {
    const tickValue = domain.max - (i / 4) * (domain.max - domain.min);
    const y = metricY(tickValue, state);
    ctx.fillText(axisValue(tickValue, metricKey), plot.left - 8, y);
  }

  if (view.samples.length === 0) {
    return;
  }
  ctx.textAlign = "left";
  ctx.fillText(String(view.samples[0].epoch), plot.left, plot.bottom + 10);
  ctx.textAlign = "right";
  ctx.fillText(
    String(view.samples[view.samples.length - 1].epoch),
    plot.left + plotWidth,
    plot.bottom + 10
  );
}

interface MetricDomain {
  min: number;
  max: number;
}

function metricDomain(
  metricKey: ChartMetricKey,
  history: readonly MetricSnapshot[],
  scaleMode: ChartScaleMode
): MetricDomain {
  const values = history
    .map((sample) => sample[metricKey])
    .filter((value) => Number.isFinite(value));

  if (values.length === 0) {
    return scaleMode === "full"
      ? fullDomain(metricKey)
      : fallbackDomain(metricKey);
  }

  if (scaleMode === "full") {
    return fullDomain(metricKey);
  }

  if (scaleMode === "detail") {
    return detailDomain(metricKey, values);
  }

  if (metricKey === "phaseTransitionScore") {
    const maxAbs = Math.max(...values.map((value) => Math.abs(value)), 0.05);
    const bound = niceCeil(maxAbs * 1.18);
    return {
      min: -bound,
      max: bound
    };
  }

  if (metricKey === "uniqueProgramFraction") {
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const range = Math.max(maxValue - minValue, 0.01);
    return {
      min: Math.max(0, Math.floor((minValue - range * 0.3) * 100) / 100),
      max: 1
    };
  }

  const maxValue = Math.max(...values, 0);
  const minimumUpper =
    metricKey === "structureScore"
      ? 0.05
      : metricKey === "activeInstructionFraction"
        ? 0.05
        : 0.01;
  const upper = niceCeil(Math.max(maxValue * 1.18, minimumUpper));
  const fixedMax = CHART_METRICS[metricKey].yDomain[1];
  return {
    min: 0,
    max: Math.min(fixedMax, upper)
  };
}

function detailDomain(
  metricKey: ChartMetricKey,
  values: readonly number[]
): MetricDomain {
  const fixed = fullDomain(metricKey);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const minimumRange =
    metricKey === "structureScore"
      ? 0.05
      : metricKey === "phaseTransitionScore"
        ? 0.05
        : 0.005;
  const rawRange = Math.max(maxValue - minValue, minimumRange);
  const padding = rawRange * 0.18;
  let min = minValue - padding;
  let max = maxValue + padding;

  if (metricKey !== "phaseTransitionScore") {
    min = Math.max(0, min);
  }
  min = Math.max(fixed.min, min);
  max = Math.min(fixed.max, max);

  if (max - min < minimumRange) {
    const midpoint = (min + max) / 2;
    min = Math.max(fixed.min, midpoint - minimumRange / 2);
    max = Math.min(fixed.max, midpoint + minimumRange / 2);
  }

  if (max <= min) {
    return fallbackDomain(metricKey);
  }
  return { min, max };
}

function fullDomain(metricKey: ChartMetricKey): MetricDomain {
  return {
    min: CHART_METRICS[metricKey].yDomain[0],
    max: CHART_METRICS[metricKey].yDomain[1]
  };
}

function fallbackDomain(metricKey: ChartMetricKey): MetricDomain {
  if (metricKey === "phaseTransitionScore") {
    return {
      min: -0.1,
      max: 0.1
    };
  }
  if (metricKey === "structureScore") {
    return {
      min: 0,
      max: 1
    };
  }
  return {
    min: CHART_METRICS[metricKey].yDomain[0],
    max: CHART_METRICS[metricKey].yDomain[1]
  };
}

function visibleMetricHistory(
  history: readonly MetricSnapshot[],
  windowMode: ChartWindowMode
): ChartView {
  const transition = findTransitionFocus(history);
  if (history.length === 0) {
    return { samples: [], startIndex: 0, transition };
  }

  if (windowMode === "recent" && history.length > RECENT_SAMPLE_COUNT) {
    const startIndex = history.length - RECENT_SAMPLE_COUNT;
    return {
      samples: history.slice(startIndex),
      startIndex,
      transition
    };
  }

  if (windowMode === "transition" && transition) {
    const startIndex = Math.max(0, transition.index - TRANSITION_WINDOW_BEFORE);
    const endIndex = Math.min(
      history.length,
      transition.index + TRANSITION_WINDOW_AFTER + 1
    );
    return {
      samples: history.slice(startIndex, endIndex),
      startIndex,
      transition
    };
  }

  return { samples: history, startIndex: 0, transition };
}

function visibleTransitionEpoch(
  view: ChartView,
  history: readonly MetricSnapshot[]
): number | null {
  if (
    !view.transition ||
    view.transition.index < view.startIndex ||
    view.transition.index >= view.startIndex + view.samples.length
  ) {
    return null;
  }
  return history[view.transition.index]?.epoch ?? null;
}

function findTransitionFocus(
  history: readonly MetricSnapshot[]
): TransitionFocus | null {
  const detectedIndex = history.findIndex(
    (sample) => sample.phaseTransitionDetected
  );
  if (detectedIndex >= 0) {
    return {
      index: detectedIndex,
      kind: "detected",
      label: "transition"
    };
  }

  let bestIndex = -1;
  let bestGain = 0;
  for (let index = 1; index < history.length; index += 1) {
    const gain =
      history[index].structureScore - history[index - 1].structureScore;
    if (gain > bestGain) {
      bestGain = gain;
      bestIndex = index;
    }
  }

  if (bestIndex < 0) {
    return null;
  }

  const baselineSampleCount = Math.min(
    8,
    Math.max(1, Math.floor(history.length / 3))
  );
  const baselineValues = history
    .slice(0, baselineSampleCount)
    .map((sample) => sample.structureScore);
  const baselineRange =
    baselineValues.length > 0
      ? Math.max(...baselineValues) - Math.min(...baselineValues)
      : 0;
  const threshold = Math.max(
    ESTIMATED_TRANSITION_MIN_GAIN,
    baselineRange * 4
  );
  if (bestGain < threshold) {
    return null;
  }

  return {
    index: bestIndex,
    kind: "estimated",
    label: "steepest rise"
  };
}

function niceCeil(value: number): number {
  if (value <= 0) {
    return 1;
  }
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const nice =
    normalized <= 1
      ? 1
      : normalized <= 2
        ? 2
        : normalized <= 5
          ? 5
          : 10;
  return nice * magnitude;
}

function metricY(value: number, state: PreparedChartState): number {
  const range = state.domain.max - state.domain.min || 1;
  const normalized = clamp((value - state.domain.min) / range, 0, 1);
  return state.plot.bottom - normalized * state.plotHeight;
}

function sampleX(
  sample: MetricSnapshot,
  viewIndex: number,
  state: PreparedChartState
): number {
  if (state.view.samples.length === 1) {
    return state.plot.left + state.plotWidth / 2;
  }
  const firstEpoch = state.view.samples[0].epoch;
  const lastEpoch = state.view.samples[state.view.samples.length - 1].epoch;
  const epochSpan = lastEpoch - firstEpoch;
  if (epochSpan <= 0) {
    return (
      state.plot.left +
      (viewIndex / Math.max(1, state.view.samples.length - 1)) *
        state.plotWidth
    );
  }
  return (
    state.plot.left +
    ((sample.epoch - firstEpoch) / epochSpan) * state.plotWidth
  );
}

function drawTransitionMarker(
  ctx: CanvasRenderingContext2D,
  state: PreparedChartState
): void {
  const transition = state.view.transition;
  if (
    !transition ||
    transition.index < state.view.startIndex ||
    transition.index >= state.view.startIndex + state.view.samples.length
  ) {
    return;
  }

  const viewIndex = transition.index - state.view.startIndex;
  const sample = state.view.samples[viewIndex];
  const x = sampleX(sample, viewIndex, state);
  ctx.fillStyle =
    transition.kind === "detected"
      ? "rgba(198, 134, 24, 0.16)"
      : "rgba(47, 120, 128, 0.14)";
  ctx.fillRect(x - 2, state.plot.top, 4, state.plotHeight);
  ctx.fillStyle = transition.kind === "detected" ? "#8a5b0c" : "#256c73";
  ctx.font = "12px system-ui, sans-serif";
  ctx.textAlign = x < state.plot.left + state.plotWidth / 2 ? "left" : "right";
  ctx.textBaseline = "top";
  ctx.fillText(
    transition.label,
    x < state.plot.left + state.plotWidth / 2 ? x + 6 : x - 6,
    state.plot.top + 8
  );
}

function drawHoverPoint(
  ctx: CanvasRenderingContext2D,
  state: PreparedChartState
): void {
  if (state.hoverIndex === null) {
    return;
  }
  const viewIndex = state.hoverIndex - state.view.startIndex;
  if (viewIndex < 0 || viewIndex >= state.view.samples.length) {
    return;
  }
  const sample = state.view.samples[viewIndex];
  const x = sampleX(sample, viewIndex, state);
  const y = metricY(sample[state.metricKey], state);
  ctx.strokeStyle = "rgba(21, 31, 29, 0.26)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 0.5, state.plot.top);
  ctx.lineTo(x + 0.5, state.plot.bottom);
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#1d5960";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.stroke();
}

function transitionLabelForIndex(
  transition: TransitionFocus | null,
  index: number
): string | null {
  return transition && transition.index === index ? transition.label : null;
}

function scaleLabel(scaleMode: ChartScaleMode): string {
  if (scaleMode === "detail") {
    return "detail scale";
  }
  if (scaleMode === "full") {
    return "full scale";
  }
  return "auto scale";
}

function axisValue(value: number, metricKey: ChartMetricKey): string {
  if (
    metricKey === "dominantProgramFraction" ||
    metricKey === "activeInstructionFraction" ||
    metricKey === "uniqueProgramFraction"
  ) {
    const percent = value * 100;
    const rounded = Math.round(percent);
    if (Math.abs(percent - rounded) < 0.05) {
      return `${rounded}%`;
    }
    return `${percent < 10 && percent > 0 ? percent.toFixed(1) : rounded}%`;
  }
  const abs = Math.abs(value);
  if (abs === 0) {
    return "0.00";
  }
  if (abs < 0.01) {
    return value.toFixed(3);
  }
  return value.toFixed(abs < 10 ? 2 : 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
