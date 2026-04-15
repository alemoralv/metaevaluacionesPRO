import nodemailer from "nodemailer";
import fs from "node:fs";
import path from "node:path";
import type { EvaluationRegistryEntry } from "./types";

const TEMPLATE_PATH = path.join(process.cwd(), "templates", "email-resumen-diario.html");

function createTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    throw new Error(
      "GMAIL_USER y GMAIL_APP_PASSWORD deben estar configurados en .env.local"
    );
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
}

function scoreBar(score: number): string {
  const color = score >= 70 ? "#27ae60" : score >= 40 ? "#f39c12" : "#e74c3c";
  return `<span style="color:${color};font-weight:bold;">${score}</span>`;
}

function buildEvaluationHtml(entry: EvaluationRegistryEntry): string {
  const date = new Date(entry.timestamp).toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const evaluatorsRows = entry.evaluators
    .map(
      (ev) => `
      <tr>
        <td style="padding:6px 10px;font-size:12px;color:#555;border-bottom:1px solid #f0f0f0;">
          ${ev.provider === "openai" ? "OpenAI" : "Gemini"} · ${ev.model} (T=${ev.temperature})
        </td>
        <td style="padding:6px 8px;text-align:center;font-size:12px;border-bottom:1px solid #f0f0f0;">${scoreBar(ev.avgAccuracy)}</td>
        <td style="padding:6px 8px;text-align:center;font-size:12px;border-bottom:1px solid #f0f0f0;">${scoreBar(ev.avgCompleteness)}</td>
        <td style="padding:6px 8px;text-align:center;font-size:12px;border-bottom:1px solid #f0f0f0;">${scoreBar(ev.avgRelevance)}</td>
        <td style="padding:6px 8px;text-align:center;font-size:12px;border-bottom:1px solid #f0f0f0;">${scoreBar(ev.avgCoherence)}</td>
        <td style="padding:6px 8px;text-align:center;font-size:12px;border-bottom:1px solid #f0f0f0;">${scoreBar(ev.avgClarity)}</td>
        <td style="padding:6px 8px;text-align:center;font-size:12px;border-bottom:1px solid #f0f0f0;">${scoreBar(ev.avgUsefulness)}</td>
        <td style="padding:6px 8px;text-align:center;font-size:12px;font-weight:bold;border-bottom:1px solid #f0f0f0;">${scoreBar(ev.avgOverallScore)}</td>
      </tr>`
    )
    .join("");

  return `
  <div style="margin-bottom:24px;border:1px solid #dde5f0;border-radius:6px;overflow:hidden;">
    <div style="background-color:#eef4fc;padding:12px 16px;border-bottom:1px solid #dde5f0;">
      <p style="margin:0;font-size:14px;font-weight:bold;color:#004a99;">
        ${entry.reportContext.agentName}
        <span style="font-weight:normal;color:#555;font-size:12px;margin-left:8px;">${date}</span>
      </p>
      <p style="margin:4px 0 0;font-size:12px;color:#666;">
        Evaluador: <strong>${entry.reportContext.evaluatorName}</strong> &nbsp;·&nbsp;
        Dataset: <strong>${entry.datasetFileName}</strong> &nbsp;·&nbsp;
        Preguntas: <strong>${entry.questionCount}</strong> &nbsp;·&nbsp;
        Modo: <strong>${entry.evaluationMode}</strong>
      </p>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <thead>
        <tr style="background-color:#f8f9fb;">
          <th style="padding:6px 10px;text-align:left;font-size:11px;color:#888;font-weight:600;border-bottom:1px solid #dde5f0;">Evaluador LLM</th>
          <th style="padding:6px 8px;text-align:center;font-size:11px;color:#888;font-weight:600;border-bottom:1px solid #dde5f0;">Precisión</th>
          <th style="padding:6px 8px;text-align:center;font-size:11px;color:#888;font-weight:600;border-bottom:1px solid #dde5f0;">Completitud</th>
          <th style="padding:6px 8px;text-align:center;font-size:11px;color:#888;font-weight:600;border-bottom:1px solid #dde5f0;">Relevancia</th>
          <th style="padding:6px 8px;text-align:center;font-size:11px;color:#888;font-weight:600;border-bottom:1px solid #dde5f0;">Coherencia</th>
          <th style="padding:6px 8px;text-align:center;font-size:11px;color:#888;font-weight:600;border-bottom:1px solid #dde5f0;">Claridad</th>
          <th style="padding:6px 8px;text-align:center;font-size:11px;color:#888;font-weight:600;border-bottom:1px solid #dde5f0;">Utilidad</th>
          <th style="padding:6px 8px;text-align:center;font-size:11px;color:#888;font-weight:600;border-bottom:1px solid #dde5f0;">General</th>
        </tr>
      </thead>
      <tbody>
        ${evaluatorsRows}
      </tbody>
    </table>
  </div>`;
}

function buildDailyDigestHtml(entries: EvaluationRegistryEntry[]): string {
  const template = fs.readFileSync(TEMPLATE_PATH, "utf-8");

  const dateFormatted = new Date().toLocaleDateString("es-MX", {
    timeZone: "America/Mexico_City",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const generatedAt = new Date().toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const evaluationsHtml =
    entries.length > 0
      ? entries.map(buildEvaluationHtml).join("")
      : `<p style="color:#888;font-size:14px;font-style:italic;">No se realizaron evaluaciones hoy.</p>`;

  return template
    .replace("{{DATE}}", dateFormatted)
    .replace("{{EVALUATION_COUNT}}", String(entries.length))
    .replace("{{EVALUATIONS_HTML}}", evaluationsHtml)
    .replace("{{GENERATED_AT}}", generatedAt);
}

export async function sendDailyDigestEmail(
  entries: EvaluationRegistryEntry[]
): Promise<void> {
  const transporter = createTransporter();
  const recipient =
    process.env.DAILY_EMAIL_RECIPIENT ?? "victor.munguia@profuturo.com.mx";
  const from = process.env.GMAIL_USER!;

  const dateFormatted = new Date().toLocaleDateString("es-MX", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const subject = `[MetaEvaluaciones PRO] Resumen del día ${dateFormatted} — ${entries.length} evaluacion${entries.length === 1 ? "" : "es"}`;
  const html = buildDailyDigestHtml(entries);

  await transporter.sendMail({
    from: `"MetaEvaluaciones PRO" <${from}>`,
    to: recipient,
    subject,
    html,
  });

  console.log(
    `[mailer] Correo diario enviado a ${recipient} con ${entries.length} evaluaciones.`
  );
}
