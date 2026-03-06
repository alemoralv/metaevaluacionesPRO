import { InfographicPayload } from "./infographic";

const WIDTH = 1600;
const HEIGHT = 900;
const PAD = 24;

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
  if (score >= 70) return "#16a34a";
  if (score >= 40) return "#ca8a04";
  return "#dc2626";
}

function parseImageDataUrl(dataUrl?: string): { mime: string; data: string } | null {
  if (!dataUrl) return null;
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  return { mime: match[1], data: match[2] };
}

export function renderInfographicSvg(payload: InfographicPayload): string {
  const image = parseImageDataUrl(payload.panoramaChartDataUrl);
  const now = new Date(payload.generatedAtIso);
  const dateLabel = Number.isNaN(now.getTime())
    ? payload.generatedAtIso
    : now.toLocaleDateString("es-MX", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });

  const cardY = 110;
  const colW = 360;
  const leftX = PAD;
  const middleX = PAD + colW + 20;
  const rightX = PAD + colW * 2 + 40;
  const rightW = WIDTH - rightX - PAD;

  const dimensionRows = payload.dimensions
    .map((dimension, index) => {
      const y = 450 + index * 48;
      const barW = Math.max(0, Math.min(100, dimension.average)) * 2.3;
      const safeLabel = escapeXml(dimension.label);
      return `
  <text x="${leftX + 16}" y="${y}" font-size="20" fill="#334155" font-weight="600">${safeLabel}</text>
  <rect x="${leftX + 190}" y="${y - 18}" width="245" height="18" rx="9" fill="#e2e8f0" />
  <rect x="${leftX + 190}" y="${y - 18}" width="${barW}" height="18" rx="9" fill="${barColor(dimension.average)}" />
  <text x="${leftX + 445}" y="${y}" font-size="20" fill="#0f172a" font-weight="700">${dimension.average}%</text>`;
    })
    .join("\n");

  const evaluatorRows = payload.evaluators
    .slice(0, 6)
    .map((evaluator, index) => {
      const y = cardY + 315 + index * 56;
      return `
  <rect x="${middleX + 12}" y="${y - 28}" width="${colW - 24}" height="44" rx="10" fill="#f8fafc" stroke="#e2e8f0" />
  <text x="${middleX + 24}" y="${y}" font-size="18" fill="#1e293b" font-weight="600">${escapeXml(evaluator.label)}</text>
  <text x="${middleX + colW - 24}" y="${y}" text-anchor="end" font-size="18" fill="#0f766e" font-weight="700">${evaluator.average}</text>`;
    })
    .join("\n");

  const panoramaBlock = image
    ? `<image href="data:${image.mime};base64,${image.data}" x="${rightX + 14}" y="${cardY + 84}" width="${rightW - 28}" height="570" preserveAspectRatio="xMidYMid meet" />`
    : `<rect x="${rightX + 14}" y="${cardY + 84}" width="${rightW - 28}" height="570" rx="12" fill="#f8fafc" stroke="#dbeafe" />
  <text x="${rightX + rightW / 2}" y="${cardY + 372}" text-anchor="middle" font-size="24" fill="#64748b">Grafica de panorama no disponible</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="#f1f5f9" />
  <rect x="0" y="0" width="${WIDTH}" height="82" fill="#00345f" />
  <text x="26" y="51" font-size="40" fill="#ffffff" font-weight="700">Evaluacion del Agente: ${escapeXml(payload.reportContext.agentName)}</text>
  <text x="${WIDTH - 26}" y="38" text-anchor="end" font-size="22" fill="#cbd5e1" font-weight="600">Evaluador: ${escapeXml(payload.reportContext.evaluatorName)}</text>
  <text x="${WIDTH - 26}" y="66" text-anchor="end" font-size="22" fill="#cbd5e1" font-weight="600">${escapeXml(dateLabel)}</text>

  <rect x="${leftX}" y="${cardY}" width="${colW}" height="760" rx="18" fill="#ffffff" stroke="#dbeafe" />
  <rect x="${middleX}" y="${cardY}" width="${colW}" height="760" rx="18" fill="#ffffff" stroke="#dbeafe" />
  <rect x="${rightX}" y="${cardY}" width="${rightW}" height="760" rx="18" fill="#ffffff" stroke="#dbeafe" />

  <text x="${leftX + 16}" y="${cardY + 42}" font-size="30" fill="#0f172a" font-weight="700">Resultados globales</text>
  <text x="${leftX + 16}" y="${cardY + 88}" font-size="22" fill="#475569">Promedio global</text>
  <text x="${leftX + 16}" y="${cardY + 136}" font-size="66" fill="#0f766e" font-weight="700">${payload.kpis.globalAverage}</text>
  <text x="${leftX + 16}" y="${cardY + 190}" font-size="20" fill="#334155">Preguntas evaluadas: ${payload.kpis.totalQuestions}</text>
  <text x="${leftX + 16}" y="${cardY + 224}" font-size="20" fill="#334155">Evaluadores: ${payload.kpis.evaluatorCount}</text>

  <rect x="${leftX + 16}" y="${cardY + 248}" width="${colW - 32}" height="88" rx="12" fill="#ecfeff" />
  <text x="${leftX + 28}" y="${cardY + 282}" font-size="20" fill="#155e75" font-weight="700">Mejor evaluador</text>
  <text x="${leftX + 28}" y="${cardY + 312}" font-size="22" fill="#0f172a">${escapeXml(payload.kpis.bestEvaluatorLabel)} (${payload.kpis.bestEvaluatorScore})</text>

  <rect x="${leftX + 16}" y="${cardY + 350}" width="${colW - 32}" height="88" rx="12" fill="#fff1f2" />
  <text x="${leftX + 28}" y="${cardY + 384}" font-size="20" fill="#9f1239" font-weight="700">Evaluador mas bajo</text>
  <text x="${leftX + 28}" y="${cardY + 414}" font-size="22" fill="#0f172a">${escapeXml(payload.kpis.lowestEvaluatorLabel)} (${payload.kpis.lowestEvaluatorScore})</text>

  <text x="${leftX + 16}" y="${cardY + 482}" font-size="28" fill="#0f172a" font-weight="700">Metricas por dimension</text>
  ${dimensionRows}

  <text x="${middleX + 16}" y="${cardY + 42}" font-size="30" fill="#0f172a" font-weight="700">Evaluadores LLM</text>
  <text x="${middleX + 16}" y="${cardY + 82}" font-size="20" fill="#475569">Ordenados por promedio general</text>
  ${evaluatorRows}

  <text x="${rightX + 16}" y="${cardY + 42}" font-size="30" fill="#0f172a" font-weight="700">Panorama general</text>
  <text x="${rightX + 16}" y="${cardY + 72}" font-size="20" fill="#475569">Graficas principales y comparativas</text>
  ${panoramaBlock}
</svg>`;
}

export function renderInfographicSvgDataUrl(payload: InfographicPayload): string {
  const svg = renderInfographicSvg(payload);
  return `data:image/svg+xml;base64,${toBase64Utf8(svg)}`;
}
