"use client";

import { EvaluationResult, LLMConfig } from "@/lib/types";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
} from "recharts";

interface AgentComparisonPanelProps {
  configs: LLMConfig[];
  allResults: Record<string, EvaluationResult[]>;
}

const PALETTE = [
  "#4f46e5", "#0891b2", "#059669", "#d97706", "#dc2626",
  "#7c3aed", "#db2777", "#0d9488", "#ca8a04", "#6366f1",
];

type ScoreField = "accuracy" | "completeness" | "relevance" | "coherence" | "clarity" | "usefulness" | "overallScore";

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

function scoreClass(value: number): string {
  if (value >= 70) return "text-green-700 bg-green-50";
  if (value >= 40) return "text-yellow-700 bg-yellow-50";
  return "text-red-700 bg-red-50";
}

function pctClass(value: number): string {
  if (value >= 70) return "text-green-700";
  if (value >= 40) return "text-yellow-700";
  return "text-red-700";
}

const DIMENSIONS: { label: string; field: ScoreField }[] = [
  { label: "Precisión", field: "accuracy" },
  { label: "Completitud", field: "completeness" },
  { label: "Relevancia", field: "relevance" },
  { label: "Coherencia", field: "coherence" },
  { label: "Claridad", field: "clarity" },
  { label: "Utilidad", field: "usefulness" },
  { label: "General", field: "overallScore" },
];

export default function AgentComparisonPanel({
  configs,
  allResults,
}: AgentComparisonPanelProps) {
  const totalQuestions = configs.length > 0
    ? (allResults[configs[0].id] || []).length
    : 0;

  const evaluatorStats = configs.map((config, i) => {
    const results = allResults[config.id] || [];
    const overalls = extract(results, "overallScore");
    return {
      config,
      label: llmLabel(config),
      color: PALETTE[i % PALETTE.length],
      avg: avg(overalls),
      dims: Object.fromEntries(
        DIMENSIONS.map((d) => {
          const vals = extract(results, d.field);
          return [d.field, { avg: avg(vals), median: median(vals), min: minVal(vals), max: maxVal(vals), stdDev: stdDev(vals), passRate: passRate(vals) }];
        })
      ) as Record<ScoreField, { avg: number; median: number; min: number; max: number; stdDev: number; passRate: number }>,
      count: results.length,
      bajo: overalls.filter((v) => v < 40).length,
      medio: overalls.filter((v) => v >= 40 && v < 70).length,
      alto: overalls.filter((v) => v >= 70).length,
    };
  });

  const globalAvg = evaluatorStats.length > 0
    ? Math.round((evaluatorStats.reduce((s, e) => s + e.avg, 0) / evaluatorStats.length) * 10) / 10
    : 0;
  const bestEval = evaluatorStats.length > 0
    ? evaluatorStats.reduce((best, e) => (e.avg > best.avg ? e : best))
    : null;
  const worstEval = evaluatorStats.length > 0
    ? evaluatorStats.reduce((worst, e) => (e.avg < worst.avg ? e : worst))
    : null;

  const chartData = DIMENSIONS.map((dim) => {
    const point: Record<string, string | number> = { dimension: dim.label };
    configs.forEach((config) => {
      const results = allResults[config.id] || [];
      point[llmLabel(config)] = avg(extract(results, dim.field));
    });
    return point;
  });

  const radarData = DIMENSIONS.filter((d) => d.field !== "overallScore").map((dim) => {
    const point: Record<string, string | number> = { dimension: dim.label, fullMark: 100 };
    configs.forEach((config) => {
      const results = allResults[config.id] || [];
      point[llmLabel(config)] = avg(extract(results, dim.field));
    });
    return point;
  });

  return (
    <div className="space-y-6">
      {/* KPI summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="border border-gray-200 rounded-lg bg-white p-4 text-center">
          <p className="text-[10px] uppercase tracking-wide text-gray-500">Preguntas evaluadas</p>
          <p className="text-2xl font-bold mt-1 text-gray-900">{totalQuestions}</p>
        </div>
        <div className="border border-gray-200 rounded-lg bg-white p-4 text-center">
          <p className="text-[10px] uppercase tracking-wide text-gray-500">Promedio global</p>
          <p className={`text-2xl font-bold mt-1 px-2 py-0.5 rounded inline-block ${scoreClass(globalAvg)}`}>{globalAvg}</p>
        </div>
        <div className="border border-gray-200 rounded-lg bg-white p-4 text-center">
          <p className="text-[10px] uppercase tracking-wide text-gray-500">Mejor evaluador</p>
          {bestEval && (
            <>
              <p className="text-lg font-bold mt-1 text-green-700">{bestEval.avg}</p>
              <p className="text-[10px] text-gray-500 truncate" title={bestEval.label}>{bestEval.label}</p>
            </>
          )}
        </div>
        <div className="border border-gray-200 rounded-lg bg-white p-4 text-center">
          <p className="text-[10px] uppercase tracking-wide text-gray-500">Evaluador más bajo</p>
          {worstEval && (
            <>
              <p className="text-lg font-bold mt-1 text-red-700">{worstEval.avg}</p>
              <p className="text-[10px] text-gray-500 truncate" title={worstEval.label}>{worstEval.label}</p>
            </>
          )}
        </div>
      </div>

      {/* Charts row: bar + radar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="border border-gray-200 rounded-lg bg-white p-6">
          <h4 className="text-sm font-medium text-gray-700 mb-4">
            Comparación de evaluadores — Promedios por dimensión
          </h4>
          <ResponsiveContainer width="100%" height={360}>
            <BarChart data={chartData} margin={{ bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="dimension" tick={{ fontSize: 12 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value) => `${value}`} contentStyle={{ fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {configs.map((config, i) => (
                <Bar
                  key={config.id}
                  dataKey={llmLabel(config)}
                  fill={PALETTE[i % PALETTE.length]}
                  radius={[4, 4, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="border border-gray-200 rounded-lg bg-white p-6">
          <h4 className="text-sm font-medium text-gray-700 mb-4">
            Perfil comparativo — Radar
          </h4>
          <ResponsiveContainer width="100%" height={360}>
            <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
              <PolarGrid stroke="#e5e7eb" />
              <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 12 }} />
              <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10 }} />
              {configs.map((config, i) => (
                <Radar
                  key={config.id}
                  name={llmLabel(config)}
                  dataKey={llmLabel(config)}
                  stroke={PALETTE[i % PALETTE.length]}
                  fill={PALETTE[i % PALETTE.length]}
                  fillOpacity={0.12}
                />
              ))}
              <Tooltip contentStyle={{ fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Extended summary table */}
      <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
        <h4 className="text-sm font-medium text-gray-700 px-4 pt-4 pb-2">
          Estadísticas detalladas por evaluador
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600" rowSpan={2}>Evaluador</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600" rowSpan={2}>Métrica</th>
                {DIMENSIONS.map((d) => (
                  <th key={d.field} className="px-3 py-2 text-center text-xs font-semibold text-gray-600">{d.label}</th>
                ))}
                <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600">% Aprobación</th>
              </tr>
            </thead>
            <tbody>
              {evaluatorStats.map((ev) => {
                const metrics = [
                  { key: "Promedio", fn: (d: ScoreField) => ev.dims[d].avg },
                  { key: "Mediana", fn: (d: ScoreField) => ev.dims[d].median },
                  { key: "Mín", fn: (d: ScoreField) => ev.dims[d].min },
                  { key: "Máx", fn: (d: ScoreField) => ev.dims[d].max },
                  { key: "Desv. Est.", fn: (d: ScoreField) => ev.dims[d].stdDev },
                ];
                return metrics.map((m, mi) => (
                  <tr
                    key={`${ev.label}-${m.key}`}
                    className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${mi === 0 ? "border-t border-gray-200" : ""}`}
                  >
                    {mi === 0 && (
                      <td className="px-3 py-2 text-gray-700 font-medium align-top" rowSpan={metrics.length}>
                        <span className="flex items-center gap-2">
                          <span className="inline-block w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: ev.color }} />
                          {ev.label}
                        </span>
                      </td>
                    )}
                    <td className="px-3 py-2 text-gray-500 text-xs">{m.key}</td>
                    {DIMENSIONS.map((d) => (
                      <td key={d.field} className="px-3 py-2 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${m.key === "Desv. Est." ? "text-gray-700 bg-gray-50" : scoreClass(m.fn(d.field))}`}>
                          {m.fn(d.field)}
                        </span>
                      </td>
                    ))}
                    {mi === 0 && (
                      <td className="px-3 py-2 text-center align-top" rowSpan={metrics.length}>
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${pctClass(ev.dims.overallScore.passRate)}`}>
                          {ev.dims.overallScore.passRate}%
                        </span>
                      </td>
                    )}
                  </tr>
                ));
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Score distribution table */}
      <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
        <h4 className="text-sm font-medium text-gray-700 px-4 pt-4 pb-2">
          Distribución de puntaje general
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Evaluador</th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-red-600">Bajo (&lt;40)</th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-yellow-600">Medio (40-69)</th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-green-600">Alto (≥70)</th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Total</th>
              </tr>
            </thead>
            <tbody>
              {evaluatorStats.map((ev) => (
                <tr key={ev.label} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-2 text-gray-700 flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: ev.color }} />
                    {ev.label}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold text-red-700 bg-red-50">{ev.bajo}</span>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold text-yellow-700 bg-yellow-50">{ev.medio}</span>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold text-green-700 bg-green-50">{ev.alto}</span>
                  </td>
                  <td className="px-4 py-2 text-center text-gray-600 font-medium">{ev.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
