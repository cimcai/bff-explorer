import { chromium } from "playwright-core";
import fs from "node:fs";
import zlib from "node:zlib";

const url = process.env.BFF_EXPLORER_URL ?? "http://127.0.0.1:5173/bff/";
const executablePath =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];

page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") {
    errors.push(message.text());
  }
});

await page.goto(url, { waitUntil: "networkidle" });
const desktopLayout = await inspectResponsiveLayout(page);
const midPage = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
await midPage.goto(url, { waitUntil: "networkidle" });
const midLayout = await inspectResponsiveLayout(midPage);
await midPage.close();
const mobilePage = await browser.newPage({ viewport: { width: 390, height: 900 } });
await mobilePage.goto(url, { waitUntil: "networkidle" });
const mobileLayout = await inspectResponsiveLayout(mobilePage);
await mobilePage.close();

const fastModeInitiallyChecked = await page.locator("#fastMode").isChecked();
await page.locator("#fastMode").check();
await page.locator("#mutationRate").fill("0.002");
await page.locator("#resetDefaults").click();
const fastModeResetChecked = await page.locator("#fastMode").isChecked();
const resetMutationValue = await page.locator("#mutationRate").inputValue();
const replicatorPresetOptions = await page.locator("#replicatorPreset option").count();
const initialReplicatorCode = await page.locator("#replicatorCode").textContent();
await page.locator("#replicatorCount").fill("3");
await page.locator("#injectReplicator").click();
await page.waitForFunction(() =>
  document.querySelector("#injectorStatus")?.textContent?.includes("Inserted 3")
);
const injectorStatus = await page.locator("#injectorStatus").textContent();
await page.locator("#loadReplicatorToLab").click();
const loadedReplicatorA = await page.locator("#interactionCellA").inputValue();
const collapseToggleCount = await page.locator("[data-collapse-toggle]").count();
await page.locator('[data-collapsible-section="parameters"] [data-collapse-toggle]').click();
const parametersCollapsed = await isSectionCollapsed(page, "parameters");
await page.locator('[data-collapsible-section="parameters"] [data-collapse-toggle]').click();
const parametersExpanded = !(await isSectionCollapsed(page, "parameters"));
await page.locator("#interactionMaxReads").fill("1");
await page.locator("#interactionCellA").fill("+");
await page.locator("#interactionCellB").fill("");
await page.locator("#evaluateInteraction").click();
const interactionStatus = await page.locator("#interactionStatus").textContent();
const interactionOutputA = await page.locator("#interactionOutputA").textContent();
const interactionChangeA = await page.locator("#interactionChangeA").textContent();
const interactionAfterPrograms = await page.evaluate(() => {
  const programs = document.querySelector('[data-collapsible-section="programs"]');
  const interaction = document.querySelector('[data-collapsible-section="interaction"]');
  return Boolean(
    programs &&
      interaction &&
      programs.compareDocumentPosition(interaction) &
        Node.DOCUMENT_POSITION_FOLLOWING
  );
});
await page.locator("#checkpointInterval").fill("2");
await page.locator("#metricInterval").fill("4");
await page.locator("#timeBudgetMs").fill("20");
await page.locator("#reset").click();
await page.locator("#playPause").click();
await page.waitForTimeout(1800);

const epoch = epochFromLabel(await page.locator("#checkpointEpochLabel").textContent());
const epochsPerSecond = numericText(
  await page.locator("#epochsPerSecond").textContent()
);
const pairsPerEpoch = numericText(
  await page.locator("#pairsPerEpoch").textContent()
);
const structureScore = numericText(await page.locator("#chartMetricValue").textContent());
const checkpointMax = Number(await page.locator("#checkpointScrubber").getAttribute("max"));
const checkpointTotal = checkpointMax + 1;

await page.locator("#playPause").click();

await page.locator("#viewport").hover({ position: { x: 500, y: 300 } });
const initialCanvasScale = await canvasScale(page);
await page.mouse.wheel(0, -600);
await page.mouse.move(500, 300);
await page.mouse.down();
await page.mouse.move(560, 340);
await page.mouse.up();
const zoomedCanvasScale = await canvasScale(page);
await page.mouse.wheel(0, 100000);
await page.waitForTimeout(150);
const zoomedOutCanvasScale = await canvasScale(page);
const zoomFitVisible = await page.locator("#zoomFit").count();
const zoomReadoutVisible = await page.locator("#zoomReadout").count();

await page.locator("#fullscreen").click();
await page.waitForTimeout(300);
const fullscreenState = await page.evaluate(() => ({
  native: document.fullscreenElement?.id === "viewport",
  fallback: document.getElementById("viewport")?.classList.contains("fullscreen-fallback") ?? false,
  button: document.getElementById("fullscreen")?.getAttribute("aria-label") ?? ""
}));
await page.locator("#fullscreen").click();
await page.waitForTimeout(150);

await page.locator("#chartMetric").selectOption("dominantProgramFraction");
const selectedMetric = await page.locator("#chartMetricLabel").textContent();
const chartEquation = await page.locator("#chartEquation").getAttribute("aria-label");
const chartEquationKatex = await page.locator("#chartEquation .katex").count();
const chartCommentary = await page.locator("#chartCommentary").textContent();
const chartOptionCount = await page.locator("#chartMetric option").count();
const seedVisible = await page.locator("#seed").count();
const checksumVisible = await page.locator("#checksum").count();
const redundantMetricCount = await page
  .locator("#epoch, #checkpointCount, #entropyBpb, #compressedBpb, #phaseScore")
  .count();
const checkpointLabel = await page.locator("#checkpointLabel").textContent();
const checkpointEpochLabel = await page.locator("#checkpointEpochLabel").textContent();
const checkpointLatestCount = await page.locator("#checkpointLatest").count();
const defaultButtonCount = await page.locator(".reset-default").count();
const iconTooltipCount = await page.locator(".icon-button[data-tip]").count();
const tooltipChecks = [];
tooltipChecks.push(await inspectTooltip(page, "#fullscreen"));
tooltipChecks.push(await inspectTooltip(page, "#newRun"));
tooltipChecks.push(await inspectTooltip(page, "#fastMode"));
tooltipChecks.push(await inspectTooltip(page, ".info"));
const programRows = await page.locator(".program-row").count();
const programDetail = await page.locator("#programDetailStats").textContent();
const resourceLinks = await page.locator(".resources a").count();

await page.locator("#playPause").click();
await page.waitForTimeout(150);
const playLabelBeforeScrub = await page.locator("#playPause").getAttribute("aria-label");
await scrubTo(page, 0);
await scrubTo(page, 0);
await scrubTo(page, Math.floor(checkpointMax / 2));
const scrubbedCheckpointLabel = await page.locator("#checkpointLabel").textContent();
const scrubbedEpochLabel = await page.locator("#checkpointEpochLabel").textContent();
const playLabelAfterScrub = await page.locator("#playPause").getAttribute("aria-label");
await page.locator("#checkpointLatest").click();
await page.waitForTimeout(250);
const latestCheckpointLabel = await page.locator("#checkpointLabel").textContent();
const latestEpochLabel = await page.locator("#checkpointEpochLabel").textContent();
await page.locator("#playPause").click();
await page.waitForTimeout(400);
await page.locator("#playPause").click();

const screenshotPath = "/tmp/bff-explorer-canvas.png";
await page.locator("#dish").screenshot({ path: screenshotPath });
await browser.close();

const imageStats = inspectPng(screenshotPath);
const result = {
  desktopLayout,
  midLayout,
  mobileLayout,
  fastModeInitiallyChecked,
  fastModeResetChecked,
  epoch,
  epochsPerSecond,
  pairsPerEpoch,
  structureScore,
  checkpointTotal,
  checkpointMax,
  initialCanvasScale,
  zoomedCanvasScale,
  zoomedOutCanvasScale,
  zoomFitVisible,
  zoomReadoutVisible,
  fullscreenState,
  selectedMetric,
  chartEquation,
  chartEquationKatex,
  chartCommentary,
  chartOptionCount,
  seedVisible,
  checksumVisible,
  redundantMetricCount,
  checkpointLabel,
  checkpointEpochLabel,
  checkpointLatestCount,
  scrubbedCheckpointLabel,
  scrubbedEpochLabel,
  latestCheckpointLabel,
  latestEpochLabel,
  resetMutationValue,
  replicatorPresetOptions,
  initialReplicatorCode,
  injectorStatus,
  loadedReplicatorA,
  collapseToggleCount,
  parametersCollapsed,
  parametersExpanded,
  interactionStatus,
  interactionOutputA,
  interactionChangeA,
  interactionAfterPrograms,
  defaultButtonCount,
  iconTooltipCount,
  tooltipChecks,
  programRows,
  programDetail,
  resourceLinks,
  playLabelBeforeScrub,
  playLabelAfterScrub,
  imageStats,
  errors
};
console.log(JSON.stringify(result, null, 2));

if (
  errors.length > 0 ||
  !desktopLayout.parametersRightOfCanvas ||
  !desktopLayout.analysisSideBySide ||
  !desktopLayout.docsSideBySide ||
  !desktopLayout.collapseButtonsContained ||
  !desktopLayout.noHorizontalOverflow ||
  !midLayout.parametersBelowCanvas ||
  !midLayout.analysisStacked ||
  !midLayout.docsStacked ||
  !midLayout.collapseButtonsContained ||
  !midLayout.noHorizontalOverflow ||
  !mobileLayout.parametersBelowCanvas ||
  !mobileLayout.analysisStacked ||
  !mobileLayout.docsStacked ||
  !mobileLayout.checkpointButtonSameTopRow ||
  !mobileLayout.collapseButtonsContained ||
  !mobileLayout.noHorizontalOverflow ||
  fastModeInitiallyChecked ||
  fastModeResetChecked ||
  epoch <= 0 ||
  epochsPerSecond <= 0 ||
  pairsPerEpoch <= 0 ||
  !Number.isFinite(structureScore) ||
  checkpointTotal < 5 ||
  checkpointMax < 4 ||
  zoomFitVisible !== 0 ||
  zoomReadoutVisible !== 0 ||
  zoomedCanvasScale <= initialCanvasScale ||
  Math.abs(zoomedOutCanvasScale - initialCanvasScale) > 0.001 ||
  (!fullscreenState.native && !fullscreenState.fallback) ||
  fullscreenState.button !== "Exit fullscreen" ||
  selectedMetric !== "Dominant program" ||
  !chartEquation?.includes("number_of_cells_with_the_most_common_program") ||
  chartEquationKatex < 1 ||
  !chartCommentary?.includes("Each cell contains one 64-byte program") ||
  chartOptionCount !== 5 ||
  seedVisible !== 0 ||
  checksumVisible !== 0 ||
  redundantMetricCount !== 0 ||
  checkpointLatestCount !== 1 ||
  resetMutationValue !== "0" ||
  replicatorPresetOptions < 3 ||
  !initialReplicatorCode?.includes("[[{.>]-]") ||
  !injectorStatus?.includes("Inserted 3") ||
  !loadedReplicatorA?.includes("[[{.>]-]") ||
  collapseToggleCount !== 7 ||
  !parametersCollapsed ||
  !parametersExpanded ||
  !interactionStatus?.includes("1 reads") ||
  !interactionStatus?.includes("1 active operations") ||
  !interactionOutputA?.startsWith(",") ||
  interactionChangeA !== "1 change" ||
  !interactionAfterPrograms ||
  defaultButtonCount !== 0 ||
  iconTooltipCount < 5 ||
  tooltipChecks.some((check) => !check.visible || !check.inViewport) ||
  programRows < 10 ||
  !programDetail?.includes("cells") ||
  resourceLinks < 3 ||
  playLabelBeforeScrub !== "Pause simulation" ||
  playLabelAfterScrub !== "Pause simulation" ||
  !checkpointLabel?.startsWith("Checkpoint ") ||
  !/^Epoch: [0-9,]+$/.test(checkpointEpochLabel ?? "") ||
  !scrubbedCheckpointLabel?.startsWith("Checkpoint ") ||
  !/^Epoch: [0-9,]+$/.test(scrubbedEpochLabel ?? "") ||
  !isLatestCheckpointLabel(latestCheckpointLabel) ||
  !/^Epoch: [0-9,]+$/.test(latestEpochLabel ?? "") ||
  /[0-9a-f]{8}/i.test(checkpointLabel ?? "") ||
  imageStats.nonBlackFraction < 0.01
) {
  process.exit(1);
}

async function scrubTo(page, index) {
  await page.locator("#checkpointScrubber").evaluate((input, nextValue) => {
    input.value = String(nextValue);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, index);
  await page.waitForTimeout(250);
}

async function isSectionCollapsed(page, sectionName) {
  return page
    .locator(`[data-collapsible-section="${sectionName}"]`)
    .evaluate((section) => section.classList.contains("collapsed"));
}

async function canvasScale(page) {
  return page.evaluate(() => {
    const element = document.getElementById("dish");
    const transform = element ? getComputedStyle(element).transform : "none";
    if (transform === "none") {
      return 1;
    }
    const matrix = /matrix\(([^)]+)\)/.exec(transform);
    if (matrix) {
      const [a, b] = matrix[1].split(",").map(Number);
      return Math.hypot(a, b);
    }
    const matrix3d = /matrix3d\(([^)]+)\)/.exec(transform);
    if (matrix3d) {
      const values = matrix3d[1].split(",").map(Number);
      return Math.hypot(values[0], values[1]);
    }
    return 0;
  });
}

async function inspectResponsiveLayout(page) {
  return page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) {
        return null;
      }
      const { left, right, top, bottom, width, height } =
        element.getBoundingClientRect();
      return { left, right, top, bottom, width, height };
    };
    const viewport = rect("#viewport");
    const parameters = rect('[data-collapsible-section="parameters"]');
    const programs = rect('[data-collapsible-section="programs"]');
    const interaction = rect('[data-collapsible-section="interaction"]');
    const explanation = rect('[data-collapsible-section="explanation"]');
    const resources = rect('[data-collapsible-section="resources"]');
    const checkpointInput = rect("#checkpointScrubber");
    const checkpointLatest = rect("#checkpointLatest");
    const collapseButtonsContained = Array.from(
      document.querySelectorAll("[data-collapse-toggle]")
    ).every((button) => {
      const section = button.closest("[data-collapsible-section]");
      if (!section) {
        return false;
      }
      const buttonRect = button.getBoundingClientRect();
      const sectionRect = section.getBoundingClientRect();
      return (
        buttonRect.left >= sectionRect.left &&
        buttonRect.right <= sectionRect.right &&
        buttonRect.top >= sectionRect.top &&
        buttonRect.bottom <= sectionRect.bottom
      );
    });
    return {
      parametersRightOfCanvas:
        Boolean(viewport && parameters) && parameters.left >= viewport.right + 8,
      parametersBelowCanvas:
        Boolean(viewport && parameters) && parameters.top >= viewport.bottom + 8,
      analysisSideBySide:
        Boolean(programs && interaction) &&
        Math.abs(programs.top - interaction.top) < 24 &&
        interaction.left >= programs.right + 8,
      analysisStacked:
        Boolean(programs && interaction) &&
        interaction.top >= programs.bottom + 8 &&
        Math.abs(programs.left - interaction.left) < 8,
      docsSideBySide:
        Boolean(explanation && resources) &&
        Math.abs(explanation.top - resources.top) < 24 &&
        resources.left >= explanation.right + 8,
      docsStacked:
        Boolean(explanation && resources) &&
        resources.top >= explanation.bottom + 8 &&
        Math.abs(explanation.left - resources.left) < 8,
      checkpointButtonSameTopRow:
        Boolean(checkpointInput && checkpointLatest) &&
      checkpointLatest.bottom <= checkpointInput.top + 2,
      collapseButtonsContained,
      noHorizontalOverflow:
        document.documentElement.scrollWidth <= window.innerWidth + 1
    };
  });
}

async function inspectTooltip(page, selector) {
  await page.locator(selector).first().hover();
  await page.waitForTimeout(80);
  const result = await page.evaluate(() => {
    const tooltip = document.getElementById("tooltipLayer");
    if (!tooltip || tooltip.hidden) {
      return { visible: false, inViewport: false };
    }
    const rect = tooltip.getBoundingClientRect();
    return {
      visible: rect.width > 0 && rect.height > 0,
      inViewport:
        rect.left >= 0 &&
        rect.top >= 0 &&
        rect.right <= window.innerWidth &&
        rect.bottom <= window.innerHeight,
      text: tooltip.textContent,
      rect: {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom
      }
    };
  });
  await page.mouse.move(4, 4);
  return result;
}

function numericText(text) {
  return Number(String(text ?? "0").replace(/,/g, ""));
}

function epochFromLabel(text) {
  const match = /^Epoch:\s*([0-9,]+)$/.exec(String(text ?? ""));
  return match ? numericText(match[1]) : 0;
}

function isLatestCheckpointLabel(text) {
  const match = /^Checkpoint\s+(\d+)\/(\d+)$/.exec(String(text ?? ""));
  return Boolean(match && match[1] === match[2] && Number(match[2]) > 0);
}

function inspectPng(path) {
  const buffer = fs.readFileSync(path);
  let offset = 8;
  let width = 0;
  let height = 0;
  let bytesPerPixel = 4;
  const idats = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    offset += 4;
    const type = buffer.toString("ascii", offset, offset + 4);
    offset += 4;
    const data = buffer.subarray(offset, offset + length);
    offset += length + 4;

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const colorType = data[9];
      bytesPerPixel = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
    } else if (type === "IDAT") {
      idats.push(data);
    } else if (type === "IEND") {
      break;
    }
  }

  const raw = zlib.inflateSync(Buffer.concat(idats));
  const stride = width * bytesPerPixel;
  const output = Buffer.alloc(height * stride);
  let sourceOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = raw[sourceOffset];
    sourceOffset += 1;
    const row = raw.subarray(sourceOffset, sourceOffset + stride);
    sourceOffset += stride;
    const prior = y > 0 ? output.subarray((y - 1) * stride, y * stride) : null;
    const destination = output.subarray(y * stride, (y + 1) * stride);

    for (let x = 0; x < stride; x += 1) {
      const left = x >= bytesPerPixel ? destination[x - bytesPerPixel] : 0;
      const up = prior ? prior[x] : 0;
      const upLeft =
        prior && x >= bytesPerPixel ? prior[x - bytesPerPixel] : 0;
      destination[x] = unfilterByte(filter, row[x], left, up, upLeft);
    }
  }

  let nonBlack = 0;
  const pixels = width * height;
  for (let i = 0; i < output.length; i += bytesPerPixel) {
    const red = output[i];
    const green = bytesPerPixel > 1 ? output[i + 1] : red;
    const blue = bytesPerPixel > 2 ? output[i + 2] : red;
    if (red || green || blue) {
      nonBlack += 1;
    }
  }

  return {
    width,
    height,
    nonBlack,
    nonBlackFraction: nonBlack / pixels
  };
}

function unfilterByte(filter, value, left, up, upLeft) {
  if (filter === 0) {
    return value;
  }
  if (filter === 1) {
    return (value + left) & 255;
  }
  if (filter === 2) {
    return (value + up) & 255;
  }
  if (filter === 3) {
    return (value + Math.floor((left + up) / 2)) & 255;
  }
  if (filter === 4) {
    const prediction = left + up - upLeft;
    const leftDistance = Math.abs(prediction - left);
    const upDistance = Math.abs(prediction - up);
    const upLeftDistance = Math.abs(prediction - upLeft);
    const predictor =
      leftDistance <= upDistance && leftDistance <= upLeftDistance
        ? left
        : upDistance <= upLeftDistance
          ? up
          : upLeft;
    return (value + predictor) & 255;
  }
  throw new Error(`Unsupported PNG filter ${filter}`);
}
