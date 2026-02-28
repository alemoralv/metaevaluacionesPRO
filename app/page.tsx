"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import LoginGate from "@/components/LoginGate";
import CsvUploader from "@/components/CsvUploader";
import LLMConfigurator from "@/components/LLMConfigurator";
import ProgressBar from "@/components/ProgressBar";
import ResultsTable from "@/components/ResultsTable";
import ScoreCharts, { ScoreChartsHandle } from "@/components/ScoreCharts";
import MetaEvaluationPanel from "@/components/MetaEvaluationPanel";
import AgentComparisonPanel from "@/components/AgentComparisonPanel";
import {
  EvaluationRow,
  EvaluationResult,
  LLMConfig,
  QuestionConsistency,
} from "@/lib/types";
import {
  generateSingleEvaluatorPdf,
  generateAllEvaluatorsPdf,
} from "@/lib/pdfGenerator";
import { computeConsistency } from "@/lib/consistency";
import { downloadTexFile } from "@/lib/texGenerator";

type AppState = "login" | "upload" | "configure" | "evaluating" | "results";

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

function llmLabel(config: LLMConfig): string {
  return `${config.model} (T=${config.temperature})`;
}

function avg(vals: number[]): number {
  if (vals.length === 0) return 0;
  return Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10;
}

function buildPanoramaSummary(
  configs: LLMConfig[],
  allResults: Record<string, EvaluationResult[]>,
  consistency: QuestionConsistency[] | null
): string {
  const totalQ = configs.length > 0 ? (allResults[configs[0].id] || []).length : 0;

  const evaluatorSummaries = configs.map((config) => {
    const results = allResults[config.id] || [];
    const label = llmLabel(config);
    const dimStats = DIMS.map((d) => {
      const vals = results.map((r) => r[d.field]);
      return `${d.label}: promedio=${avg(vals)}`;
    }).join(", ");

    const overalls = results.map((r) => r.overallScore);
    const bajo = overalls.filter((v) => v < 40).length;
    const medio = overalls.filter((v) => v >= 40 && v < 70).length;
    const alto = overalls.filter((v) => v >= 70).length;
    const passRate = overalls.length > 0
      ? Math.round((overalls.filter((v) => v >= 70).length / overalls.length) * 1000) / 10
      : 0;

    return `Evaluador: ${label}\n  ${dimStats}\n  Distribución: Bajo(<40)=${bajo}, Medio(40-69)=${medio}, Alto(>=70)=${alto}\n  % Aprobación (>=70): ${passRate}%`;
  });

  const globalAvgs = DIMS.map((d) => {
    const allVals = configs.flatMap((c) => (allResults[c.id] || []).map((r) => r[d.field]));
    return `${d.label}: ${avg(allVals)}`;
  }).join(", ");

  let summary = `=== PANORAMA GENERAL ===\n`;
  summary += `Preguntas evaluadas: ${totalQ}\n`;
  summary += `Número de evaluadores: ${configs.length}\n`;
  summary += `Promedios globales: ${globalAvgs}\n\n`;
  summary += `=== ESTADÍSTICAS POR EVALUADOR ===\n`;
  summary += evaluatorSummaries.join("\n\n");

  if (consistency && consistency.length > 0) {
    const avgStdDevs = [
      { label: "Precisión", vals: consistency.map((c) => c.accuracyStdDev) },
      { label: "Completitud", vals: consistency.map((c) => c.completenessStdDev) },
      { label: "Relevancia", vals: consistency.map((c) => c.relevanceStdDev) },
      { label: "Coherencia", vals: consistency.map((c) => c.coherenceStdDev) },
      { label: "Claridad", vals: consistency.map((c) => c.clarityStdDev) },
      { label: "Utilidad", vals: consistency.map((c) => c.usefulnessStdDev) },
      { label: "General", vals: consistency.map((c) => c.overallStdDev) },
    ].map((d) => `${d.label}: σ=${avg(d.vals)}`).join(", ");

    summary += `\n\n=== CONSISTENCIA ENTRE EVALUADORES ===\n`;
    summary += `Desviaciones estándar promedio: ${avgStdDevs}\n`;

    const highDisagreement = consistency.filter((c) => c.overallStdDev > 20);
    if (highDisagreement.length > 0) {
      summary += `Preguntas con alta discrepancia (σ > 20): ${highDisagreement.length} de ${consistency.length}\n`;
      highDisagreement.slice(0, 5).forEach((c) => {
        summary += `  - Pregunta ${c.questionIndex + 1}: "${c.question.slice(0, 60)}..." σ General=${c.overallStdDev}\n`;
      });
    }
  }

  return summary;
}

export default function Home() {
  const [state, setState] = useState<AppState>("login");
  const [accessKey, setAccessKey] = useState("");
  const [rows, setRows] = useState<EvaluationRow[]>([]);

  const [llmConfigs, setLlmConfigs] = useState<LLMConfig[]>([]);
  const [metaEnabled, setMetaEnabled] = useState(false);

  const [allResults, setAllResults] = useState<
    Record<string, EvaluationResult[]>
  >({});
  const [allProgress, setAllProgress] = useState<
    Record<string, { current: number; total: number }>
  >({});
  const [completedLlms, setCompletedLlms] = useState<Set<string>>(new Set());

  const [activeTab, setActiveTab] = useState<string>("");
  const [consistency, setConsistency] = useState<QuestionConsistency[] | null>(
    null
  );
  const [metaAnalysis, setMetaAnalysis] = useState<string | null>(null);
  const [metaAnalyzing, setMetaAnalyzing] = useState(false);

  const [error, setError] = useState("");
  const [evaluationDate, setEvaluationDate] = useState<Date>(new Date());
  const [pdfGenerating, setPdfGenerating] = useState(false);

  const chartRefsMap = useRef<Record<string, ScoreChartsHandle | null>>({});
  const allResultsRef = useRef(allResults);
  allResultsRef.current = allResults;
  const completedLlmsRef = useRef(completedLlms);
  completedLlmsRef.current = completedLlms;

  useEffect(() => {
    const saved = sessionStorage.getItem("accessKey");
    if (saved) {
      setAccessKey(saved);
      setState("upload");
    }
  }, []);

  const handleLogin = (key: string) => {
    setAccessKey(key);
    setState("upload");
  };

  const handleUpload = (parsedRows: EvaluationRow[]) => {
    setRows(parsedRows);
    setAllResults({});
    setAllProgress({});
    setCompletedLlms(new Set());
    setConsistency(null);
    setMetaAnalysis(null);
    setError("");
    setState("configure");
  };

  const streamEvaluation = useCallback(
    async (config: LLMConfig, evalRows: EvaluationRow[]) => {
      try {
        const response = await fetch("/api/evaluate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-access-key": accessKey,
          },
          body: JSON.stringify({
            rows: evalRows,
            llmConfig: {
              model: config.model,
              temperature: config.temperature,
              topP: config.topP,
              maxTokens: config.maxTokens,
            },
          }),
        });

        if (response.status === 401) {
          sessionStorage.removeItem("accessKey");
          setAccessKey("");
          setState("login");
          return;
        }

        if (!response.ok) {
          const errData = await response.json();
          setError(
            (prev) =>
              `${prev ? prev + "\n" : ""}${llmLabel(config)}: ${errData.error || "Error"}`
          );
          return;
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        const collected: EvaluationResult[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.trim()) {
              try {
                const result: EvaluationResult = JSON.parse(line);
                collected.push(result);
                setAllResults((prev) => ({
                  ...prev,
                  [config.id]: [...collected],
                }));
                setAllProgress((prev) => ({
                  ...prev,
                  [config.id]: { current: collected.length, total: evalRows.length },
                }));
              } catch {
                // skip malformed
              }
            }
          }
        }

        if (buffer.trim()) {
          try {
            const result: EvaluationResult = JSON.parse(buffer);
            collected.push(result);
            setAllResults((prev) => ({
              ...prev,
              [config.id]: [...collected],
            }));
          } catch {
            // skip
          }
        }

        return collected;
      } catch (err) {
        setError(
          (prev) =>
            `${prev ? prev + "\n" : ""}${llmLabel(config)}: ${err instanceof Error ? err.message : "Error"}`
        );
        return undefined;
      }
    },
    [accessKey]
  );

  const handleStartEvaluation = async (
    configs: LLMConfig[],
    meta: boolean
  ) => {
    setLlmConfigs(configs);
    setMetaEnabled(meta);
    setAllResults({});
    setAllProgress({});
    setCompletedLlms(new Set());
    setConsistency(null);
    setMetaAnalysis(null);
    setMetaAnalyzing(false);
    setError("");
    setState("evaluating");
    setActiveTab("overview");

    const initProgress: Record<string, { current: number; total: number }> = {};
    configs.forEach((c) => {
      initProgress[c.id] = { current: 0, total: rows.length };
    });
    setAllProgress(initProgress);

    const promises = configs.map(async (config) => {
      const collected = await streamEvaluation(config, rows);
      setCompletedLlms((prev) => {
        const next = new Set(prev);
        next.add(config.id);
        return next;
      });
      return { id: config.id, results: collected };
    });

    const settled = await Promise.all(promises);

    const finalResults: Record<string, EvaluationResult[]> = {};
    settled.forEach(({ id, results }) => {
      if (results) finalResults[id] = results;
    });

    setEvaluationDate(new Date());
    setState("results");

    if (meta && Object.keys(finalResults).length > 1) {
      const consistencyData = computeConsistency(rows, finalResults);
      setConsistency(consistencyData);

      setMetaAnalyzing(true);
      try {
        const summary = buildPanoramaSummary(configs, finalResults, consistencyData);
        const response = await fetch("/api/meta-analyze", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-access-key": accessKey,
          },
          body: JSON.stringify({ summary }),
        });

        if (response.ok) {
          const data = await response.json();
          setMetaAnalysis(data.analysis);
        }
      } catch {
        // meta-analysis is optional; don't block results
      } finally {
        setMetaAnalyzing(false);
      }
    }
  };

  const handleDownloadPdf = async () => {
    if (activeTab === "meta" || activeTab === "overview" || !activeTab) return;
    const config = llmConfigs.find((c) => c.id === activeTab);
    if (!config) return;
    const results = allResults[config.id] || [];
    if (results.length === 0) return;

    setPdfGenerating(true);
    try {
      const handle = chartRefsMap.current[config.id];
      const container = handle?.getChartsContainer() ?? null;
      await generateSingleEvaluatorPdf({
        config,
        rows,
        results,
        chartsContainer: container,
        evaluationDate,
      });
    } finally {
      setPdfGenerating(false);
    }
  };

  const handleDownloadAllPdf = async () => {
    setPdfGenerating(true);
    try {
      const containers: Record<string, HTMLDivElement | null> = {};
      for (const config of llmConfigs) {
        const handle = chartRefsMap.current[config.id];
        containers[config.id] = handle?.getChartsContainer() ?? null;
      }
      await generateAllEvaluatorsPdf({
        configs: llmConfigs,
        rows,
        allResults,
        chartsContainers: containers,
        consistency,
        evaluationDate,
      });
    } finally {
      setPdfGenerating(false);
    }
  };

  const handleDownloadTex = () => {
    downloadTexFile({
      configs: llmConfigs,
      rows,
      allResults,
      consistency,
      evaluationDate,
    });
  };

  const handleReset = () => {
    setRows([]);
    setAllResults({});
    setAllProgress({});
    setCompletedLlms(new Set());
    setConsistency(null);
    setMetaAnalysis(null);
    setError("");
    setState("upload");
  };

  if (state === "login") {
    return <LoginGate onLogin={handleLogin} />;
  }

  const totalProgress = Object.values(allProgress).reduce(
    (acc, p) => ({ current: acc.current + p.current, total: acc.total + p.total }),
    { current: 0, total: 0 }
  );

  return (
    <div className="min-h-screen">
      <header className="border-b border-[#0e3d66] bg-[#165185]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold tracking-tight text-white">
            MetaEvaluaciones PRO
          </h1>
          {state !== "evaluating" && (
            <div className="flex items-center gap-3">
              {(state === "results" || state === "configure") && (
                <button
                  onClick={handleReset}
                  className="text-sm text-white/80 hover:text-white transition-colors"
                >
                  Nueva evaluación
                </button>
              )}
              <button
                onClick={() => {
                  sessionStorage.removeItem("accessKey");
                  setAccessKey("");
                  setState("login");
                }}
                className="text-sm text-white/60 hover:text-white transition-colors"
              >
                Salir
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg max-w-xl mx-auto">
            <p className="text-red-600 text-sm whitespace-pre-line">{error}</p>
          </div>
        )}

        {state === "upload" && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-medium">Sube tu archivo CSV</h2>
              <p className="text-sm text-gray-500 mt-1">
                El archivo debe contener las columnas: question,
                expectedResponse, actualResponse
              </p>
            </div>
            <CsvUploader onUpload={handleUpload} disabled={false} />
          </div>
        )}

        {state === "configure" && (
          <LLMConfigurator
            onStart={handleStartEvaluation}
            disabled={false}
          />
        )}

        {state === "evaluating" && (
          <div className="space-y-8">
            <div className="text-center">
              <h2 className="text-xl font-medium">Evaluando respuestas...</h2>
              <p className="text-sm text-gray-500 mt-1">
                {llmConfigs.length} evaluador{llmConfigs.length !== 1 ? "es" : ""}{" "}
                corriendo en paralelo
              </p>
            </div>

            <ProgressBar
              current={totalProgress.current}
              total={totalProgress.total}
            />

            <div className="space-y-2">
              {llmConfigs.map((config) => {
                const p = allProgress[config.id] || { current: 0, total: rows.length };
                const done = completedLlms.has(config.id);
                return (
                  <div
                    key={config.id}
                    className="flex items-center gap-3 text-sm"
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        done
                          ? "bg-green-500"
                          : p.current > 0
                            ? "bg-yellow-500 animate-pulse"
                            : "bg-gray-300"
                      }`}
                    />
                    <span className="text-gray-700">{llmLabel(config)}</span>
                    <span className="text-gray-400">
                      {p.current}/{p.total}
                    </span>
                  </div>
                );
              })}
            </div>

            {Object.keys(allResults).length > 0 && (
              <div>
                <div className="flex gap-1 border-b border-gray-200 mb-4">
                  {llmConfigs.map((config) => (
                    <button
                      key={config.id}
                      onClick={() => setActiveTab(config.id)}
                      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                        activeTab === config.id
                          ? "border-[#165185] text-[#165185]"
                          : "border-transparent text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      {llmLabel(config)}
                    </button>
                  ))}
                </div>

                {llmConfigs.map((config) => {
                  if (config.id !== activeTab) return null;
                  const results = allResults[config.id] || [];
                  if (results.length === 0) return null;
                  return (
                    <div key={config.id} className="space-y-6">
                      <ScoreCharts results={results} />
                      <ResultsTable
                        rows={rows}
                        results={results}
                        modelLabel={config.model}
                        temperature={config.temperature}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {state === "results" && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-medium">Evaluación completada</h2>
              <p className="text-sm text-gray-500 mt-1">
                {rows.length} respuestas evaluadas por {llmConfigs.length}{" "}
                evaluador{llmConfigs.length !== 1 ? "es" : ""}
              </p>
            </div>

            <div className="flex justify-center gap-3">
              <button
                onClick={handleDownloadPdf}
                disabled={pdfGenerating || activeTab === "meta" || activeTab === "overview"}
                className="px-4 py-2 bg-[#165185] text-white text-sm rounded-lg hover:bg-[#0e3d66] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {pdfGenerating ? (
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                )}
                Descargar PDF
              </button>
              <button
                onClick={handleDownloadAllPdf}
                disabled={pdfGenerating}
                className="px-4 py-2 bg-[#165185] text-white text-sm rounded-lg hover:bg-[#0e3d66] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {pdfGenerating ? (
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                )}
                Descargar todo en PDF
              </button>
              <button
                onClick={handleDownloadTex}
                className="px-4 py-2 bg-[#165185] text-white text-sm rounded-lg hover:bg-[#0e3d66] transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Descargar LaTeX
              </button>
            </div>

            <div>
              <div className="flex gap-1 border-b border-gray-200 mb-6 overflow-x-auto">
                <button
                  onClick={() => setActiveTab("overview")}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === "overview"
                      ? "border-[#165185] text-[#165185]"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Panorama General
                </button>
                {llmConfigs.map((config) => (
                  <button
                    key={config.id}
                    onClick={() => setActiveTab(config.id)}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                      activeTab === config.id
                        ? "border-[#165185] text-[#165185]"
                        : "border-transparent text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {llmLabel(config)}
                  </button>
                ))}
                {metaEnabled && consistency && (
                  <button
                    onClick={() => setActiveTab("meta")}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                      activeTab === "meta"
                        ? "border-[#165185] text-[#165185]"
                        : "border-transparent text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    Análisis Meta-evaluador
                  </button>
                )}
              </div>

              {activeTab === "overview" ? (
                <AgentComparisonPanel
                  configs={llmConfigs}
                  allResults={allResults}
                />
              ) : activeTab === "meta" ? (
                <div>
                  {consistency && (
                    <MetaEvaluationPanel
                      consistency={consistency}
                      metaAnalysis={metaAnalysis}
                      metaAnalyzing={metaAnalyzing}
                    />
                  )}
                </div>
              ) : (
                llmConfigs.map((config) => {
                  if (config.id !== activeTab) return null;
                  const results = allResults[config.id] || [];
                  return (
                    <div key={config.id} className="space-y-6">
                      <ScoreCharts
                        ref={(handle) => {
                          chartRefsMap.current[config.id] = handle;
                        }}
                        results={results}
                      />
                      <ResultsTable
                        rows={rows}
                        results={results}
                        modelLabel={config.model}
                        temperature={config.temperature}
                      />
                    </div>
                  );
                })
              )}
            </div>

            {/* Hidden chart renders for non-active tabs (needed for "Descargar todo en PDF") */}
            <div className="absolute left-[-9999px] top-0" aria-hidden="true">
              {llmConfigs
                .filter((c) => c.id !== activeTab)
                .map((config) => {
                  const results = allResults[config.id] || [];
                  if (results.length === 0) return null;
                  return (
                    <div key={config.id} style={{ width: 800 }}>
                      <ScoreCharts
                        ref={(handle) => {
                          chartRefsMap.current[config.id] = handle;
                        }}
                        results={results}
                      />
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
