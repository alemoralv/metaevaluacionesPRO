import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import {
  AgentReportContext,
  EvaluationRow,
  EvaluationResult,
  LLMConfig,
  QuestionConsistency,
  EnrichedRow,
} from "./types";

const BLUE: [number, number, number] = [0, 74, 153];
const GOLD: [number, number, number] = [255, 194, 14];
const DARK: [number, number, number] = [30, 30, 30];
const GRAY: [number, number, number] = [100, 100, 100];
const LIGHT_GRAY: [number, number, number] = [200, 200, 200];
const WHITE: [number, number, number] = [255, 255, 255];

const GREEN: [number, number, number] = [21, 128, 61];
const YELLOW_SCORE: [number, number, number] = [161, 98, 7];
const RED: [number, number, number] = [185, 28, 28];

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN_L = 25;
const MARGIN_R = 25;
const MARGIN_T = 30;
const MARGIN_B = 25;
const CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R;

type ScoreField = "accuracy" | "completeness" | "relevance" | "coherence" | "clarity" | "usefulness" | "overallScore";

const DIMS: { label: string; field: ScoreField }[] = [
  { label: "Precisión", field: "accuracy" },
  { label: "Completitud", field: "completeness" },
  { label: "Relevancia", field: "relevance" },
  { label: "Coherencia", field: "coherence" },
  { label: "Claridad", field: "clarity" },
  { label: "Utilidad", field: "usefulness" },
  { label: "General", field: "overallScore" },
];

const MONTHS_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function formatDateES(d: Date): string {
  return `${d.getDate()} de ${MONTHS_ES[d.getMonth()]} de ${d.getFullYear()}`;
}

function boolToYesNo(value: boolean): string {
  return value ? "si" : "no";
}

function evaluatorDisplayName(reportContext: AgentReportContext): string {
  return reportContext.evaluatorName?.trim() || "Evaluador no especificado";
}

function withPrefix(fileNamePrefix: string | undefined, fileName: string): string {
  if (!fileNamePrefix) return fileName;
  const safePrefix = fileNamePrefix.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${safePrefix}_${fileName}`;
}

function normalizeReportText(input: string): string {
  if (!input) return "";
  let text = input
    .replace(/\r\n/g, "\n")
    .replace(/\u00A0/g, " ")
    .replace(/\u200B/g, "")
    .replace(/\uFEFF/g, "");

  const replacements: Array<[string, string]> = [
    ["Ã¡", "á"], ["Ã©", "é"], ["Ã­", "í"], ["Ã³", "ó"], ["Ãº", "ú"],
    ["Ã", "Á"], ["Ã‰", "É"], ["Ã", "Í"], ["Ã“", "Ó"], ["Ãš", "Ú"],
    ["Ã±", "ñ"], ["Ã‘", "Ñ"], ["Ã¼", "ü"], ["Ãœ", "Ü"],
    ["Â¿", "¿"], ["Â¡", "¡"], ["Â", ""],
    ["â€“", "-"], ["â€”", "-"], ["â€œ", "\""], ["â€\u009d", "\""], ["â€™", "'"],
  ];
  for (const [broken, fixed] of replacements) {
    text = text.split(broken).join(fixed);
  }
  return text;
}

function scoreColor(score: number): [number, number, number] {
  if (score >= 70) return GREEN;
  if (score >= 40) return YELLOW_SCORE;
  return RED;
}

function scoreBgColor(score: number): [number, number, number] {
  if (score >= 70) return [220, 252, 231];
  if (score >= 40) return [254, 249, 195];
  return [254, 226, 226];
}

function avg(results: EvaluationResult[], field: ScoreField): number {
  if (results.length === 0) return 0;
  return Math.round((results.reduce((s, r) => s + r[field], 0) / results.length) * 10) / 10;
}

function extract(results: EvaluationResult[], field: ScoreField): number[] {
  return results.map((r) => r[field]);
}

function median(vals: number[]): number {
  if (vals.length === 0) return 0;
  const sorted = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const raw = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return Math.round(raw * 10) / 10;
}

function minVal(vals: number[]): number {
  return vals.length === 0 ? 0 : Math.min(...vals);
}

function maxVal(vals: number[]): number {
  return vals.length === 0 ? 0 : Math.max(...vals);
}

function stdDev(vals: number[]): number {
  if (vals.length < 2) return 0;
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
  return Math.round(Math.sqrt(variance) * 100) / 100;
}

function passRate(vals: number[]): number {
  if (vals.length === 0) return 0;
  return Math.round((vals.filter((v) => v >= 70).length / vals.length) * 1000) / 10;
}

function ensureSpace(doc: jsPDF, needed: number, y: number): number {
  if (y + needed > PAGE_H - MARGIN_B) {
    doc.addPage();
    addHeaderFooter(doc);
    return MARGIN_T + 8;
  }
  return y;
}

function addHeaderFooter(doc: jsPDF, headerText?: string) {
  const pageInfo = doc.getCurrentPageInfo();
  const page = pageInfo.pageNumber;

  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.5);
  doc.line(MARGIN_L, 22, PAGE_W - MARGIN_R, 22);

  if (headerText) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...BLUE);
    doc.text(headerText, PAGE_W - MARGIN_R, 18, { align: "right" });
  }

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GRAY);
  doc.text(String(page), PAGE_W / 2, PAGE_H - 12, { align: "center" });
}

function addCoverPage(
  doc: jsPDF,
  reportContext: AgentReportContext,
  date: Date
) {
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, PAGE_W, PAGE_H, "F");

  doc.setFontSize(40);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...BLUE);
  doc.text("Profuturo", PAGE_W / 2, 80, { align: "center" });

  doc.setDrawColor(...GOLD);
  doc.setLineWidth(2);
  const ruleW = 60;
  doc.line(PAGE_W / 2 - ruleW / 2, 92, PAGE_W / 2 + ruleW / 2, 92);

  doc.setFontSize(24);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...BLUE);
  doc.text("Evaluación del Agente:", PAGE_W / 2, 115, { align: "center" });
  doc.text(reportContext.agentName, PAGE_W / 2, 128, { align: "center" });

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...BLUE);
  doc.text(`Fase de prueba: ${reportContext.testPhase}`, PAGE_W / 2, 148, {
    align: "center",
  });

  doc.setDrawColor(...GOLD);
  doc.setLineWidth(2);
  doc.line(PAGE_W / 2 - ruleW / 2, 160, PAGE_W / 2 + ruleW / 2, 160);

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK);
  doc.text("Equipo de Inteligencia Artificial", PAGE_W / 2, 185, { align: "center" });

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(`Evaluador: ${evaluatorDisplayName(reportContext)}`, PAGE_W / 2, 192, {
    align: "center",
  });

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...DARK);
  doc.text(`Fecha: ${formatDateES(date)}`, PAGE_W / 2, 202, { align: "center" });
}

function addSectionTitle(doc: jsPDF, title: string, y: number): number {
  y = ensureSpace(doc, 14, y);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...BLUE);
  doc.text(title, MARGIN_L, y);
  return y + 10;
}

function addSubsectionTitle(doc: jsPDF, title: string, y: number): number {
  y = ensureSpace(doc, 12, y);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...BLUE);
  doc.text(title, MARGIN_L, y);
  return y + 8;
}

function addEvaluatorConfigSection(
  doc: jsPDF,
  configs: LLMConfig[],
  y: number
): number {
  y = addSectionTitle(doc, "Configuración de los Evaluadores", y);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...DARK);
  const introLines = doc.splitTextToSize(
    `Se configuraron ${configs.length} evaluador${configs.length !== 1 ? "es" : ""} LLM para realizar la evaluación automatizada de las respuestas del agente. A continuación se detallan los parámetros de cada evaluador.`,
    CONTENT_W
  );
  doc.text(introLines, MARGIN_L, y);
  y += introLines.length * 5 + 6;

  const colWidths = [10, 50, 30, 25, 25, 25];
  const headers = ["#", "Modelo", "Temperatura", "Top P", "Max Tokens", "ID"];
  const headerH = 8;
  const rowH = 7;

  y = ensureSpace(doc, headerH + configs.length * rowH + 4, y);

  doc.setFillColor(...BLUE);
  doc.rect(MARGIN_L, y - 5, CONTENT_W, headerH, "F");
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...WHITE);

  let x = MARGIN_L + 2;
  headers.forEach((h, i) => {
    doc.text(h, x, y);
    x += colWidths[i];
  });
  y += headerH - 1;

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...DARK);

  configs.forEach((config, idx) => {
    y = ensureSpace(doc, rowH + 2, y);

    if (idx % 2 === 0) {
      doc.setFillColor(245, 247, 250);
      doc.rect(MARGIN_L, y - 4.5, CONTENT_W, rowH, "F");
    }

    const row = [
      String(idx + 1),
      config.model,
      String(config.temperature),
      String(config.topP),
      config.maxTokens ? String(config.maxTokens) : "—",
      config.id.slice(0, 7),
    ];

    doc.setFontSize(9);
    x = MARGIN_L + 2;
    row.forEach((cell, i) => {
      doc.text(cell, x, y);
      x += colWidths[i];
    });
    y += rowH;
  });

  return y + 6;
}

function addAgentContextSection(
  doc: jsPDF,
  reportContext: AgentReportContext,
  y: number
): number {
  y = addSectionTitle(doc, "Configuración del Agente", y);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...DARK);
  const introLines = doc.splitTextToSize(
    `El agente ${reportContext.agentName} fue evaluado utilizando el modelo ${reportContext.modelName}. A continuación se detallan los parámetros de configuración con los que se realizó la prueba.`,
    CONTENT_W
  );
  doc.text(introLines, MARGIN_L, y);
  y += introLines.length * 5 + 6;

  y = addSubsectionTitle(doc, "Base de conocimiento", y);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...DARK);
  const kbLines = doc.splitTextToSize(
    `El agente tuvo acceso a: ${reportContext.knowledgeSource}`,
    CONTENT_W
  );
  doc.text(kbLines, MARGIN_L, y);
  y += kbLines.length * 5 + 5;

  y = addSubsectionTitle(doc, "Parámetros adicionales", y);
  const tableRows: [string, string][] = [
    ["Búsqueda web", boolToYesNo(reportContext.capabilities.webSearch)],
    [
      "Conocimiento general",
      boolToYesNo(reportContext.capabilities.generalKnowledge),
    ],
    ["Orquestación", boolToYesNo(reportContext.capabilities.orchestration)],
    ["Herramientas", boolToYesNo(reportContext.capabilities.tools)],
  ];
  const rowHeight = 7;
  y = ensureSpace(doc, rowHeight * (tableRows.length + 1) + 10, y);
  doc.setFillColor(...BLUE);
  doc.rect(MARGIN_L, y - 5, CONTENT_W, rowHeight, "F");
  doc.setTextColor(...WHITE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Parámetro", MARGIN_L + 2, y);
  doc.text("Valor", MARGIN_L + CONTENT_W - 30, y);
  y += rowHeight - 1;

  doc.setTextColor(...DARK);
  doc.setFont("helvetica", "normal");
  tableRows.forEach((row, idx) => {
    if (idx % 2 === 0) {
      doc.setFillColor(245, 247, 250);
      doc.rect(MARGIN_L, y - 4.5, CONTENT_W, rowHeight, "F");
    }
    doc.text(row[0], MARGIN_L + 2, y);
    doc.text(row[1], MARGIN_L + CONTENT_W - 30, y);
    y += rowHeight;
  });
  y += 3;

  y = addSubsectionTitle(doc, "Fase de prueba", y);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...DARK);
  doc.text(reportContext.testPhase, MARGIN_L, y);
  y += 6;

  if (reportContext.systemInstructions?.trim()) {
    y = addSubsectionTitle(doc, "Instrucciones del sistema", y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    const trimmed = reportContext.systemInstructions.length > 2500
      ? `${reportContext.systemInstructions.slice(0, 2500)}...`
      : reportContext.systemInstructions;
    const instructionBlocks = trimmed
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    for (const block of instructionBlocks) {
      const blockLines = doc.splitTextToSize(block, CONTENT_W - 2);
      y = ensureSpace(doc, blockLines.length * 3.8 + 4, y);
      doc.text(blockLines, MARGIN_L, y);
      y += blockLines.length * 3.8 + 1.8;
    }
    y += 2;
  }

  return y + 4;
}

function addScoreSummary(
  doc: jsPDF,
  results: EvaluationResult[],
  y: number
): number {
  y = addSubsectionTitle(doc, "Resumen de Puntajes", y);

  const metrics = DIMS.map((d) => ({
    label: d.label,
    value: avg(results, d.field),
  }));

  y = ensureSpace(doc, 20, y);

  const boxW = 21;
  const boxH = 18;
  const gap = 2;
  const totalW = metrics.length * boxW + (metrics.length - 1) * gap;
  let startX = MARGIN_L + (CONTENT_W - totalW) / 2;

  metrics.forEach((m, i) => {
    const bx = startX + i * (boxW + gap);
    const bg = scoreBgColor(m.value);
    doc.setFillColor(...bg);
    doc.roundedRect(bx, y - 2, boxW, boxH, 2, 2, "F");

    doc.setFontSize(6);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GRAY);
    doc.text(m.label, bx + boxW / 2, y + 3, { align: "center" });

    const color = scoreColor(m.value);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...color);
    doc.text(String(m.value), bx + boxW / 2, y + 13, { align: "center" });
  });

  return y + boxH + 8;
}

async function captureElement(element: HTMLElement): Promise<string> {
  const canvas = await html2canvas(element, {
    backgroundColor: "#ffffff",
    scale: 2,
    useCORS: true,
    logging: false,
  });
  return canvas.toDataURL("image/png");
}

async function addChartsSection(
  doc: jsPDF,
  chartsContainer: HTMLDivElement | null,
  y: number
): Promise<number> {
  if (!chartsContainer) return y;

  y = addSubsectionTitle(doc, "Gráficas de Evaluación", y);

  try {
    const imgData = await captureElement(chartsContainer);

    const imgW = CONTENT_W;
    const aspectRatio = chartsContainer.offsetHeight / chartsContainer.offsetWidth;
    const imgH = imgW * aspectRatio;

    y = ensureSpace(doc, imgH + 4, y);
    doc.addImage(imgData, "PNG", MARGIN_L, y, imgW, imgH);
    y += imgH + 8;
  } catch {
    doc.setFontSize(9);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(...GRAY);
    doc.text("[No se pudieron capturar las gráficas]", MARGIN_L, y);
    y += 8;
  }

  return y;
}

async function addCapturedFullPageSection(
  doc: jsPDF,
  title: string,
  container: HTMLDivElement | null,
  captureErrorMessage: string
): Promise<number> {
  doc.addPage();
  let y = MARGIN_T + 8;
  y = addSectionTitle(doc, title, y);

  if (!container) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(...GRAY);
    doc.text(captureErrorMessage, MARGIN_L, y);
    return y + 8;
  }

  try {
    const imgData = await captureElement(container);
    const rawW = container.offsetWidth || 1;
    const rawH = container.offsetHeight || 1;

    const maxW = CONTENT_W;
    const maxH = PAGE_H - MARGIN_B - y;
    const scale = Math.min(maxW / rawW, maxH / rawH);

    const drawW = rawW * scale;
    const drawH = rawH * scale;
    const drawX = MARGIN_L + (CONTENT_W - drawW) / 2;
    const drawY = y + (maxH - drawH) / 2;

    doc.addImage(imgData, "PNG", drawX, drawY, drawW, drawH);
    return drawY + drawH + 8;
  } catch {
    doc.setFontSize(9);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(...GRAY);
    doc.text(captureErrorMessage, MARGIN_L, y);
    return y + 8;
  }
}

interface EvaluatorStats {
  label: string;
  count: number;
  bajo: number;
  medio: number;
  alto: number;
  dims: Record<
    ScoreField,
    { avg: number; median: number; min: number; max: number; stdDev: number; passRate: number }
  >;
}

function buildEvaluatorStats(
  configs: LLMConfig[],
  allResults: Record<string, EvaluationResult[]>
): EvaluatorStats[] {
  return configs.map((config) => {
    const results = allResults[config.id] || [];
    const overalls = extract(results, "overallScore");
    return {
      label: `${config.model} (T=${config.temperature})`,
      count: results.length,
      bajo: overalls.filter((v) => v < 40).length,
      medio: overalls.filter((v) => v >= 40 && v < 70).length,
      alto: overalls.filter((v) => v >= 70).length,
      dims: Object.fromEntries(
        DIMS.map((d) => {
          const vals = extract(results, d.field);
          return [
            d.field,
            {
              avg: avg(results, d.field),
              median: median(vals),
              min: minVal(vals),
              max: maxVal(vals),
              stdDev: stdDev(vals),
              passRate: passRate(vals),
            },
          ];
        })
      ) as EvaluatorStats["dims"],
    };
  });
}

function drawDetailedStatsHeader(doc: jsPDF, y: number): number {
  const headerH = 7;
  const colWidths = [34, 15, 11, 11, 11, 11, 11, 11, 11, 12];
  const headers = ["Eval", "Métrica", "Prec", "Comp", "Rel", "Coh", "Clar", "Util", "Gral", "%Aprob"];
  doc.setFillColor(...BLUE);
  doc.rect(MARGIN_L, y - 5, CONTENT_W, headerH, "F");
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...WHITE);
  let x = MARGIN_L + 1.5;
  headers.forEach((h, i) => {
    doc.text(h, x, y);
    x += colWidths[i];
  });
  return y + headerH - 1;
}

function addPanoramaTablesSection(
  doc: jsPDF,
  configs: LLMConfig[],
  allResults: Record<string, EvaluationResult[]>
): number {
  const evaluatorStats = buildEvaluatorStats(configs, allResults);
  doc.addPage();
  let y = MARGIN_T + 8;
  y = addSectionTitle(doc, "Panorama General", y);
  y = addSubsectionTitle(doc, "Estadísticas detalladas por evaluador", y);
  y = drawDetailedStatsHeader(doc, y);

  const rows = [
    { key: "Promedio", fn: (ev: EvaluatorStats, field: ScoreField) => ev.dims[field].avg, isStdDev: false },
    { key: "Mediana", fn: (ev: EvaluatorStats, field: ScoreField) => ev.dims[field].median, isStdDev: false },
    { key: "Mín", fn: (ev: EvaluatorStats, field: ScoreField) => ev.dims[field].min, isStdDev: false },
    { key: "Máx", fn: (ev: EvaluatorStats, field: ScoreField) => ev.dims[field].max, isStdDev: false },
    { key: "Desv.", fn: (ev: EvaluatorStats, field: ScoreField) => ev.dims[field].stdDev, isStdDev: true },
  ];
  const rowH = 6.5;
  const colWidths = [34, 15, 11, 11, 11, 11, 11, 11, 11, 12];

  evaluatorStats.forEach((ev, evIdx) => {
    rows.forEach((row, rowIdx) => {
      if (y + rowH > PAGE_H - MARGIN_B) {
        doc.addPage();
        addHeaderFooter(doc);
        y = MARGIN_T + 8;
        y = addSubsectionTitle(doc, "Estadísticas detalladas por evaluador (cont.)", y);
        y = drawDetailedStatsHeader(doc, y);
      }
      if ((evIdx + rowIdx) % 2 === 0) {
        doc.setFillColor(245, 247, 250);
        doc.rect(MARGIN_L, y - 4.5, CONTENT_W, rowH, "F");
      }
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...DARK);
      let x = MARGIN_L + 1.5;

      const evalText = rowIdx === 0 ? (ev.label.length > 28 ? `${ev.label.slice(0, 28)}...` : ev.label) : "";
      doc.text(evalText, x, y);
      x += colWidths[0];

      doc.text(row.key, x, y);
      x += colWidths[1];

      DIMS.forEach((d, i) => {
        const value = row.fn(ev, d.field);
        if (!row.isStdDev) {
          doc.setTextColor(...scoreColor(value));
          doc.setFont("helvetica", "bold");
        } else {
          doc.setTextColor(...DARK);
          doc.setFont("helvetica", "normal");
        }
        doc.text(String(value), x + 2.5, y);
        x += colWidths[i + 2];
      });

      const pr = rowIdx === 0 ? `${ev.dims.overallScore.passRate}%` : "";
      if (rowIdx === 0) {
        doc.setTextColor(...scoreColor(ev.dims.overallScore.passRate));
        doc.setFont("helvetica", "bold");
      } else {
        doc.setTextColor(...DARK);
        doc.setFont("helvetica", "normal");
      }
      doc.text(pr, x + 1, y);
      y += rowH;
    });
  });

  y += 4;
  y = addSubsectionTitle(doc, "Distribución de puntaje general", y);
  const distHeaderH = 7;
  const distRowH = 7;
  const distColW = [72, 20, 22, 20, 16];
  const distHeaders = ["Evaluador", "Bajo", "Medio", "Alto", "Total"];
  if (y + distHeaderH > PAGE_H - MARGIN_B) {
    doc.addPage();
    addHeaderFooter(doc);
    y = MARGIN_T + 8;
    y = addSubsectionTitle(doc, "Distribución de puntaje general (cont.)", y);
  }
  doc.setFillColor(...BLUE);
  doc.rect(MARGIN_L, y - 5, CONTENT_W, distHeaderH, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...WHITE);
  let x = MARGIN_L + 2;
  distHeaders.forEach((h, i) => {
    doc.text(h, x, y);
    x += distColW[i];
  });
  y += distHeaderH - 1;
  evaluatorStats.forEach((ev, i) => {
    if (y + distRowH > PAGE_H - MARGIN_B) {
      doc.addPage();
      addHeaderFooter(doc);
      y = MARGIN_T + 8;
      y = addSubsectionTitle(doc, "Distribución de puntaje general (cont.)", y);
      doc.setFillColor(...BLUE);
      doc.rect(MARGIN_L, y - 5, CONTENT_W, distHeaderH, "F");
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...WHITE);
      let hx = MARGIN_L + 2;
      distHeaders.forEach((h, idx) => {
        doc.text(h, hx, y);
        hx += distColW[idx];
      });
      y += distHeaderH - 1;
    }
    if (i % 2 === 0) {
      doc.setFillColor(245, 247, 250);
      doc.rect(MARGIN_L, y - 4.5, CONTENT_W, distRowH, "F");
    }
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...DARK);
    let dx = MARGIN_L + 2;
    const lbl = ev.label.length > 50 ? `${ev.label.slice(0, 50)}...` : ev.label;
    doc.text(lbl, dx, y);
    dx += distColW[0];
    doc.setTextColor(...RED);
    doc.setFont("helvetica", "bold");
    doc.text(String(ev.bajo), dx + 6, y);
    dx += distColW[1];
    doc.setTextColor(...YELLOW_SCORE);
    doc.text(String(ev.medio), dx + 7, y);
    dx += distColW[2];
    doc.setTextColor(...GREEN);
    doc.text(String(ev.alto), dx + 7, y);
    dx += distColW[3];
    doc.setTextColor(...DARK);
    doc.setFont("helvetica", "normal");
    doc.text(String(ev.count), dx + 5, y);
    y += distRowH;
  });
  return y + 6;
}

function addConversationEntry(
  doc: jsPDF,
  idx: number,
  row: EnrichedRow,
  y: number,
  headerLabel: string
): number {
  const entryEstimate = 80;
  y = ensureSpace(doc, entryEstimate, y);

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...BLUE);
  doc.text(`Pregunta (${idx + 1}):`, MARGIN_L, y);
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...DARK);
  doc.setFontSize(9);
  const normalizedQuestion = normalizeReportText(row.question);
  const qLines = doc.splitTextToSize(normalizedQuestion, CONTENT_W - 8);
  const qBoxH = Math.max(qLines.length * 4.2 + 6, 12);

  y = ensureSpace(doc, qBoxH + 4, y);
  doc.setDrawColor(...BLUE);
  doc.setFillColor(240, 245, 255);
  doc.setLineWidth(0.4);
  doc.roundedRect(MARGIN_L, y - 3, CONTENT_W, qBoxH, 1.5, 1.5, "FD");
  doc.text(qLines, MARGIN_L + 4, y + 2);
  y += qBoxH + 3;

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(200, 150, 0);
  doc.text(`Respuesta del Agente (${idx + 1}):`, MARGIN_L, y);
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...DARK);
  doc.setFontSize(8);
  const normalizedActualResponse = normalizeReportText(row.actualResponse);
  const truncatedResponse = normalizedActualResponse.length > 600
    ? normalizedActualResponse.slice(0, 600) + "..."
    : normalizedActualResponse;
  const aLines = doc.splitTextToSize(truncatedResponse, CONTENT_W - 8);
  const aBoxH = Math.max(aLines.length * 3.8 + 6, 12);

  y = ensureSpace(doc, aBoxH + 4, y);
  doc.setDrawColor(...GOLD);
  doc.setFillColor(255, 252, 235);
  doc.setLineWidth(0.4);
  doc.roundedRect(MARGIN_L, y - 3, CONTENT_W, aBoxH, 1.5, 1.5, "FD");
  doc.text(aLines, MARGIN_L + 4, y + 1.5);
  y += aBoxH + 3;

  doc.setFontSize(8);
  doc.setFont("helvetica", "bolditalic");
  doc.setTextColor(...BLUE);
  doc.text("Respuesta esperada:", MARGIN_L + 2, y);
  y += 3.5;

  doc.setFont("helvetica", "italic");
  doc.setTextColor(...GRAY);
  const normalizedExpectedResponse = normalizeReportText(row.expectedResponse);
  const eLines = doc.splitTextToSize(
    normalizedExpectedResponse.length > 400
      ? normalizedExpectedResponse.slice(0, 400) + "..."
      : normalizedExpectedResponse,
    CONTENT_W - 6
  );
  y = ensureSpace(doc, eLines.length * 3.5 + 2, y);
  doc.text(eLines, MARGIN_L + 4, y);
  y += eLines.length * 3.5 + 3;

  y = ensureSpace(doc, 8, y);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bolditalic");
  doc.setTextColor(...BLUE);
  doc.text(`Evaluador: ${headerLabel}`, MARGIN_L + 2, y);
  y += 4;

  const scores = [
    { label: "Prec", value: row.accuracy },
    { label: "Comp", value: row.completeness },
    { label: "Rel", value: row.relevance },
    { label: "Coh", value: row.coherence },
    { label: "Clar", value: row.clarity },
    { label: "Util", value: row.usefulness },
    { label: "Gral", value: row.overallScore },
  ];

  doc.setFont("helvetica", "italic");
  doc.setFontSize(7);
  let scoreX = MARGIN_L + 4;
  scores.forEach((s, i) => {
    const color = scoreColor(s.value);
    doc.setTextColor(...BLUE);
    doc.text(`${s.label}: `, scoreX, y);
    const labelW = doc.getTextWidth(`${s.label}: `);
    doc.setTextColor(...color);
    doc.setFont("helvetica", "bolditalic");
    doc.text(`${s.value}`, scoreX + labelW, y);
    const valW = doc.getTextWidth(`${s.value}`);
    doc.setFont("helvetica", "italic");
    scoreX += labelW + valW + (i < scores.length - 1 ? 4 : 0);
  });
  y += 4.5;

  if (row.feedback) {
    y = ensureSpace(doc, 12, y);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bolditalic");
    doc.setTextColor(...BLUE);
    doc.text("Retroalimentación:", MARGIN_L + 2, y);
    y += 3.5;

    doc.setFont("helvetica", "italic");
    doc.setTextColor(...GRAY);
    const fLines = doc.splitTextToSize(normalizeReportText(row.feedback), CONTENT_W - 6);
    y = ensureSpace(doc, fLines.length * 3.5 + 2, y);
    doc.text(fLines, MARGIN_L + 4, y);
    y += fLines.length * 3.5 + 2;
  }

  y += 4;
  doc.setDrawColor(...LIGHT_GRAY);
  doc.setLineWidth(0.2);
  doc.line(MARGIN_L + 20, y, PAGE_W - MARGIN_R - 20, y);
  y += 6;

  return y;
}

function addConversationSection(
  doc: jsPDF,
  rows: EvaluationRow[],
  results: EvaluationResult[],
  evaluatorLabel: string,
  y: number
): number {
  y = addSectionTitle(doc, "Conversación de Prueba", y);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...DARK);
  const intro = doc.splitTextToSize(
    "A continuación se presentan las preguntas realizadas y las respuestas generadas por el agente, junto con las calificaciones y retroalimentación del evaluador.",
    CONTENT_W
  );
  doc.text(intro, MARGIN_L, y);
  y += intro.length * 5 + 8;

  const enriched: EnrichedRow[] = rows.map((row, i) => {
    const result = results.find((r) => r.index === i);
    return {
      ...row,
      accuracy: result?.accuracy ?? 0,
      completeness: result?.completeness ?? 0,
      relevance: result?.relevance ?? 0,
      coherence: result?.coherence ?? 0,
      clarity: result?.clarity ?? 0,
      usefulness: result?.usefulness ?? 0,
      overallScore: result?.overallScore ?? 0,
      feedback: result?.feedback ?? "",
    };
  });

  for (let i = 0; i < enriched.length; i++) {
    y = addConversationEntry(doc, i, enriched[i], y, evaluatorLabel);
  }

  return y;
}

function stdDevPdfColor(val: number): [number, number, number] {
  if (val < 10) return GREEN;
  if (val <= 20) return YELLOW_SCORE;
  return RED;
}

function addConsistencySection(
  doc: jsPDF,
  consistency: QuestionConsistency[],
  y: number
): number {
  doc.addPage();
  addHeaderFooter(doc, "Consistencia");
  y = MARGIN_T + 8;

  y = addSectionTitle(doc, "Consistencia entre Evaluadores", y);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...DARK);
  const intro = doc.splitTextToSize(
    "Para cada pregunta se calculó la desviación estándar de las calificaciones otorgadas por los distintos evaluadores en cada dimensión. Valores bajos indican mayor acuerdo entre evaluadores.",
    CONTENT_W
  );
  doc.text(intro, MARGIN_L, y);
  y += intro.length * 5 + 8;

  const stdDevFields: { label: string; field: keyof QuestionConsistency }[] = [
    { label: "Std Prec", field: "accuracyStdDev" },
    { label: "Std Comp", field: "completenessStdDev" },
    { label: "Std Rel", field: "relevanceStdDev" },
    { label: "Std Coh", field: "coherenceStdDev" },
    { label: "Std Clar", field: "clarityStdDev" },
    { label: "Std Util", field: "usefulnessStdDev" },
    { label: "Std Gral", field: "overallStdDev" },
  ];

  const colWidths = [8, 52, ...stdDevFields.map(() => 14)];
  const headers = ["#", "Pregunta", ...stdDevFields.map((f) => f.label)];
  const headerH = 8;
  const rowH = 7;

  y = ensureSpace(doc, headerH + 4, y);

  doc.setFillColor(...BLUE);
  doc.rect(MARGIN_L, y - 5, CONTENT_W, headerH, "F");
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...WHITE);

  let x = MARGIN_L + 1;
  headers.forEach((h, i) => {
    doc.text(h, x, y);
    x += colWidths[i];
  });
  y += headerH - 1;

  for (let idx = 0; idx < consistency.length; idx++) {
    const c = consistency[idx];
    y = ensureSpace(doc, rowH + 2, y);

    if (idx % 2 === 0) {
      doc.setFillColor(245, 247, 250);
      doc.rect(MARGIN_L, y - 4.5, CONTENT_W, rowH, "F");
    }

    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...DARK);

    x = MARGIN_L + 1;
    doc.text(String(c.questionIndex + 1), x, y);
    x += colWidths[0];

    const safeQuestion = normalizeReportText(c.question);
    const truncQ = safeQuestion.length > 38 ? safeQuestion.slice(0, 38) + "..." : safeQuestion;
    doc.text(truncQ, x, y);
    x += colWidths[1];

    stdDevFields.forEach((sf, vi) => {
      const v = c[sf.field] as number;
      const color = stdDevPdfColor(v);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...color);
      doc.text(String(v), x, y);
      x += colWidths[vi + 2];
    });

    doc.setFont("helvetica", "normal");
    doc.setTextColor(...DARK);
    y += rowH;
  }

  return y + 6;
}

function addMetaAnalysisSection(
  doc: jsPDF,
  consistency: QuestionConsistency[] | null,
  metaAnalysis: string | null,
  recommendations: string[] | null
): number {
  doc.addPage();
  addHeaderFooter(doc, "Meta-evaluador");
  let y = MARGIN_T + 8;
  y = addSectionTitle(doc, "Análisis Meta-evaluador", y);

  if (metaAnalysis?.trim()) {
    y = addSubsectionTitle(doc, "Análisis integral", y);
    const lines = normalizeReportText(metaAnalysis).split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        y += 2;
        continue;
      }
      if (line.startsWith("## ")) {
        y = ensureSpace(doc, 8, y);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(...BLUE);
        doc.text(line.replace(/^##\s*/, "").replace(/\*\*/g, ""), MARGIN_L, y);
        y += 6;
        continue;
      }
      if (line.startsWith("# ")) {
        y = ensureSpace(doc, 9, y);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(...BLUE);
        doc.text(line.replace(/^#\s*/, "").replace(/\*\*/g, ""), MARGIN_L, y);
        y += 7;
        continue;
      }
      const isBullet = line.startsWith("- ") || line.startsWith("• ");
      const clean = line.replace(/^[-•]\s*/, "").replace(/\*\*/g, "");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...DARK);
      const wrapped = doc.splitTextToSize(isBullet ? `- ${clean}` : clean, CONTENT_W);
      y = ensureSpace(doc, wrapped.length * 4 + 2, y);
      doc.text(wrapped, MARGIN_L, y);
      y += wrapped.length * 4 + 1;
    }
  }

  if (consistency && consistency.length > 0) {
    y += 3;
    y = ensureSpace(doc, 12, y);
    y = addSubsectionTitle(doc, "Consistencia entre evaluadores", y);
    const intro = doc.splitTextToSize(
      "Para cada pregunta se calculó la desviación estándar por dimensión. Valores bajos indican mayor acuerdo entre evaluadores.",
      CONTENT_W
    );
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...DARK);
    y = ensureSpace(doc, intro.length * 4 + 3, y);
    doc.text(intro, MARGIN_L, y);
    y += intro.length * 4 + 3;

    const stdDevFields: { label: string; field: keyof QuestionConsistency }[] = [
      { label: "Std Prec", field: "accuracyStdDev" },
      { label: "Std Comp", field: "completenessStdDev" },
      { label: "Std Rel", field: "relevanceStdDev" },
      { label: "Std Coh", field: "coherenceStdDev" },
      { label: "Std Clar", field: "clarityStdDev" },
      { label: "Std Util", field: "usefulnessStdDev" },
      { label: "Std Gral", field: "overallStdDev" },
    ];
    const colWidths = [8, 52, ...stdDevFields.map(() => 14)];
    const headers = ["#", "Pregunta", ...stdDevFields.map((f) => f.label)];
    const headerH = 8;
    const rowH = 7;

    const drawHeader = () => {
      doc.setFillColor(...BLUE);
      doc.rect(MARGIN_L, y - 5, CONTENT_W, headerH, "F");
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...WHITE);
      let xh = MARGIN_L + 1;
      headers.forEach((h, i) => {
        doc.text(h, xh, y);
        xh += colWidths[i];
      });
      y += headerH - 1;
    };
    y = ensureSpace(doc, headerH + 3, y);
    drawHeader();

    for (let idx = 0; idx < consistency.length; idx++) {
      const c = consistency[idx];
      if (y + rowH > PAGE_H - MARGIN_B) {
        doc.addPage();
        addHeaderFooter(doc);
        y = MARGIN_T + 8;
        y = addSubsectionTitle(doc, "Consistencia entre evaluadores (cont.)", y);
        drawHeader();
      }
      if (idx % 2 === 0) {
        doc.setFillColor(245, 247, 250);
        doc.rect(MARGIN_L, y - 4.5, CONTENT_W, rowH, "F");
      }

      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...DARK);

      let x = MARGIN_L + 1;
      doc.text(String(c.questionIndex + 1), x, y);
      x += colWidths[0];

      const safeQuestion = normalizeReportText(c.question);
      const truncQ = safeQuestion.length > 38 ? safeQuestion.slice(0, 38) + "..." : safeQuestion;
      doc.text(truncQ, x, y);
      x += colWidths[1];

      stdDevFields.forEach((sf, vi) => {
        const v = c[sf.field] as number;
        const color = stdDevPdfColor(v);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...color);
        doc.text(String(v), x, y);
        x += colWidths[vi + 2];
      });
      y += rowH;
    }
  }

  if (recommendations && recommendations.length > 0) {
    y += 3;
    y = ensureSpace(doc, 12, y);
    y = addSubsectionTitle(doc, "Recomendaciones", y);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...DARK);

    for (let i = 0; i < recommendations.length; i++) {
      const rec = normalizeReportText(recommendations[i]);
      const wrapped = doc.splitTextToSize(`${i + 1}. ${rec}`, CONTENT_W);
      y = ensureSpace(doc, wrapped.length * 4 + 2, y);
      doc.text(wrapped, MARGIN_L, y);
      y += wrapped.length * 4 + 1;
    }
  }

  return y + 6;
}

function addEndRule(doc: jsPDF, y: number) {
  y = ensureSpace(doc, 16, y);
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(1.5);
  doc.line(MARGIN_L, y, PAGE_W - MARGIN_R, y);
  y += 8;

  doc.setFontSize(10);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(...GRAY);
  doc.text("Fin del reporte de evaluación.", PAGE_W / 2, y, { align: "center" });
}

function addPageNumbers(doc: jsPDF, headerText: string) {
  const total = doc.getNumberOfPages();
  for (let i = 2; i <= total; i++) {
    doc.setPage(i);
    addHeaderFooter(doc, headerText);
  }
}

interface OverviewSlidesPdfParams {
  reportContext: AgentReportContext;
  configs: LLMConfig[];
  allResults: Record<string, EvaluationResult[]>;
  fileNamePrefix?: string;
}

const CARBOT_BLUE: [number, number, number] = [11, 74, 145];
const CARBOT_GOLD: [number, number, number] = [229, 181, 25];
const CARBOT_BORDER: [number, number, number] = [196, 201, 210];
const CARBOT_PANEL: [number, number, number] = [241, 243, 246];
const CARBOT_BAR: [number, number, number] = [117, 134, 152];

const SLIDE_PALETTE: Array<[number, number, number]> = [
  [81, 74, 214],
  [27, 143, 173],
  [17, 146, 93],
  [220, 125, 10],
  [220, 39, 39],
  [124, 58, 237],
  [13, 148, 136],
];

function avgNumbers(vals: number[]): number {
  if (vals.length === 0) return 0;
  return Math.round((vals.reduce((sum, value) => sum + value, 0) / vals.length) * 10) / 10;
}

function drawRoundedBox(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: [number, number, number],
  stroke: [number, number, number]
) {
  doc.setFillColor(...fill);
  doc.setDrawColor(...stroke);
  doc.setLineWidth(0.5);
  doc.roundedRect(x, y, w, h, 4, 4, "FD");
}

function addSlidesChrome(doc: jsPDF, title: string, pageNumber: number, totalPages: number) {
  const slideW = doc.internal.pageSize.getWidth();
  const slideH = doc.internal.pageSize.getHeight();

  doc.setFillColor(248, 249, 251);
  doc.rect(0, 0, slideW, slideH, "F");

  doc.setFillColor(...CARBOT_BLUE);
  doc.rect(0, 0, slideW, 16, "F");

  doc.setDrawColor(...CARBOT_GOLD);
  doc.setLineWidth(1.2);
  doc.line(0, 16.2, slideW, 16.2);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11.5);
  doc.setTextColor(...WHITE);
  doc.text(title, 7, 10.3);

  doc.setDrawColor(220, 224, 230);
  doc.setLineWidth(0.35);
  doc.line(0, slideH - 11, slideW, slideH - 11);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.2);
  doc.setTextColor(...CARBOT_BLUE);
  doc.text("Profuturo", 8, slideH - 6.2);
  doc.setTextColor(...GRAY);
  doc.text("| Equipo de Inteligencia Artificial", 21, slideH - 6.2);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(...CARBOT_BLUE);
  doc.text(`${pageNumber} / ${totalPages}`, slideW - 8, slideH - 6.2, { align: "right" });
}

function addOverviewSlide1(
  doc: jsPDF,
  reportContext: AgentReportContext,
  configs: LLMConfig[],
  allResults: Record<string, EvaluationResult[]>
) {
  const slideW = doc.internal.pageSize.getWidth();
  const slideH = doc.internal.pageSize.getHeight();
  addSlidesChrome(
    doc,
    `${evaluatorDisplayName(reportContext)} — Resultados de Evaluación`,
    1,
    2
  );

  const contentTop = 24;
  const contentBottom = slideH - 15;
  const contentHeight = contentBottom - contentTop;
  const evaluatorStats = buildEvaluatorStats(configs, allResults);
  const totalQuestions = evaluatorStats.length > 0 ? evaluatorStats[0].count : 0;
  const globalAvg = avgNumbers(evaluatorStats.map((e) => e.dims.overallScore.avg));
  const best = evaluatorStats.reduce((acc, current) => {
    if (!acc || current.dims.overallScore.avg > acc.dims.overallScore.avg) return current;
    return acc;
  }, null as EvaluatorStats | null);
  const worst = evaluatorStats.reduce((acc, current) => {
    if (!acc || current.dims.overallScore.avg < acc.dims.overallScore.avg) return current;
    return acc;
  }, null as EvaluatorStats | null);
  const dimensionValues = DIMS.map((dim) => {
    const vals = configs.flatMap((cfg) => (allResults[cfg.id] || []).map((r) => r[dim.field]));
    return { label: dim.label, value: avgNumbers(vals) };
  });

  const temps = configs
    .map((config) => config.temperature)
    .filter((value, index, arr) => arr.indexOf(value) === index)
    .sort((a, b) => a - b)
    .map((value) => `T=${value.toFixed(1)}`);
  const models = configs
    .map((config) => config.model)
    .filter((model, index, arr) => arr.indexOf(model) === index);
  const topPs = configs
    .map((config) => config.topP)
    .filter((value, index, arr) => arr.indexOf(value) === index)
    .sort((a, b) => a - b);
  const topPLabel = topPs.length === 1
    ? String(topPs[0])
    : `${topPs[0]}-${topPs[topPs.length - 1]}`;

  const leftX = 8;
  const leftW = 146;
  const rightX = leftX + leftW + 7;
  const rightW = slideW - rightX - 8;
  const baseY = contentTop + 4;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...GRAY);
  doc.text(`Agente evaluado: ${reportContext.agentName}`, leftX, contentTop);
  doc.text(`Evaluador: ${evaluatorDisplayName(reportContext)}`, leftX + 78, contentTop);

  drawRoundedBox(doc, leftX + 26, baseY, leftW - 52, 28, [231, 238, 248], CARBOT_BLUE);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...CARBOT_BLUE);
  doc.setFontSize(10);
  doc.text("PROMEDIO GLOBAL", leftX + leftW / 2, baseY + 11, { align: "center" });
  doc.setFontSize(22);
  doc.text(globalAvg.toFixed(1), leftX + leftW / 2, baseY + 22, { align: "center" });

  const cardW = (leftW - 8) / 3;
  const cardY = baseY + 35;
  const smallCards = [
    { label: "PREGUNTAS", value: String(totalQuestions) },
    { label: "MEJOR", value: best ? best.dims.overallScore.avg.toFixed(1) : "0.0" },
    { label: "MÁS BAJO", value: worst ? worst.dims.overallScore.avg.toFixed(1) : "0.0" },
  ];
  smallCards.forEach((card, index) => {
    const x = leftX + index * (cardW + 4);
    drawRoundedBox(doc, x, cardY, cardW, 30, [247, 248, 250], CARBOT_BORDER);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...GRAY);
    doc.setFontSize(8.5);
    doc.text(card.label, x + cardW / 2, cardY + 12, { align: "center" });
    doc.setTextColor(...CARBOT_BLUE);
    doc.setFontSize(16);
    doc.text(card.value, x + cardW / 2, cardY + 22, { align: "center" });
  });

  drawRoundedBox(doc, leftX + 12, cardY + 38, leftW - 24, 42, CARBOT_PANEL, CARBOT_BORDER);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...GRAY);
  doc.setFontSize(10);
  doc.text(`EVALUADORES LLM (${models.join(", ")})`, leftX + 18, cardY + 50);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK);
  doc.setFontSize(9);
  doc.text(temps.join("  |  "), leftX + 18, cardY + 62);
  doc.text(`Top P general: ${topPLabel}`, leftX + 18, cardY + 73);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...CARBOT_BLUE);
  doc.text("Métricas por Dimensión (%)", rightX, baseY + 4);

  const chartX = rightX;
  const chartY = baseY + 8;
  const chartW = rightW - 2;
  const chartH = 72;
  const topPad = 8;
  const leftPad = 36;
  const rightPad = 10;
  const barCount = dimensionValues.length;
  const rowH = (chartH - topPad) / barCount;
  const barH = rowH * 0.5;
  const xMax = 100;

  doc.setDrawColor(214, 220, 228);
  doc.setLineWidth(0.3);
  [0, 20, 40, 60, 80, 100].forEach((tick) => {
    const tx = chartX + leftPad + ((chartW - leftPad - rightPad) * tick) / xMax;
    doc.line(tx, chartY + topPad - 2, tx, chartY + chartH - 2);
  });

  dimensionValues.forEach((dim, index) => {
    const centerY = chartY + topPad + rowH * index + rowH / 2;
    const barY = centerY - barH / 2;
    const barX = chartX + leftPad;
    const barW = ((chartW - leftPad - rightPad) * dim.value) / xMax;

    doc.setFont("helvetica", "normal");
    doc.setTextColor(...DARK);
    doc.setFontSize(9);
    doc.text(dim.label, chartX + 2, centerY + 1, { align: "left" });

    doc.setFillColor(...CARBOT_BAR);
    doc.rect(barX, barY, barW, barH, "F");

    doc.setFont("helvetica", "bold");
    doc.setTextColor(...DARK);
    doc.setFontSize(9);
    doc.text(`${dim.value.toFixed(0)}`, barX + barW + 3, centerY + 1);
  });

  const confYStart = chartY + chartH + 6;
  const confH = Math.max(45, contentHeight - (confYStart - contentTop));
  drawRoundedBox(doc, rightX + 2, confYStart, rightW - 4, confH, CARBOT_PANEL, CARBOT_BORDER);
  const confX = rightX + 10;
  let confY = confYStart + 10;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...GRAY);
  doc.setFontSize(11);
  doc.text("CONFIGURACIÓN", confX, confY);
  confY += 10;
  doc.setTextColor(...DARK);
  doc.setFontSize(9.5);
  doc.text(`Modelo: ${reportContext.modelName}`, confX, confY);
  confY += 8;
  doc.text("Base de conocimiento:", confX, confY);
  confY += 6;
  doc.setFont("helvetica", "normal");
  const kbLines = doc.splitTextToSize(reportContext.knowledgeSource, rightW - 22);
  doc.text(kbLines, confX + 2, confY);
  confY += kbLines.length * 4 + 3;
  doc.setFont("helvetica", "bold");
  doc.text(
    `Orquestación de Conversación: ${reportContext.capabilities.orchestration ? "Habilitada" : "Sin Topics"}`,
    confX,
    confY
  );
  confY += 9;

  doc.setFont("helvetica", "bold");
  doc.setTextColor(...GRAY);
  doc.text("RESTRICCIONES", confX, confY);
  confY += 8;
  doc.setTextColor(...DARK);
  doc.setFontSize(9.5);
  const restrictions = [
    { label: "Búsqueda web", value: reportContext.capabilities.webSearch },
    { label: "Conocimiento general", value: reportContext.capabilities.generalKnowledge },
    { label: "Orquestación Agéntica", value: reportContext.capabilities.orchestration },
    { label: "Herramientas", value: reportContext.capabilities.tools },
  ];
  restrictions.forEach((item) => {
    doc.setTextColor(200, 45, 45);
    doc.text("x", confX + 2, confY);
    doc.setTextColor(...DARK);
    doc.text(item.label, confX + 6, confY);
    doc.setFont("helvetica", "bold");
    doc.text(item.value ? "SI" : "NO", confX + 66, confY);
    doc.setFont("helvetica", "normal");
    confY += 7;
  });
}

function addOverviewSlide2(
  doc: jsPDF,
  reportContext: AgentReportContext,
  configs: LLMConfig[],
  allResults: Record<string, EvaluationResult[]>
) {
  const slideW = doc.internal.pageSize.getWidth();
  const slideH = doc.internal.pageSize.getHeight();
  addSlidesChrome(
    doc,
    `${evaluatorDisplayName(reportContext)} — Comparación de evaluadores`,
    2,
    2
  );

  const evaluatorStats = buildEvaluatorStats(configs, allResults);
  const chartX = 13;
  const chartY = 31;
  const chartW = slideW - 26;
  const chartH = 134;
  const axisLeft = chartX + 26;
  const axisBottom = chartY + chartH;
  const axisTop = chartY;
  const axisW = chartW - 32;
  const axisH = chartH;
  const yMax = 100;

  drawRoundedBox(doc, 8, 22, slideW - 16, slideH - 36, [248, 250, 252], [220, 226, 235]);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK);
  doc.setFontSize(15);
  doc.text("Comparación de evaluadores — Promedios por dimensión", 15, 29);

  doc.setDrawColor(206, 213, 222);
  doc.setLineWidth(0.25);
  [0, 25, 50, 75, 100].forEach((tick) => {
    const ty = axisBottom - (axisH * tick) / yMax;
    doc.line(axisLeft, ty, axisLeft + axisW, ty);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GRAY);
    doc.setFontSize(8);
    doc.text(String(tick), axisLeft - 8, ty + 1);
  });

  doc.setDrawColor(110, 116, 126);
  doc.setLineWidth(0.5);
  doc.line(axisLeft, axisTop, axisLeft, axisBottom);
  doc.line(axisLeft, axisBottom, axisLeft + axisW, axisBottom);

  const dimCount = DIMS.length;
  const evaluatorCount = Math.max(evaluatorStats.length, 1);
  const groupW = axisW / dimCount;
  const gap = Math.max(1.5, 4 - evaluatorCount * 0.35);
  const usableW = groupW * 0.8;
  const barW = Math.max(2, Math.min(7, (usableW - gap * (evaluatorCount - 1)) / evaluatorCount));

  DIMS.forEach((dim, dimIndex) => {
    const groupStart = axisLeft + dimIndex * groupW + (groupW - (barW * evaluatorCount + gap * (evaluatorCount - 1))) / 2;
    evaluatorStats.forEach((stat, evalIndex) => {
      const value = stat.dims[dim.field].avg;
      const h = (axisH * value) / yMax;
      const barX = groupStart + evalIndex * (barW + gap);
      const barY = axisBottom - h;
      const color = SLIDE_PALETTE[evalIndex % SLIDE_PALETTE.length];
      doc.setFillColor(...color);
      doc.roundedRect(barX, barY, barW, h, 0.7, 0.7, "F");
    });

    doc.setFont("helvetica", "bold");
    doc.setTextColor(...DARK);
    doc.setFontSize(9);
    doc.text(dim.label, axisLeft + dimIndex * groupW + groupW / 2, axisBottom + 7, { align: "center" });
  });

  const legendYStart = axisBottom + 10;
  const legendStep = 42;
  const maxLegendCols = Math.max(1, Math.floor((slideW - 42) / legendStep));
  evaluatorStats.forEach((stat, index) => {
    const row = Math.floor(index / maxLegendCols);
    const col = index % maxLegendCols;
    const x = 16 + col * legendStep;
    const y = legendYStart + row * 10;
    const color = SLIDE_PALETTE[index % SLIDE_PALETTE.length];
    doc.setFillColor(...color);
    doc.roundedRect(x, y - 3, 5, 5, 0.8, 0.8, "F");
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GRAY);
    doc.setFontSize(8.5);
    const label = stat.label.length > 20 ? `${stat.label.slice(0, 20)}...` : stat.label;
    doc.text(label, x + 7, y + 1);
  });
}

export async function generateOverviewSlidesPdf(params: OverviewSlidesPdfParams) {
  const { reportContext, configs, allResults, fileNamePrefix } = params;
  const evaluationDate = new Date();
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  addOverviewSlide1(doc, reportContext, configs, allResults);
  doc.addPage();
  addOverviewSlide2(doc, reportContext, configs, allResults);
  doc.save(
    withPrefix(
      fileNamePrefix,
      `evaluacion_panorama_slides_${formatDateES(evaluationDate).replace(/ /g, "_")}.pdf`
    )
  );
}

export interface SinglePdfParams {
  reportContext: AgentReportContext;
  config: LLMConfig;
  rows: EvaluationRow[];
  results: EvaluationResult[];
  chartsContainer: HTMLDivElement | null;
  fileNamePrefix?: string;
}

export async function generateSingleEvaluatorPdf(params: SinglePdfParams) {
  const { reportContext, config, rows, results, chartsContainer, fileNamePrefix } = params;
  const evaluationDate = new Date();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const label = `${config.model} (T=${config.temperature})`;

  addCoverPage(doc, reportContext, evaluationDate);

  doc.addPage();
  let y = MARGIN_T + 8;

  y = addAgentContextSection(doc, reportContext, y);
  y = addEvaluatorConfigSection(doc, [config], y);
  y = addScoreSummary(doc, results, y);
  y = await addChartsSection(doc, chartsContainer, y);
  y = addConversationSection(doc, rows, results, label, y);
  addEndRule(doc, y);

  addPageNumbers(
    doc,
    `Evaluación del agente: ${reportContext.agentName} | ${evaluatorDisplayName(reportContext)}`
  );

  const safeModel = config.model.replace(/[^a-zA-Z0-9._-]/g, "_");
  doc.save(withPrefix(fileNamePrefix, `evaluacion_${safeModel}_T${config.temperature}.pdf`));
}

export interface AllPdfParams {
  reportContext: AgentReportContext;
  configs: LLMConfig[];
  rows: EvaluationRow[];
  allResults: Record<string, EvaluationResult[]>;
  chartsContainers: Record<string, HTMLDivElement | null>;
  overviewChartsContainer: HTMLDivElement | null;
  includeMetaSection: boolean;
  consistency: QuestionConsistency[] | null;
  metaAnalysis: string | null;
  recommendations: string[] | null;
  fileNamePrefix?: string;
}

export async function generateAllEvaluatorsPdf(params: AllPdfParams) {
  const {
    configs,
    rows,
    allResults,
    chartsContainers,
    overviewChartsContainer,
    includeMetaSection,
    consistency,
    metaAnalysis,
    recommendations,
    reportContext,
    fileNamePrefix,
  } = params;
  const evaluationDate = new Date();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  addCoverPage(doc, reportContext, evaluationDate);

  doc.addPage();
  let y = MARGIN_T + 8;

  y = addAgentContextSection(doc, reportContext, y);
  y = addEvaluatorConfigSection(doc, configs, y);

  y = await addCapturedFullPageSection(
    doc,
    "Panorama General - Gráficas",
    overviewChartsContainer,
    "[No se pudo capturar el panorama de gráficas]"
  );

  y = addPanoramaTablesSection(doc, configs, allResults);

  if (includeMetaSection) y = addMetaAnalysisSection(doc, consistency, metaAnalysis, recommendations);

  for (const config of configs) {
    const results = allResults[config.id] || [];
    const label = `${config.model} (T=${config.temperature})`;
    const container = chartsContainers[config.id] || null;

    doc.addPage();
    y = MARGIN_T + 8;

    y = addSectionTitle(doc, `Evaluador: ${label}`, y);
    y = addScoreSummary(doc, results, y);
    y = await addChartsSection(doc, container, y);
    y = addConversationSection(doc, rows, results, label, y);
  }

  addEndRule(doc, y);
  addPageNumbers(
    doc,
    `Evaluación del agente: ${reportContext.agentName} | ${evaluatorDisplayName(reportContext)}`
  );

  doc.save(
    withPrefix(
      fileNamePrefix,
      `evaluacion_agente_${formatDateES(evaluationDate).replace(/ /g, "_")}.pdf`
    )
  );
}
