import {
  AgentReportContext,
  EvaluationRow,
  EvaluationResult,
  LLMConfig,
  QuestionConsistency,
} from "./types";
import JSZip from "jszip";

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

function escapeTex(text: string): string {
  return text
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/&/g, "\\&")
    .replace(/%/g, "\\%")
    .replace(/\$/g, "\\$")
    .replace(/#/g, "\\#")
    .replace(/_/g, "\\_")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}");
}

function extract(results: EvaluationResult[], field: ScoreField): number[] {
  return results.map((r) => r[field]);
}

function avg(vals: number[]): number {
  if (vals.length === 0) return 0;
  return Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10;
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

function llmLabel(config: LLMConfig): string {
  return `${config.model} (T=${config.temperature})`;
}

function scoreColorCmd(value: number): string {
  if (value >= 70) return "\\textcolor{green!60!black}";
  if (value >= 40) return "\\textcolor{yellow!60!black}";
  return "\\textcolor{red!70!black}";
}

function stdDevColorCmd(value: number): string {
  if (value < 10) return "\\textcolor{green!60!black}";
  if (value <= 20) return "\\textcolor{yellow!60!black}";
  return "\\textcolor{red!70!black}";
}

const STD_DEV_DIMS: { label: string; field: keyof QuestionConsistency }[] = [
  { label: "Precisión", field: "accuracyStdDev" },
  { label: "Completitud", field: "completenessStdDev" },
  { label: "Relevancia", field: "relevanceStdDev" },
  { label: "Coherencia", field: "coherenceStdDev" },
  { label: "Claridad", field: "clarityStdDev" },
  { label: "Utilidad", field: "usefulnessStdDev" },
  { label: "General", field: "overallStdDev" },
];

interface EvaluatorStats {
  config: LLMConfig;
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

export interface TexImageAsset {
  filename: string;
  dataUrl: string;
  caption: string;
}

function generatePreamble(headerText: string): string {
  return `\\documentclass[11pt, a4paper]{article}
%% Idioma y codificación
\\usepackage[utf8]{inputenc}
\\usepackage[spanish]{babel}
\\usepackage[T1]{fontenc}
\\usepackage{amsmath}
%% Tipografía y microajustes
\\usepackage{lmodern}
\\usepackage{microtype}
\\usepackage{helvet}
\\renewcommand{\\familydefault}{\\sfdefault}
%% Gráficos / tablas / color
\\usepackage{graphicx}
\\usepackage{xcolor}
\\usepackage{booktabs}
\\usepackage{tabularx}
\\usepackage{longtable}
\\usepackage{multirow}
%% Layout y estilo
\\usepackage{geometry}
\\usepackage{titlesec}
\\usepackage{enumitem}
\\usepackage{fancyhdr}
%% Utilidades
\\usepackage{csquotes}
\\usepackage{pifont}
\\usepackage{hyperref}
\\usepackage{comment}
\\usepackage{url}
%% Párrafos
\\setlength{\\parindent}{0pt}
\\setlength{\\parskip}{0.7em}
%% Colores de marca
\\definecolor{profublue}{HTML}{004a99}
\\definecolor{profugold}{HTML}{ffc20e}
\\definecolor{profred}{HTML}{b91c1c}
\\definecolor{profyellow}{HTML}{a16207}
\\definecolor{profgreen}{HTML}{15803d}
%% Márgenes
\\geometry{
    top=3cm,
    bottom=3cm,
    left=2.5cm,
    right=2.5cm,
    headheight=40pt
}
%% Encabezado / pie
\\pagestyle{fancy}
\\fancyhf{}
\\rhead{\\textcolor{profublue}{\\textbf{${escapeTex(headerText)}}}}
\\cfoot{\\thepage}
\\renewcommand{\\headrulewidth}{0.5pt}
\\renewcommand{\\headrule}{\\hbox to\\headwidth{\\color{profugold}\\leaders\\hrule height \\headrulewidth\\hfill}}
%% Títulos
\\titleformat{\\section}
{\\color{profublue}\\Large\\bfseries}
{\\thesection.\\quad}{0em}{}
\\titleformat{\\subsection}
{\\color{profublue}\\large\\bfseries}
{\\thesubsection.\\quad}{0em}{}
\\titlespacing*{\\section}{0pt}{1.2em}{0.5em}
\\titlespacing*{\\subsection}{0pt}{0.9em}{0.4em}
%% Listas
\\setlistdepth{5}
\\renewlist{itemize}{itemize}{5}
\\setlist[itemize]{leftmargin=*, topsep=6pt, itemsep=3pt, parsep=2pt, labelsep=0.6em}
\\setlist[itemize,1]{label=\\textcolor{profugold}{\\large\\textbullet}}
\\setlist[itemize,2]{label=\\textcolor{profublue}{\\normalsize\\textbullet}}
\\setlist[itemize,3]{label=\\textcolor{profugold}{\\small\\ding{118}}}
\\setlist[itemize,4]{label=\\textcolor{profugold}{\\tiny\\textbullet}}
\\setlist[itemize,5]{label=\\textcolor{profugold}{\\tiny\\textbullet}}
\\setlist[enumerate]{leftmargin=*, topsep=6pt, itemsep=3pt, parsep=2pt, label=\\textcolor{profublue}{\\arabic*.}}
%% Links
\\hypersetup{
  colorlinks=true,
  linkcolor=profublue,
  urlcolor=profublue,
  citecolor=profublue
}
\\graphicspath{{assets/}}
`;
}

function generateCoverPage(reportContext: AgentReportContext, date: Date): string {
  return `
\\begin{titlepage}
    \\centering
    \\vspace*{2cm}
    {\\fontsize{40}{48}\\selectfont\\bfseries\\textcolor{profublue}{Profuturo}\\par}
    \\vspace{0.8cm}
    {\\color{profugold}\\rule{0.4\\textwidth}{2pt}\\par}
    \\vspace{1.2cm}
    {\\fontsize{28}{34}\\selectfont\\bfseries\\textcolor{profublue}{Evaluación del Agente:}\\par}
    {\\fontsize{28}{34}\\selectfont\\bfseries\\textcolor{profublue}{${escapeTex(reportContext.agentName)}}\\par}
    \\vspace{0.6cm}
    {\\Large\\bfseries\\textcolor{profublue}{Fase de prueba: ${escapeTex(reportContext.testPhase)}}\\par}
    \\vspace{0.8cm}
    {\\color{profugold}\\rule{0.4\\textwidth}{2pt}\\par}
    \\vspace{2cm}
    {\\large\\bfseries Equipo de Inteligencia Artificial\\par}
    \\vspace{0.5cm}
    {\\normalsize Evaluador: ${escapeTex(reportContext.evaluatorName)}\\par}
    \\vspace{1cm}
    {\\normalsize Fecha: ${formatDateES(date)}\\par}
    \\vfill
\\end{titlepage}
`;
}

function generateAgentConfigurationSection(reportContext: AgentReportContext): string {
  let tex = `\\section{Configuración del Agente}\n\n`;
  tex += `El agente \\textbf{${escapeTex(reportContext.agentName)}} fue evaluado utilizando el modelo \\textbf{${escapeTex(reportContext.modelName)}}. A continuación se detallan los parámetros de configuración con los que se realizó la prueba.\n\n`;

  tex += `\\subsection{Base de conocimiento}\n\n`;
  tex += `El agente tuvo acceso a los siguientes documentos o recursos como base de conocimiento:\n\n`;
  tex += `\\vspace{0.3em}\n`;
  tex += `\\quad \\textbf{${escapeTex(reportContext.knowledgeSource)}}\n\n`;

  tex += `\\subsection{Parámetros adicionales}\n\n`;
  tex += `\\renewcommand{\\arraystretch}{1.35}\n`;
  tex += `\\begin{center}\n`;
  tex += `\\begin{tabularx}{0.85\\textwidth}{l X}\n`;
  tex += `\\toprule\n`;
  tex += `\\textcolor{profublue}{\\textbf{Parámetro}} & \\textcolor{profublue}{\\textbf{Valor}} \\\\\n`;
  tex += `\\midrule\n`;
  tex += `Búsqueda web & ${escapeTex(boolToYesNo(reportContext.capabilities.webSearch))} \\\\\n`;
  tex += `Conocimiento general & ${escapeTex(boolToYesNo(reportContext.capabilities.generalKnowledge))} \\\\\n`;
  tex += `Orquestación & ${escapeTex(boolToYesNo(reportContext.capabilities.orchestration))} \\\\\n`;
  tex += `Herramientas & ${escapeTex(boolToYesNo(reportContext.capabilities.tools))} \\\\\n`;
  tex += `\\bottomrule\n`;
  tex += `\\end{tabularx}\n`;
  tex += `\\end{center}\n\n`;

  tex += `\\subsection{Fase de prueba}\n\n`;
  tex += `\\textbf{${escapeTex(reportContext.testPhase)}}\n\n`;

  if (reportContext.systemInstructions?.trim()) {
    tex += `\\subsection{Instrucciones del sistema}\n\n`;
    tex += `Las instrucciones proporcionadas al agente fueron las siguientes:\n\n`;
    const lines = reportContext.systemInstructions
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    for (const line of lines) {
      tex += `\\vspace{0.4em}\n`;
      tex += `\\noindent\\begin{minipage}{\\textwidth}\n`;
      tex += `\\footnotesize\\itshape ${escapeTex(line)}\n`;
      tex += `\\end{minipage}\n`;
    }
    tex += `\n`;
  }

  return tex;
}

function buildEvaluatorStats(
  configs: LLMConfig[],
  allResults: Record<string, EvaluationResult[]>
): EvaluatorStats[] {
  return configs.map((config) => {
    const results = allResults[config.id] || [];
    const overalls = extract(results, "overallScore");
    return {
      config,
      label: llmLabel(config),
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
              avg: avg(vals),
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

function generatePanoramaGeneralSection(
  configs: LLMConfig[],
  allResults: Record<string, EvaluationResult[]>,
  panoramaImages: TexImageAsset[]
): string {
  let tex = `\\section{Panorama General}\n\n`;
  const evaluatorStats = buildEvaluatorStats(configs, allResults);

  const totalQ = configs.length > 0 ? (allResults[configs[0].id] || []).length : 0;
  tex += `Se evaluaron \\textbf{${totalQ} preguntas} utilizando \\textbf{${configs.length} evaluador${configs.length !== 1 ? "es" : ""}} LLM.\n\n`;

  if (panoramaImages.length > 0) {
    tex += `\\subsection{Visuales del Panorama General}\n\n`;
    tex += `Las gráficas del panorama general se integran como capturas para mantener fidelidad visual.\n\n`;
    for (const image of panoramaImages) {
      tex += `\\begin{figure}[htbp]\n`;
      tex += `\\centering\n`;
      tex += `\\includegraphics[width=\\textwidth]{${escapeTex(image.filename)}}\n`;
      tex += `\\caption{${escapeTex(image.caption)}}\n`;
      tex += `\\end{figure}\n\n`;
    }
  }

  tex += `\\subsection{Comparación de evaluadores}\n\n`;
  tex += `\\renewcommand{\\arraystretch}{1.3}\n`;
  tex += `{\\scriptsize\n`;
  tex += `\\begin{tabularx}{\\textwidth}{l l *{${DIMS.length}}{>{\\centering\\arraybackslash}X} >{\\centering\\arraybackslash}X}\n`;
  tex += `\\toprule\n`;
  tex += `\\textcolor{profublue}{\\textbf{Evaluador}} & \\textcolor{profublue}{\\textbf{Métrica}}`;
  for (const d of DIMS) {
    tex += ` & \\textcolor{profublue}{\\textbf{${d.label}}}`;
  }
  tex += ` & \\textcolor{profublue}{\\textbf{\\% Aprob.}} \\\\\n`;
  tex += `\\midrule\n`;

  for (const ev of evaluatorStats) {
    const label = escapeTex(ev.label);
    const metrics = [
      { name: "Promedio", fn: (f: ScoreField) => ev.dims[f].avg },
      { name: "Mediana", fn: (f: ScoreField) => ev.dims[f].median },
      { name: "Mín", fn: (f: ScoreField) => ev.dims[f].min },
      { name: "Máx", fn: (f: ScoreField) => ev.dims[f].max },
      { name: "Desv.\\,Est.", fn: (f: ScoreField) => ev.dims[f].stdDev },
    ];

    for (let mi = 0; mi < metrics.length; mi++) {
      const m = metrics[mi];
      if (mi === 0) {
        tex += `\\multirow{${metrics.length}}{*}{\\textbf{${label}}}`;
      }
      tex += ` & ${m.name}`;
      for (const d of DIMS) {
        const v = m.fn(d.field);
        const cmd = m.name === "Desv.\\,Est." ? "" : scoreColorCmd(v);
        tex += cmd ? ` & ${cmd}{${v}}` : ` & ${v}`;
      }
      if (mi === 0) {
        const pr = ev.dims.overallScore.passRate;
        const prCmd = pr >= 70 ? "\\textcolor{profgreen}" : pr >= 40 ? "\\textcolor{profyellow}" : "\\textcolor{profred}";
        tex += ` & ${prCmd}{${pr}\\%}`;
      } else {
        tex += ` &`;
      }
      tex += ` \\\\\n`;
    }
    tex += `\\midrule\n`;
  }
  tex += `\\bottomrule\n`;
  tex += `\\end{tabularx}\n`;
  tex += `}\n\n`;

  tex += `\\subsection{Distribución de puntaje general}\n\n`;
  tex += `\\renewcommand{\\arraystretch}{1.2}\n`;
  tex += `{\\footnotesize\n`;
  tex += `\\begin{tabularx}{\\textwidth}{l c c c c}\n`;
  tex += `\\toprule\n`;
  tex += `\\textcolor{profublue}{\\textbf{Evaluador}} & \\textcolor{profred}{\\textbf{Bajo (<40)}} & \\textcolor{profyellow}{\\textbf{Medio (40--69)}} & \\textcolor{profgreen}{\\textbf{Alto (\\geq 70)}} & \\textcolor{profublue}{\\textbf{Total}} \\\\\n`;
  tex += `\\midrule\n`;
  for (const ev of evaluatorStats) {
    tex += `${escapeTex(ev.label)} & \\textcolor{profred}{${ev.bajo}} & \\textcolor{profyellow}{${ev.medio}} & \\textcolor{profgreen}{${ev.alto}} & ${ev.count} \\\\\n`;
  }
  tex += `\\bottomrule\n`;
  tex += `\\end{tabularx}\n`;
  tex += `}\n\n`;

  return tex;
}

function formatInlineMetaToTex(line: string): string {
  const escaped = escapeTex(line);
  return escaped.replace(/\*\*([^*]+)\*\*/g, "\\\\textbf{$1}");
}

function renderMetaAnalysisText(metaAnalysis: string): string {
  const lines = metaAnalysis.split(/\r?\n/);
  let tex = "";
  let listOpen = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      if (listOpen) {
        tex += `\\end{itemize}\n`;
        listOpen = false;
      }
      tex += `\\vspace{0.2em}\n`;
      continue;
    }
    if (line.startsWith("## ")) {
      if (listOpen) {
        tex += `\\end{itemize}\n`;
        listOpen = false;
      }
      tex += `\\noindent{\\large\\textcolor{profublue}{\\textbf{${formatInlineMetaToTex(line.replace(/^##\s*/, ""))}}}}\\\\[0.3em]\n`;
      continue;
    }
    if (line.startsWith("# ")) {
      if (listOpen) {
        tex += `\\end{itemize}\n`;
        listOpen = false;
      }
      tex += `\\noindent{\\Large\\textcolor{profublue}{\\textbf{${formatInlineMetaToTex(line.replace(/^#\s*/, ""))}}}}\\\\[0.4em]\n`;
      continue;
    }
    if (line.startsWith("- ") || line.startsWith("• ")) {
      if (!listOpen) {
        tex += `\\begin{itemize}\n`;
        listOpen = true;
      }
      tex += `\\item \\textcolor{black!80}{${formatInlineMetaToTex(line.replace(/^[-•]\s*/, ""))}}\n`;
      continue;
    }
    if (listOpen) {
      tex += `\\end{itemize}\n`;
      listOpen = false;
    }
    tex += `\\noindent\\textcolor{black!80}{${formatInlineMetaToTex(line)}}\\\\\n`;
  }
  if (listOpen) {
    tex += `\\end{itemize}\n`;
  }
  return tex;
}

function generateMetaEvaluationSection(
  consistency: QuestionConsistency[] | null,
  metaAnalysis: string | null
): string {
  if ((!consistency || consistency.length === 0) && !metaAnalysis?.trim()) {
    return "";
  }
  let tex = `\\section{Análisis Meta-evaluador}\n\n`;

  if (metaAnalysis?.trim()) {
    tex += `\\subsection{Análisis integral}\n\n`;
    tex += renderMetaAnalysisText(metaAnalysis);
    tex += `\n`;
  }

  if (consistency && consistency.length > 0) {
    tex += `\\subsection{Consistencia entre evaluadores}\n\n`;
    tex += `Para cada pregunta se calculó la desviación estándar de las calificaciones otorgadas por los distintos evaluadores en cada dimensión. Valores bajos indican mayor acuerdo entre evaluadores.\n\n`;

    tex += `\\textbf{Promedios de desviación estándar:} `;
    tex += STD_DEV_DIMS.map((d) => {
      const v = avg(consistency.map((c) => c[d.field] as number));
      return `${d.label}~=~${stdDevColorCmd(v)}{${v}}`;
    }).join(", ");
    tex += `\n\n`;

    tex += `\\renewcommand{\\arraystretch}{1.2}\n`;
    tex += `{\\scriptsize\n`;
    tex += `\\begin{longtable}{r p{5cm} ${"c ".repeat(STD_DEV_DIMS.length).trim()}}\n`;
    tex += `\\toprule\n`;
    tex += `\\textcolor{profublue}{\\textbf{\\#}} & \\textcolor{profublue}{\\textbf{Pregunta}}`;
    for (const d of STD_DEV_DIMS) {
      tex += ` & \\textcolor{profublue}{\\textbf{$\\sigma$ ${d.label.slice(0, 4)}}}`;
    }
    tex += ` \\\\\n`;
    tex += `\\midrule\n`;
    tex += `\\endfirsthead\n`;
    tex += `\\toprule\n`;
    tex += `\\textcolor{profublue}{\\textbf{\\#}} & \\textcolor{profublue}{\\textbf{Pregunta}}`;
    for (const d of STD_DEV_DIMS) {
      tex += ` & \\textcolor{profublue}{\\textbf{$\\sigma$ ${d.label.slice(0, 4)}}}`;
    }
    tex += ` \\\\\n`;
    tex += `\\midrule\n`;
    tex += `\\endhead\n`;

    for (const c of consistency) {
      const q = escapeTex(c.question.length > 50 ? c.question.slice(0, 50) + "..." : c.question);
      tex += `${c.questionIndex + 1} & ${q}`;
      for (const d of STD_DEV_DIMS) {
        const v = c[d.field] as number;
        tex += ` & ${stdDevColorCmd(v)}{${v}}`;
      }
      tex += ` \\\\\n`;
    }
    tex += `\\bottomrule\n`;
    tex += `\\end{longtable}\n`;
    tex += `}\n\n`;
  }

  return tex;
}

function generateEvaluatorSection(
  config: LLMConfig,
  rows: EvaluationRow[],
  results: EvaluationResult[]
): string {
  const label = escapeTex(llmLabel(config));
  let tex = `\\section{Evaluador: ${label}}\n\n`;

  tex += `\\subsection{Resumen de puntajes}\n\n`;
  tex += `\\renewcommand{\\arraystretch}{1.3}\n`;
  tex += `\\begin{center}\n`;
  tex += `{\\scriptsize\n`;
  tex += `\\begin{tabular}{l ${"c ".repeat(DIMS.length).trim()}}\n`;
  tex += `\\toprule\n`;
  tex += ``;
  for (const d of DIMS) {
    tex += `& \\textcolor{profublue}{\\textbf{${d.label}}} `;
  }
  tex += `\\\\\n`;
  tex += `\\midrule\n`;

  const metricsRows = [
    { name: "Promedio", fn: (f: ScoreField) => avg(extract(results, f)) },
    { name: "Mediana", fn: (f: ScoreField) => median(extract(results, f)) },
    { name: "Mín", fn: (f: ScoreField) => minVal(extract(results, f)) },
    { name: "Máx", fn: (f: ScoreField) => maxVal(extract(results, f)) },
    { name: "Desv. Est.", fn: (f: ScoreField) => stdDev(extract(results, f)) },
  ];
  for (const m of metricsRows) {
    tex += `\\textbf{${m.name}}`;
    for (const d of DIMS) {
      const v = m.fn(d.field);
      const cmd = m.name === "Desv. Est." ? "" : scoreColorCmd(v);
      tex += cmd ? ` & ${cmd}{${v}}` : ` & ${v}`;
    }
    tex += ` \\\\\n`;
  }
  tex += `\\bottomrule\n`;
  tex += `\\end{tabular}\n`;
  tex += `}\n`;
  tex += `\\end{center}\n\n`;

  tex += `\\subsection{Evaluaciones individuales}\n\n`;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const result = results.find((r) => r.index === i);
    const acc = result?.accuracy ?? 0;
    const comp = result?.completeness ?? 0;
    const rel = result?.relevance ?? 0;
    const coh = result?.coherence ?? 0;
    const clar = result?.clarity ?? 0;
    const useful = result?.usefulness ?? 0;
    const overall = result?.overallScore ?? 0;
    const feedback = result?.feedback ?? "";

    tex += `\\noindent\n`;
    tex += `\\begin{minipage}{\\textwidth}\n`;
    tex += `\\textcolor{profublue}{\\textbf{Pregunta (${i + 1}):}}\\\\[4pt]\n`;
    tex += `\\fcolorbox{profublue!30}{profublue!3}{%\n`;
    tex += `  \\begin{minipage}{0.95\\textwidth}\n`;
    tex += `  \\smallskip\n`;
    tex += `  ${escapeTex(row.question)}\n`;
    tex += `  \\smallskip\n`;
    tex += `  \\end{minipage}}\n`;
    tex += `\\end{minipage}\n\n`;

    tex += `\\vspace{0.4em}\n`;
    tex += `\\noindent\n`;
    tex += `\\begin{minipage}{\\textwidth}\n`;
    tex += `\\textcolor{profugold!80!black}{\\textbf{Respuesta del Agente (${i + 1}):}}\\\\[4pt]\n`;
    tex += `\\fcolorbox{profugold!40}{profugold!5}{%\n`;
    tex += `  \\begin{minipage}{0.95\\textwidth}\n`;
    tex += `  \\smallskip\n`;
    const truncatedResp = row.actualResponse.length > 800
      ? row.actualResponse.slice(0, 800) + "..."
      : row.actualResponse;
    tex += `  ${escapeTex(truncatedResp)}\n`;
    tex += `  \\smallskip\n`;
    tex += `  \\end{minipage}}\n`;
    tex += `\\end{minipage}\n\n`;

    tex += `\\vspace{0.35em}\n`;
    tex += `\\noindent\n`;
    tex += `\\begin{minipage}{0.95\\textwidth}\n`;
    tex += `\\setlength{\\parskip}{0.25em}\n`;
    tex += `\\noindent{\\footnotesize\\itshape \\textcolor{profublue}{\\textbf{Respuesta esperada:}} ${escapeTex(row.expectedResponse)}}\n\n`;

    tex += `\\noindent{\\footnotesize\\itshape \\textcolor{profublue}{\\textbf{Puntajes:}} `;
    tex += `Prec: ${scoreColorCmd(acc)}{\\textbf{${acc}}} \\quad `;
    tex += `Comp: ${scoreColorCmd(comp)}{\\textbf{${comp}}} \\quad `;
    tex += `Rel: ${scoreColorCmd(rel)}{\\textbf{${rel}}} \\quad `;
    tex += `Coh: ${scoreColorCmd(coh)}{\\textbf{${coh}}} \\quad `;
    tex += `Clar: ${scoreColorCmd(clar)}{\\textbf{${clar}}} \\quad `;
    tex += `Util: ${scoreColorCmd(useful)}{\\textbf{${useful}}} \\quad `;
    tex += `Gral: ${scoreColorCmd(overall)}{\\textbf{${overall}}}}\n\n`;

    if (feedback) {
      tex += `\\noindent{\\footnotesize\\itshape \\textcolor{profublue}{\\textbf{Retroalimentación:}} ${escapeTex(feedback)}}\n\n`;
    }

    tex += `\\end{minipage}\n\n`;

    if (i < rows.length - 1) {
      tex += `\\vspace{2.5em}\n`;
    }
  }

  return tex;
}

export interface TexReportParams {
  reportContext: AgentReportContext;
  configs: LLMConfig[];
  rows: EvaluationRow[];
  allResults: Record<string, EvaluationResult[]>;
  consistency: QuestionConsistency[] | null;
  metaAnalysis?: string | null;
  panoramaImages?: TexImageAsset[];
}

export function generateFullTexReport(params: TexReportParams): string {
  const {
    reportContext,
    configs,
    rows,
    allResults,
    consistency,
    metaAnalysis = null,
    panoramaImages = [],
  } = params;
  const evaluationDate = new Date();
  const headerText = `Evaluación del agente: ${reportContext.agentName} | ${reportContext.evaluatorName}`;

  let tex = generatePreamble(headerText);
  tex += `\n\\begin{document}\n`;
  tex += generateCoverPage(reportContext, evaluationDate);

  tex += `\\newpage\n`;
  tex += `\\tableofcontents\n`;
  tex += `\\newpage\n\n`;

  tex += generateAgentConfigurationSection(reportContext);
  tex += `\\newpage\n`;

  tex += generatePanoramaGeneralSection(configs, allResults, panoramaImages);
  tex += `\\newpage\n`;

  const metaSection = generateMetaEvaluationSection(consistency, metaAnalysis);
  if (metaSection.trim()) {
    tex += metaSection;
    tex += `\\newpage\n`;
  }

  for (const config of configs) {
    const results = allResults[config.id] || [];
    tex += generateEvaluatorSection(config, rows, results);
    tex += `\\newpage\n`;
  }

  tex += `\\vspace{2em}\n`;
  tex += `{\\color{profugold}\\rule{\\textwidth}{1.5pt}}\n\n`;
  tex += `\\begin{center}\n`;
  tex += `\\textit{Fin del reporte de evaluación.}\n`;
  tex += `\\end{center}\n\n`;
  tex += `\\end{document}\n`;

  return tex;
}

export function downloadTexFile(params: TexReportParams) {
  const content = generateFullTexReport(params);
  const zip = new JSZip();
  const baseName = `evaluacion_agente_${formatDateES(new Date()).replace(/ /g, "_")}`;
  zip.file(`${baseName}.tex`, content);

  const images = params.panoramaImages || [];
  if (images.length > 0) {
    const assets = zip.folder("assets");
    if (assets) {
      for (const image of images) {
        const base64 = image.dataUrl.includes(",")
          ? image.dataUrl.split(",")[1]
          : image.dataUrl;
        assets.file(image.filename, base64, { base64: true });
      }
    }
  }

  zip.generateAsync({ type: "blob" }).then((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${baseName}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}
