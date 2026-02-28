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
  doc.text(`Evaluador: ${reportContext.evaluatorName}`, PAGE_W / 2, 192, {
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
    const instructionLines = doc.splitTextToSize(trimmed, CONTENT_W - 4);
    y = ensureSpace(doc, instructionLines.length * 3.8 + 8, y);
    doc.setDrawColor(220, 220, 220);
    doc.roundedRect(MARGIN_L, y - 3.5, CONTENT_W, instructionLines.length * 3.8 + 5, 1.5, 1.5, "S");
    doc.text(instructionLines, MARGIN_L + 2, y);
    y += instructionLines.length * 3.8 + 6;
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
  const qLines = doc.splitTextToSize(row.question, CONTENT_W - 8);
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
  const truncatedResponse = row.actualResponse.length > 600
    ? row.actualResponse.slice(0, 600) + "..."
    : row.actualResponse;
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
  const eLines = doc.splitTextToSize(
    row.expectedResponse.length > 400
      ? row.expectedResponse.slice(0, 400) + "..."
      : row.expectedResponse,
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
    const fLines = doc.splitTextToSize(row.feedback, CONTENT_W - 6);
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
    { label: "σ Prec", field: "accuracyStdDev" },
    { label: "σ Comp", field: "completenessStdDev" },
    { label: "σ Rel", field: "relevanceStdDev" },
    { label: "σ Coh", field: "coherenceStdDev" },
    { label: "σ Clar", field: "clarityStdDev" },
    { label: "σ Util", field: "usefulnessStdDev" },
    { label: "σ Gral", field: "overallStdDev" },
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

    const truncQ = c.question.length > 40 ? c.question.slice(0, 40) + "..." : c.question;
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

export interface SinglePdfParams {
  reportContext: AgentReportContext;
  config: LLMConfig;
  rows: EvaluationRow[];
  results: EvaluationResult[];
  chartsContainer: HTMLDivElement | null;
}

export async function generateSingleEvaluatorPdf(params: SinglePdfParams) {
  const { reportContext, config, rows, results, chartsContainer } = params;
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
    `Evaluación del agente: ${reportContext.agentName} | ${reportContext.evaluatorName}`
  );

  const safeModel = config.model.replace(/[^a-zA-Z0-9._-]/g, "_");
  doc.save(`evaluacion_${safeModel}_T${config.temperature}.pdf`);
}

export interface AllPdfParams {
  reportContext: AgentReportContext;
  configs: LLMConfig[];
  rows: EvaluationRow[];
  allResults: Record<string, EvaluationResult[]>;
  chartsContainers: Record<string, HTMLDivElement | null>;
  overviewContainer: HTMLDivElement | null;
  metaContainer: HTMLDivElement | null;
  includeMetaSection: boolean;
  consistency: QuestionConsistency[] | null;
}

export async function generateAllEvaluatorsPdf(params: AllPdfParams) {
  const {
    configs,
    rows,
    allResults,
    chartsContainers,
    overviewContainer,
    metaContainer,
    includeMetaSection,
    consistency,
    reportContext,
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
    "Panorama General",
    overviewContainer,
    "[No se pudo capturar el Panorama General]"
  );

  if (includeMetaSection) {
    y = await addCapturedFullPageSection(
      doc,
      "Análisis Meta-evaluador",
      metaContainer,
      "[No se pudo capturar el Análisis Meta-evaluador]"
    );
  }

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

  if (consistency && consistency.length > 0) {
    y = addConsistencySection(doc, consistency, y);
  }

  addEndRule(doc, y);
  addPageNumbers(
    doc,
    `Evaluación del agente: ${reportContext.agentName} | ${reportContext.evaluatorName}`
  );

  doc.save(`evaluacion_agente_${formatDateES(evaluationDate).replace(/ /g, "_")}.pdf`);
}
