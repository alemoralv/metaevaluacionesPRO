"use client";

import { QuestionConsistency } from "@/lib/types";

interface MetaEvaluationPanelProps {
  consistency: QuestionConsistency[];
  metaAnalysis: string | null;
  metaAnalyzing: boolean;
}

function stdDevColor(val: number): string {
  if (val < 10) return "text-green-700 bg-green-50";
  if (val <= 20) return "text-yellow-700 bg-yellow-50";
  return "text-red-700 bg-red-50";
}

function renderAnalysis(text: string) {
  const lines = text.split("\n");
  return lines.map((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return <br key={i} />;

    if (trimmed.startsWith("## ")) {
      return (
        <h3 key={i} className="text-base font-bold text-[#165185] mt-5 mb-2">
          {trimmed.replace(/^##\s*/, "")}
        </h3>
      );
    }

    if (trimmed.startsWith("# ")) {
      return (
        <h2 key={i} className="text-lg font-bold text-[#165185] mt-6 mb-3">
          {trimmed.replace(/^#\s*/, "")}
        </h2>
      );
    }

    if (trimmed.startsWith("- ") || trimmed.startsWith("• ")) {
      const content = trimmed.replace(/^[-•]\s*/, "");
      return (
        <li key={i} className="ml-4 text-sm text-gray-700 leading-relaxed list-disc">
          {renderBold(content)}
        </li>
      );
    }

    return (
      <p key={i} className="text-sm text-gray-700 leading-relaxed mb-1">
        {renderBold(trimmed)}
      </p>
    );
  });
}

function renderBold(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-gray-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
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

export default function MetaEvaluationPanel({
  consistency,
  metaAnalysis,
  metaAnalyzing,
}: MetaEvaluationPanelProps) {
  const avgOf = (field: keyof QuestionConsistency) => {
    if (consistency.length === 0) return 0;
    const sum = consistency.reduce((s, c) => s + (c[field] as number), 0);
    return Math.round((sum / consistency.length) * 100) / 100;
  };

  return (
    <div className="space-y-6">
      {/* LLM Analysis section */}
      <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
        <div className="px-5 pt-5 pb-2">
          <h4 className="text-sm font-semibold text-[#165185] uppercase tracking-wide">
            Análisis del Meta-evaluador
          </h4>
        </div>
        <div className="px-5 pb-5">
          {metaAnalyzing ? (
            <div className="flex items-center gap-3 py-8 justify-center">
              <span className="inline-block w-5 h-5 border-2 border-[#165185] border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-gray-500">Generando análisis integral del Panorama General...</span>
            </div>
          ) : metaAnalysis ? (
            <div className="prose prose-sm max-w-none">
              {renderAnalysis(metaAnalysis)}
            </div>
          ) : (
            <p className="text-sm text-gray-400 py-4 text-center">
              No se generó análisis del meta-evaluador.
            </p>
          )}
        </div>
      </div>

      {/* Consistency KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {STD_DEV_DIMS.map((m) => {
          const value = avgOf(m.field);
          return (
            <div
              key={m.field}
              className="border border-gray-200 rounded-lg bg-white p-3 text-center"
            >
              <p className="text-[9px] uppercase tracking-wide text-gray-500">
                σ Prom. {m.label}
              </p>
              <p
                className={`text-lg font-bold mt-1 px-2 py-0.5 rounded inline-block ${stdDevColor(value)}`}
              >
                {value}
              </p>
            </div>
          );
        })}
      </div>

      {/* Consistency table */}
      <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 w-10">
                  #
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">
                  Pregunta
                </th>
                {STD_DEV_DIMS.map((d) => (
                  <th key={d.field} className="px-2 py-2 text-center text-xs font-semibold text-gray-600 whitespace-nowrap">
                    σ {d.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {consistency.map((c) => (
                <tr
                  key={c.questionIndex}
                  className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                >
                  <td className="px-3 py-2 text-gray-500 font-mono text-xs">
                    {c.questionIndex + 1}
                  </td>
                  <td
                    className="px-3 py-2 text-gray-700 max-w-xs truncate"
                    title={c.question}
                  >
                    {c.question.length > 80
                      ? c.question.slice(0, 80) + "…"
                      : c.question}
                  </td>
                  {STD_DEV_DIMS.map((d) => (
                    <td key={d.field} className="px-2 py-2 text-center">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-xs font-semibold ${stdDevColor(c[d.field] as number)}`}
                      >
                        {c[d.field] as number}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
