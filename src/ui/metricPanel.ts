import type { MetricSnapshot } from "../simulation/metrics";
import {
  CHART_METRICS,
  drawMetricChart,
  formatChartMetricValue,
  metricChartHitTest,
  renderChartMetricEquation,
  summarizeChartView,
  type ChartMetricKey,
  type ChartScaleMode,
  type ChartViewOptions,
  type ChartWindowMode
} from "./metricChart";
import { setText } from "./dom";

export interface MetricPanel {
  selectedMetric(): ChartMetricKey;
  update(metric: MetricSnapshot, history: readonly MetricSnapshot[]): void;
}

interface MetricPanelRefs {
  metricChart: HTMLCanvasElement;
  metricSelect: HTMLSelectElement;
  windowSelect: HTMLSelectElement;
  scaleSelect: HTMLSelectElement;
  chartReadout: HTMLDivElement;
  chartEquation: HTMLElement;
  phaseBadge: HTMLSpanElement;
}

export function createMetricPanel(refs: MetricPanelRefs): MetricPanel {
  const {
    metricChart,
    metricSelect,
    windowSelect,
    scaleSelect,
    chartReadout,
    chartEquation,
    phaseBadge
  } = refs;
  let selectedChartMetric: ChartMetricKey = "structureScore";
  let selectedWindowMode: ChartWindowMode = "all";
  let selectedScaleMode: ChartScaleMode = "auto";
  let lastMetricHistory: readonly MetricSnapshot[] = [];
  let lastMetric: MetricSnapshot | null = null;
  let hoverIndex: number | null = null;

  metricSelect.addEventListener("change", () => {
    selectedChartMetric = metricSelect.value as ChartMetricKey;
    hoverIndex = null;
    updateCopy(lastMetric ?? undefined);
    updateReadout();
    renderChart();
  });

  windowSelect.addEventListener("change", () => {
    selectedWindowMode = windowSelect.value as ChartWindowMode;
    hoverIndex = null;
    updateReadout();
    renderChart();
  });

  scaleSelect.addEventListener("change", () => {
    selectedScaleMode = scaleSelect.value as ChartScaleMode;
    hoverIndex = null;
    updateReadout();
    renderChart();
  });

  metricChart.addEventListener("pointermove", (event) => {
    const hover = metricChartHitTest(
      metricChart,
      lastMetricHistory,
      selectedChartMetric,
      chartViewOptions(),
      event.clientX,
      event.clientY
    );
    hoverIndex = hover?.index ?? null;
    updateReadout(hover);
    renderChart();
  });

  metricChart.addEventListener("pointerleave", () => {
    hoverIndex = null;
    updateReadout();
    renderChart();
  });

  function selectedMetric(): ChartMetricKey {
    return selectedChartMetric;
  }

  function update(
    metric: MetricSnapshot,
    history: readonly MetricSnapshot[]
  ): void {
    lastMetric = metric;
    lastMetricHistory = history;
    if (hoverIndex !== null && hoverIndex >= history.length) {
      hoverIndex = null;
    }
    updateCopy(metric);
    phaseBadge.textContent = metric.phaseTransitionDetected
      ? "transition"
      : "baseline";
    phaseBadge.classList.toggle("detected", metric.phaseTransitionDetected);
    updateReadout();
    renderChart();
  }

  function renderChart(): void {
    drawMetricChart(
      metricChart,
      lastMetricHistory,
      selectedChartMetric,
      chartViewOptions()
    );
  }

  function chartViewOptions(): ChartViewOptions {
    return {
      windowMode: selectedWindowMode,
      scaleMode: selectedScaleMode,
      hoverIndex
    };
  }

  function updateCopy(metric?: MetricSnapshot): void {
    const option = CHART_METRICS[selectedChartMetric];
    setText("chartMetricLabel", option.label);
    setText("chartDescription", option.description);
    chartEquation.innerHTML = renderChartMetricEquation(selectedChartMetric);
    chartEquation.setAttribute("aria-label", option.equation);
    setText("chartCommentary", option.commentary);
    if (metric) {
      setText(
        "chartMetricValue",
        formatChartMetricValue(metric, selectedChartMetric)
      );
    }
  }

  function updateReadout(
    hover?: ReturnType<typeof metricChartHitTest> | null
  ): void {
    if (hover) {
      const pieces = [
        `Epoch ${hover.sample.epoch.toLocaleString()}`,
        `${CHART_METRICS[selectedChartMetric].label}: ${hover.valueText}`
      ];
      if (hover.transitionLabel) {
        pieces.push(hover.transitionLabel);
      }
      chartReadout.textContent = pieces.join(" · ");
      return;
    }

    const summary = summarizeChartView(lastMetricHistory, chartViewOptions());
    if (summary.sampleCount === 0) {
      chartReadout.textContent = "Waiting for metric samples.";
      return;
    }
    const epochs =
      summary.startEpoch === summary.endEpoch
        ? `epoch ${summary.endEpoch?.toLocaleString()}`
        : `epochs ${summary.startEpoch?.toLocaleString()}-${summary.endEpoch?.toLocaleString()}`;
    chartReadout.textContent = `${summary.sampleCount.toLocaleString()} samples · ${epochs}${
      summary.transitionEpoch === null
        ? ""
        : ` · ${summary.transitionLabel} at ${summary.transitionEpoch.toLocaleString()}`
    }`;
  }

  return {
    selectedMetric,
    update
  };
}
