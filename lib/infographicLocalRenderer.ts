import { InfographicPayload } from "./infographic";

const WIDTH = 1600;
const HEIGHT = 900;
const OUTER_PAD = 18;
const HEADER_H = 96;
const PANEL_TOP = HEADER_H + 16;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toBase64Utf8(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

function barColor(score: number): string {
  if (score >= 80) return "#16a34a";
  if (score >= 65) return "#ca8a04";
  return "#dc2626";
}

function parseImageDataUrl(dataUrl?: string): { mime: string; data: string } | null {
  if (!dataUrl) return null;
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  return { mime: match[1], data: match[2] };
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function truncateText(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 1))}...`;
}

function linesWithEllipsis(value: string, maxCharsPerLine: number, maxLines: number): string[] {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxCharsPerLine) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    if (lines.length === maxLines) break;
  }

  if (lines.length < maxLines && current) {
    lines.push(current);
  }

  if (lines.length > maxLines) {
    return lines.slice(0, maxLines);
  }

  if (words.join(" ").length > lines.join(" ").length && lines.length > 0) {
    const lastIdx = lines.length - 1;
    lines[lastIdx] = truncateText(lines[lastIdx], Math.max(4, maxCharsPerLine - 2));
    if (!lines[lastIdx].endsWith("...")) lines[lastIdx] = `${lines[lastIdx]}...`;
  }

  return lines;
}

function formatDateLabel(iso: string): string {
  const now = new Date(iso);
  if (Number.isNaN(now.getTime())) return iso;
  return now.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function renderInfographicSvg(payload: InfographicPayload): string {
  const image = parseImageDataUrl(payload.panoramaChartDataUrl);
  const dateLabel = formatDateLabel(payload.generatedAtIso);

  // Fixed template-like grid.
  const leftX = OUTER_PAD;
  const leftW = 360;
  const midX = leftX + leftW + 18;
  const midW = 360;
  const rightX = midX + midW + 18;
  const rightW = WIDTH - OUTER_PAD - rightX;
  const panelH = HEIGHT - PANEL_TOP - OUTER_PAD;

  const bestLines = linesWithEllipsis(
    `${payload.kpis.bestEvaluatorLabel} (${formatScore(payload.kpis.bestEvaluatorScore)})`,
    30,
    2
  );
  const lowestLines = linesWithEllipsis(
    `${payload.kpis.lowestEvaluatorLabel} (${formatScore(payload.kpis.lowestEvaluatorScore)})`,
    30,
    2
  );

  const metricRows = payload.dimensions.slice(0, 7).map((dimension, index) => {
    const y = PANEL_TOP + 470 + index * 46;
    const score = clamp(dimension.average, 0, 100);
    const barW = (score / 100) * 245;
    const label = truncateText(dimension.label, 14);
    return `
  <text x="${leftX + 20}" y="${y}" font-size="22" fill="#374151" font-weight="600">${escapeXml(label)}</text>
  <rect x="${leftX + 190}" y="${y - 16}" width="245" height="16" rx="8" fill="#dbe2ec" />
  <rect x="${leftX + 190}" y="${y - 16}" width="${barW}" height="16" rx="8" fill="${barColor(score)}" />
  <text x="${leftX + 448}" y="${y}" font-size="22" fill="#111827" font-weight="700">${formatScore(score)}%</text>`;
  });

  const sortedEvaluators = [...payload.evaluators].sort((a, b) => b.average - a.average).slice(0, 6);
  const evaluatorRows = sortedEvaluators.map((evaluator, index) => {
    const y = PANEL_TOP + 274 + index * 56;
    const label = truncateText(evaluator.label, 25);
    return `
  <rect x="${midX + 14}" y="${y - 28}" width="${midW - 28}" height="42" rx="10" fill="#f8fafc" stroke="#e5e7eb"/>
  <text x="${midX + 26}" y="${y}" font-size="20" fill="#1f2937" font-weight="600">${escapeXml(label)}</text>
  <text x="${midX + midW - 22}" y="${y}" font-size="20" text-anchor="end" fill="#0f766e" font-weight="700">${formatScore(
      evaluator.average
    )}</text>`;
  });

  const panoramaInnerX = rightX + 14;
  const panoramaInnerY = PANEL_TOP + 102;
  const panoramaInnerW = rightW - 28;
  const panoramaInnerH = panelH - 120;

  const panoramaBlock = image
    ? `<clipPath id="panoramaClip"><rect x="${panoramaInnerX}" y="${panoramaInnerY}" width="${panoramaInnerW}" height="${panoramaInnerH}" rx="10" /></clipPath>
  <rect x="${panoramaInnerX}" y="${panoramaInnerY}" width="${panoramaInnerW}" height="${panoramaInnerH}" rx="10" fill="#ffffff" stroke="#d1d5db" />
  <image
    href="data:${image.mime};base64,${image.data}"
    x="${panoramaInnerX}"
    y="${panoramaInnerY}"
    width="${panoramaInnerW}"
    height="${panoramaInnerH}"
    preserveAspectRatio="xMidYMid meet"
    clip-path="url(#panoramaClip)"
  />`
    : `<rect x="${panoramaInnerX}" y="${panoramaInnerY}" width="${panoramaInnerW}" height="${panoramaInnerH}" rx="10" fill="#f8fafc" stroke="#d1d5db" />
  <text x="${panoramaInnerX + panoramaInnerW / 2}" y="${panoramaInnerY + panoramaInnerH / 2}" text-anchor="middle" font-size="24" fill="#64748b">Panorama no disponible</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="#e5e7eb" />
  <rect x="${OUTER_PAD}" y="${OUTER_PAD}" width="${WIDTH - OUTER_PAD * 2}" height="${HEIGHT - OUTER_PAD * 2}" fill="#f3f4f6" rx="4" />

  <rect x="${OUTER_PAD}" y="${OUTER_PAD}" width="${WIDTH - OUTER_PAD * 2}" height="${HEADER_H}" fill="#003d72" />
  <rect x="${OUTER_PAD + 18}" y="${OUTER_PAD + 14}" width="186" height="58" rx="8" fill="#f8fafc" />
  <text x="${OUTER_PAD + 111}" y="${OUTER_PAD + 50}" text-anchor="middle" font-size="42" fill="#003d72" font-weight="700">Profuturo</text>

  <text x="${OUTER_PAD + 232}" y="${OUTER_PAD + 44}" font-size="48" fill="#ffffff" font-weight="700">Evaluacion del Agente: ${escapeXml(
    truncateText(payload.reportContext.agentName, 28)
  )}</text>
  <text x="${OUTER_PAD + 232}" y="${OUTER_PAD + 74}" font-size="25" fill="#dbeafe" font-weight="600">Fase de prueba: ${escapeXml(
    truncateText(payload.reportContext.testPhase || "N/A", 28)
  )}</text>

  <text x="${WIDTH - OUTER_PAD - 18}" y="${OUTER_PAD + 34}" text-anchor="end" font-size="22" fill="#dbeafe" font-weight="600">Evaluador: ${escapeXml(
    truncateText(payload.reportContext.evaluatorName, 34)
  )}</text>
  <text x="${WIDTH - OUTER_PAD - 18}" y="${OUTER_PAD + 66}" text-anchor="end" font-size="22" fill="#dbeafe" font-weight="600">${escapeXml(
    dateLabel
  )}</text>
  <text x="${WIDTH - OUTER_PAD - 18}" y="${OUTER_PAD + 90}" text-anchor="end" font-size="22" fill="#dbeafe" font-weight="700">EQUIPO DE INTELIGENCIA ARTIFICIAL</text>

  <rect x="${leftX}" y="${PANEL_TOP}" width="${leftW}" height="${panelH}" rx="16" fill="#f9fafb" stroke="#d1d5db" />
  <rect x="${midX}" y="${PANEL_TOP}" width="${midW}" height="${panelH}" rx="16" fill="#f9fafb" stroke="#d1d5db" />
  <rect x="${rightX}" y="${PANEL_TOP}" width="${rightW}" height="${panelH}" rx="16" fill="#f9fafb" stroke="#d1d5db" />

  <text x="${leftX + 16}" y="${PANEL_TOP + 40}" font-size="42" fill="#111827" font-weight="700">Resultados globales</text>
  <text x="${leftX + 16}" y="${PANEL_TOP + 80}" font-size="32" fill="#4b5563">Promedio global</text>
  <text x="${leftX + 16}" y="${PANEL_TOP + 146}" font-size="72" fill="#0f766e" font-weight="700">${formatScore(
    payload.kpis.globalAverage
  )}</text>
  <text x="${leftX + 16}" y="${PANEL_TOP + 198}" font-size="34" fill="#374151">Preguntas evaluadas: ${payload.kpis.totalQuestions}</text>
  <text x="${leftX + 16}" y="${PANEL_TOP + 236}" font-size="34" fill="#374151">Evaluadores: ${payload.kpis.evaluatorCount}</text>

  <rect x="${leftX + 16}" y="${PANEL_TOP + 262}" width="${leftW - 32}" height="96" rx="10" fill="#e9f7fb" />
  <text x="${leftX + 28}" y="${PANEL_TOP + 295}" font-size="24" fill="#0f5f7a" font-weight="700">Mejor evaluador</text>
  <text x="${leftX + 28}" y="${PANEL_TOP + 326}" font-size="22" fill="#111827">${escapeXml(bestLines[0] ?? "")}</text>
  <text x="${leftX + 28}" y="${PANEL_TOP + 350}" font-size="22" fill="#111827">${escapeXml(bestLines[1] ?? "")}</text>

  <rect x="${leftX + 16}" y="${PANEL_TOP + 370}" width="${leftW - 32}" height="96" rx="10" fill="#fef0f2" />
  <text x="${leftX + 28}" y="${PANEL_TOP + 403}" font-size="24" fill="#9f1239" font-weight="700">Evaluador mas bajo</text>
  <text x="${leftX + 28}" y="${PANEL_TOP + 434}" font-size="22" fill="#111827">${escapeXml(lowestLines[0] ?? "")}</text>
  <text x="${leftX + 28}" y="${PANEL_TOP + 458}" font-size="22" fill="#111827">${escapeXml(lowestLines[1] ?? "")}</text>

  <text x="${leftX + 16}" y="${PANEL_TOP + 514}" font-size="38" fill="#111827" font-weight="700">Metricas por dimension</text>
  ${metricRows.join("\n")}

  <text x="${midX + 16}" y="${PANEL_TOP + 40}" font-size="42" fill="#111827" font-weight="700">Evaluadores LLM</text>
  <text x="${midX + 16}" y="${PANEL_TOP + 78}" font-size="28" fill="#4b5563">Ordenados por promedio general</text>
  ${evaluatorRows.join("\n")}

  <text x="${rightX + 16}" y="${PANEL_TOP + 40}" font-size="42" fill="#111827" font-weight="700">Panorama general</text>
  <text x="${rightX + 16}" y="${PANEL_TOP + 78}" font-size="28" fill="#4b5563">Graficas principales y comparativas</text>
  ${panoramaBlock}
</svg>`;
}

export function renderInfographicSvgDataUrl(payload: InfographicPayload): string {
  const svg = renderInfographicSvg(payload);
  return `data:image/svg+xml;base64,${toBase64Utf8(svg)}`;
}
