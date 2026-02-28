"use client";

import { EvaluationRow, EvaluationResult, EnrichedRow } from "@/lib/types";

interface ResultsTableProps {
  rows: EvaluationRow[];
  results: EvaluationResult[];
  modelLabel?: string;
  temperature?: number;
}

function scoreColor(score: number): string {
  if (score >= 70) return "text-green-700 bg-green-50";
  if (score >= 40) return "text-yellow-700 bg-yellow-50";
  return "text-red-700 bg-red-50";
}

function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? text.slice(0, maxLen) + "..." : text;
}

export function buildEnrichedRows(
  rows: EvaluationRow[],
  results: EvaluationResult[]
): EnrichedRow[] {
  return rows.map((row, i) => {
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
}

function downloadCsv(enriched: EnrichedRow[], fileName: string) {
  const headers = [
    "question",
    "expectedResponse",
    "actualResponse",
    "accuracy",
    "completeness",
    "relevance",
    "coherence",
    "clarity",
    "usefulness",
    "overallScore",
    "feedback",
  ];

  const escapeField = (val: string | number) => {
    const str = String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csvContent = [
    headers.join(","),
    ...enriched.map((row) =>
      headers.map((h) => escapeField(row[h as keyof EnrichedRow])).join(",")
    ),
  ].join("\n");

  const BOM = "\uFEFF";
  const blob = new Blob([BOM + csvContent], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

const DIM_COLS: { label: string; shortLabel: string; field: keyof EvaluationResult }[] = [
  { label: "Precisión", shortLabel: "Prec.", field: "accuracy" },
  { label: "Completitud", shortLabel: "Comp.", field: "completeness" },
  { label: "Relevancia", shortLabel: "Rel.", field: "relevance" },
  { label: "Coherencia", shortLabel: "Coh.", field: "coherence" },
  { label: "Claridad", shortLabel: "Clar.", field: "clarity" },
  { label: "Utilidad", shortLabel: "Util.", field: "usefulness" },
];

export default function ResultsTable({
  rows,
  results,
  modelLabel,
  temperature,
}: ResultsTableProps) {
  const enriched = buildEnrichedRows(rows, results);

  const computeAvg = (field: keyof EvaluationResult) =>
    results.length > 0
      ? Math.round(
          (results.reduce((s, r) => s + (r[field] as number), 0) / results.length) * 10
        ) / 10
      : 0;

  const avgOverall = computeAvg("overallScore");

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex gap-4 flex-wrap">
          {DIM_COLS.map((dim) => {
            const val = computeAvg(dim.field);
            return (
              <div key={dim.field} className="text-center">
                <p className="text-xs text-gray-500 uppercase tracking-wide">
                  {dim.label}
                </p>
                <p className={`text-2xl font-semibold ${scoreColor(val).split(" ")[0]}`}>
                  {val}
                </p>
              </div>
            );
          })}
          <div className="text-center border-l pl-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              General
            </p>
            <p className={`text-2xl font-bold ${scoreColor(avgOverall).split(" ")[0]}`}>
              {avgOverall}
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            const safeModel = (modelLabel || "modelo").replace(/[^a-zA-Z0-9._-]/g, "");
            const safeTemp = temperature !== undefined ? String(temperature) : "default";
            const fileName = `evaluaciones_${safeModel}_${safeTemp}.csv`;
            downloadCsv(enriched, fileName);
          }}
          className="px-4 py-2 bg-[#165185] text-white text-sm rounded-lg hover:bg-[#0e3d66] transition-colors flex items-center gap-2"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          Descargar CSV
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-3 py-3 text-left font-medium text-gray-500 w-8">
                #
              </th>
              <th className="px-3 py-3 text-left font-medium text-gray-500">
                Pregunta
              </th>
              {DIM_COLS.map((dim) => (
                <th key={dim.field} className="px-2 py-3 text-center font-medium text-gray-500 w-14">
                  {dim.shortLabel}
                </th>
              ))}
              <th className="px-2 py-3 text-center font-medium text-gray-500 w-16">
                General
              </th>
              <th className="px-3 py-3 text-left font-medium text-gray-500">
                Retroalimentación
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {enriched.map((row, i) => (
              <tr key={i} className="hover:bg-gray-50 transition-colors">
                <td className="px-3 py-3 text-gray-400">{i + 1}</td>
                <td className="px-3 py-3 max-w-xs">
                  <p className="truncate" title={row.question}>
                    {truncate(row.question, 80)}
                  </p>
                </td>
                {DIM_COLS.map((dim) => (
                  <td key={dim.field} className="px-2 py-3 text-center">
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${scoreColor(row[dim.field as keyof EnrichedRow] as number)}`}
                    >
                      {row[dim.field as keyof EnrichedRow]}
                    </span>
                  </td>
                ))}
                <td className="px-2 py-3 text-center">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-sm font-semibold ${scoreColor(row.overallScore)}`}
                  >
                    {row.overallScore}
                  </span>
                </td>
                <td className="px-3 py-3 max-w-sm text-gray-600">
                  <p className="truncate" title={row.feedback}>
                    {truncate(row.feedback, 100)}
                  </p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400 mt-3 text-right">
        {results.length} de {rows.length} filas evaluadas
      </p>
    </div>
  );
}
