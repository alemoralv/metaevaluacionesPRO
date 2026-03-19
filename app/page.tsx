"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import LoginGate from "@/components/LoginGate";
import AgentContextForm from "@/components/AgentContextForm";
import CsvUploader from "@/components/CsvUploader";
import LLMConfigurator from "@/components/LLMConfigurator";
import ProgressBar from "@/components/ProgressBar";
import ResultsTable from "@/components/ResultsTable";
import ScoreCharts, { ScoreChartsHandle } from "@/components/ScoreCharts";
import MetaEvaluationPanel from "@/components/MetaEvaluationPanel";
import AgentComparisonPanel from "@/components/AgentComparisonPanel";
import html2canvas from "html2canvas";
import {
  DatasetEvaluationState,
  EvaluationDataset,
  EvaluationResult,
  LLMConfig,
  QuestionConsistency,
  AgentReportContext,
  UploadedCsvDataset,
} from "@/lib/types";
import {
  generateSingleEvaluatorPdf,
  generateAllEvaluatorsPdf,
  generateOverviewSlidesPdf,
} from "@/lib/pdfGenerator";
import { computeConsistency } from "@/lib/consistency";
import { downloadTexFile } from "@/lib/texGenerator";
import { buildInfographicPayload } from "@/lib/infographic";

type AppState =
  | "login"
  | "context"
  | "upload"
  | "configure"
  | "evaluating"
  | "results";

const REPORT_CONTEXT_STORAGE_KEY = "agentReportContext";
const SHARED_LLM_CONFIG_STORAGE_KEY = "sharedLlmConfig";
const SHARED_META_ENABLED_STORAGE_KEY = "sharedMetaEnabled";

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

function generateId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 10);
}

function createDefaultLlmConfig(): LLMConfig {
  return {
    id: generateId(),
    model: "gpt-4o-mini",
    temperature: 0.2,
    topP: 1,
  };
}

function createIdleEvaluationState(): DatasetEvaluationState {
  return {
    status: "idle",
    llmConfigs: [],
    metaEnabled: false,
    allResults: {},
    allProgress: {},
    completedLlms: [],
    activeTab: "overview",
    consistency: null,
    metaAnalysis: null,
    metaRecommendations: [],
    metaAnalyzing: false,
    error: "",
  };
}

function sanitizeBaseName(fileName: string): string {
  const withoutExt = fileName.replace(/\.[^/.]+$/, "");
  const normalized = withoutExt.replace(/[^a-zA-Z0-9._-]/g, "_");
  return normalized || "dataset";
}

function cloneConfigs(configs: LLMConfig[]): LLMConfig[] {
  return configs.map((config) => ({ ...config }));
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
  const [reportContext, setReportContext] = useState<AgentReportContext | null>(
    null
  );
  const [sharedLlmConfigs, setSharedLlmConfigs] = useState<LLMConfig[]>([
    createDefaultLlmConfig(),
  ]);
  const [sharedMetaEnabled, setSharedMetaEnabled] = useState(false);
  const [datasets, setDatasets] = useState<EvaluationDataset[]>([]);
  const [activeDatasetId, setActiveDatasetId] = useState<string>("");

  const [error, setError] = useState("");
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [infographicGenerating, setInfographicGenerating] = useState(false);

  const chartRefsMap = useRef<Record<string, ScoreChartsHandle | null>>({});
  const overviewChartsCaptureRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem("accessKey");
    const savedContext = sessionStorage.getItem(REPORT_CONTEXT_STORAGE_KEY);
    const savedLlm = sessionStorage.getItem(SHARED_LLM_CONFIG_STORAGE_KEY);
    const savedMeta = sessionStorage.getItem(SHARED_META_ENABLED_STORAGE_KEY);
    if (saved) {
      setAccessKey(saved);
      if (savedContext) {
        setReportContext(JSON.parse(savedContext) as AgentReportContext);
        setState("upload");
      } else {
        setState("context");
      }
    }
    if (savedLlm) {
      try {
        const parsed = JSON.parse(savedLlm) as LLMConfig[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSharedLlmConfigs(parsed);
        }
      } catch {
        // ignore invalid cached value
      }
    }
    if (savedMeta) {
      setSharedMetaEnabled(savedMeta === "true");
    }
  }, []);

  const handleLogin = (key: string) => {
    setAccessKey(key);
    setState("context");
  };

  const handleContextSubmit = (context: AgentReportContext) => {
    setReportContext(context);
    sessionStorage.setItem(REPORT_CONTEXT_STORAGE_KEY, JSON.stringify(context));
    setState("upload");
  };

  const handleUpload = (parsedDatasets: UploadedCsvDataset[]) => {
    const mapped: EvaluationDataset[] = parsedDatasets.map((dataset) => ({
      id: dataset.id,
      fileName: dataset.fileName,
      rows: dataset.rows,
      useSharedContext: true,
      contextOverride: null,
      useSharedLlmConfig: true,
      llmConfigsOverride: null,
      metaEnabledOverride: null,
      evaluation: createIdleEvaluationState(),
    }));
    setDatasets(mapped);
    setActiveDatasetId(mapped[0]?.id ?? "");
    setError("");
    setState("configure");
  };

  const activeDataset = datasets.find((dataset) => dataset.id === activeDatasetId) ?? null;

  const setDatasetEvaluation = useCallback(
    (
      datasetId: string,
      updater: (evaluation: DatasetEvaluationState) => DatasetEvaluationState
    ) => {
      setDatasets((prev) =>
        prev.map((dataset) =>
          dataset.id === datasetId
            ? {
                ...dataset,
                evaluation: updater(dataset.evaluation),
              }
            : dataset
        )
      );
    },
    []
  );

  const setDatasetField = useCallback(
    <K extends keyof EvaluationDataset>(
      datasetId: string,
      field: K,
      value: EvaluationDataset[K]
    ) => {
      setDatasets((prev) =>
        prev.map((dataset) =>
          dataset.id === datasetId ? { ...dataset, [field]: value } : dataset
        )
      );
    },
    []
  );

  const resolveReportContext = useCallback(
    (dataset: EvaluationDataset): AgentReportContext | null => {
      if (!dataset.useSharedContext) {
        if (dataset.contextOverride) return dataset.contextOverride;
      }
      return reportContext;
    },
    [reportContext]
  );

  const resolveConfigsForDataset = useCallback(
    (dataset: EvaluationDataset): { configs: LLMConfig[]; metaEnabled: boolean } => {
      if (!dataset.useSharedLlmConfig && dataset.llmConfigsOverride?.length) {
        return {
          configs: cloneConfigs(dataset.llmConfigsOverride),
          metaEnabled: Boolean(dataset.metaEnabledOverride),
        };
      }
      return {
        configs: cloneConfigs(sharedLlmConfigs),
        metaEnabled: sharedMetaEnabled,
      };
    },
    [sharedLlmConfigs, sharedMetaEnabled]
  );

  const streamBatch = useCallback(
    async (
      datasetId: string,
      config: LLMConfig,
      batchRows: EvaluationDataset["rows"],
      indexOffset: number,
      collected: EvaluationResult[],
      totalRows: number
    ): Promise<boolean> => {
      const response = await fetch("/api/evaluate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-access-key": accessKey,
        },
        body: JSON.stringify({
          rows: batchRows,
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
        return false;
      }

      if (!response.ok) {
        const errData = await response.json();
        setDatasetEvaluation(datasetId, (evaluation) => ({
          ...evaluation,
          error: `${evaluation.error ? `${evaluation.error}\n` : ""}${llmLabel(config)}: ${errData.error || "Error"}`,
        }));
        return false;
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

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
              result.index = result.index + indexOffset;
              collected.push(result);
              setDatasetEvaluation(datasetId, (evaluation) => ({
                ...evaluation,
                allResults: {
                  ...evaluation.allResults,
                  [config.id]: [...collected],
                },
                allProgress: {
                  ...evaluation.allProgress,
                  [config.id]: { current: collected.length, total: totalRows },
                },
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
          result.index = result.index + indexOffset;
          collected.push(result);
          setDatasetEvaluation(datasetId, (evaluation) => ({
            ...evaluation,
            allResults: {
              ...evaluation.allResults,
              [config.id]: [...collected],
            },
          }));
        } catch {
          // skip
        }
      }

      return true;
    },
    [accessKey, setDatasetEvaluation]
  );

  const BATCH_SIZE = 10;

  const streamEvaluation = useCallback(
    async (
      datasetId: string,
      config: LLMConfig,
      evalRows: EvaluationDataset["rows"]
    ) => {
      const collected: EvaluationResult[] = [];
      try {
        for (let offset = 0; offset < evalRows.length; offset += BATCH_SIZE) {
          const batch = evalRows.slice(offset, offset + BATCH_SIZE);
          const ok = await streamBatch(
            datasetId,
            config,
            batch,
            offset,
            collected,
            evalRows.length
          );
          if (!ok) return undefined;
        }
        return collected;
      } catch (err) {
        setDatasetEvaluation(datasetId, (evaluation) => ({
          ...evaluation,
          error: `${evaluation.error ? `${evaluation.error}\n` : ""}${llmLabel(config)}: ${err instanceof Error ? err.message : "Error"}`,
        }));
        return undefined;
      }
    },
    [setDatasetEvaluation, streamBatch]
  );

  const handleStartEvaluation = async (
    configs: LLMConfig[],
    meta: boolean
  ) => {
    if (!activeDataset) return;

    if (activeDataset.useSharedLlmConfig) {
      const sharedClone = cloneConfigs(configs);
      setSharedLlmConfigs(sharedClone);
      setSharedMetaEnabled(meta);
      sessionStorage.setItem(SHARED_LLM_CONFIG_STORAGE_KEY, JSON.stringify(sharedClone));
      sessionStorage.setItem(SHARED_META_ENABLED_STORAGE_KEY, String(meta));
      setDatasetField(activeDataset.id, "llmConfigsOverride", null);
      setDatasetField(activeDataset.id, "metaEnabledOverride", null);
    } else {
      setDatasetField(activeDataset.id, "llmConfigsOverride", cloneConfigs(configs));
      setDatasetField(activeDataset.id, "metaEnabledOverride", meta);
    }

    const initProgress: Record<string, { current: number; total: number }> = {};
    configs.forEach((config) => {
      initProgress[config.id] = { current: 0, total: activeDataset.rows.length };
    });

    setDatasetEvaluation(activeDataset.id, () => ({
      ...createIdleEvaluationState(),
      status: "evaluating",
      llmConfigs: cloneConfigs(configs),
      metaEnabled: meta,
      allProgress: initProgress,
      activeTab: "overview",
    }));
    setError("");
    setState("evaluating");

    const promises = configs.map(async (config) => {
      const collected = await streamEvaluation(activeDataset.id, config, activeDataset.rows);
      setDatasetEvaluation(activeDataset.id, (evaluation) => ({
        ...evaluation,
        completedLlms: evaluation.completedLlms.includes(config.id)
          ? evaluation.completedLlms
          : [...evaluation.completedLlms, config.id],
      }));
      return { id: config.id, results: collected };
    });

    const settled = await Promise.all(promises);

    const finalResults: Record<string, EvaluationResult[]> = {};
    settled.forEach(({ id, results }) => {
      if (results) finalResults[id] = results;
    });

    setDatasetEvaluation(activeDataset.id, (evaluation) => ({
      ...evaluation,
      status: "done",
      allResults: finalResults,
      activeTab: "overview",
    }));
    setState("results");

    if (meta && Object.keys(finalResults).length > 1) {
      const consistencyData = computeConsistency(activeDataset.rows, finalResults);
      setDatasetEvaluation(activeDataset.id, (evaluation) => ({
        ...evaluation,
        consistency: consistencyData,
        metaAnalyzing: true,
      }));
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
          const recommendations = Array.isArray(data.recommendations)
            ? data.recommendations.map((item: unknown) => String(item)).filter(Boolean)
            : [];
          setDatasetEvaluation(activeDataset.id, (evaluation) => ({
            ...evaluation,
            metaAnalysis: data.analysis ?? null,
            metaRecommendations: recommendations,
          }));
        }
      } catch {
        // meta-analysis is optional; don't block results
      } finally {
        setDatasetEvaluation(activeDataset.id, (evaluation) => ({
          ...evaluation,
          metaAnalyzing: false,
        }));
      }
    }
  };

  const handleDownloadPdf = async () => {
    if (!activeDataset) return;
    const resolvedContext = resolveReportContext(activeDataset);
    if (!resolvedContext) return;
    const { evaluation } = activeDataset;
    if (evaluation.activeTab === "meta" || evaluation.activeTab === "overview" || !evaluation.activeTab) return;
    const config = evaluation.llmConfigs.find((c) => c.id === evaluation.activeTab);
    if (!config) return;
    const results = evaluation.allResults[config.id] || [];
    if (results.length === 0) return;

    setPdfGenerating(true);
    try {
      const handle = chartRefsMap.current[`${activeDataset.id}:${config.id}`];
      const container = handle?.getChartsContainer() ?? null;
      await generateSingleEvaluatorPdf({
        reportContext: resolvedContext,
        config,
        rows: activeDataset.rows,
        results,
        chartsContainer: container,
        fileNamePrefix: sanitizeBaseName(activeDataset.fileName),
      });
    } finally {
      setPdfGenerating(false);
    }
  };

  const handleDownloadAllPdf = async () => {
    if (!activeDataset) return;
    const resolvedContext = resolveReportContext(activeDataset);
    if (!resolvedContext) return;
    setPdfGenerating(true);
    try {
      const containers: Record<string, HTMLDivElement | null> = {};
      for (const config of activeDataset.evaluation.llmConfigs) {
        const handle = chartRefsMap.current[`${activeDataset.id}:${config.id}`];
        containers[config.id] = handle?.getChartsContainer() ?? null;
      }
      await generateAllEvaluatorsPdf({
        reportContext: resolvedContext,
        configs: activeDataset.evaluation.llmConfigs,
        rows: activeDataset.rows,
        allResults: activeDataset.evaluation.allResults,
        chartsContainers: containers,
        overviewChartsContainer: overviewChartsCaptureRef.current,
        includeMetaSection: Boolean(
          activeDataset.evaluation.metaEnabled && activeDataset.evaluation.consistency
        ),
        consistency: activeDataset.evaluation.consistency,
        metaAnalysis: activeDataset.evaluation.metaAnalysis,
        recommendations: activeDataset.evaluation.metaRecommendations,
        fileNamePrefix: sanitizeBaseName(activeDataset.fileName),
      });
    } finally {
      setPdfGenerating(false);
    }
  };

  const handleDownloadOverviewSlidesPdf = async () => {
    if (!activeDataset) return;
    const resolvedContext = resolveReportContext(activeDataset);
    if (!resolvedContext || activeDataset.evaluation.llmConfigs.length === 0) return;
    setPdfGenerating(true);
    try {
      await generateOverviewSlidesPdf({
        reportContext: resolvedContext,
        configs: activeDataset.evaluation.llmConfigs,
        allResults: activeDataset.evaluation.allResults,
        fileNamePrefix: sanitizeBaseName(activeDataset.fileName),
      });
    } finally {
      setPdfGenerating(false);
    }
  };

  const handleDownloadTex = async () => {
    if (!activeDataset) return;
    const resolvedContext = resolveReportContext(activeDataset);
    if (!resolvedContext) return;
    setPdfGenerating(true);
    try {
      let panoramaImages:
        | { filename: string; dataUrl: string; caption: string }[]
        | undefined;
      const panoramaCaptureTarget = overviewChartsCaptureRef.current;
      if (panoramaCaptureTarget) {
        const canvas = await html2canvas(panoramaCaptureTarget, {
          backgroundColor: "#ffffff",
          scale: 2,
          useCORS: true,
          logging: false,
        });
        panoramaImages = [
          {
            filename: "panorama-general-graficas.png",
            dataUrl: canvas.toDataURL("image/png"),
            caption: "Panorama general - KPIs y gráficas",
          },
        ];
      }
      downloadTexFile({
        reportContext: resolvedContext,
        configs: activeDataset.evaluation.llmConfigs,
        rows: activeDataset.rows,
        allResults: activeDataset.evaluation.allResults,
        consistency: activeDataset.evaluation.consistency,
        metaAnalysis: activeDataset.evaluation.metaAnalysis,
        recommendations: activeDataset.evaluation.metaRecommendations,
        panoramaImages,
        fileNamePrefix: sanitizeBaseName(activeDataset.fileName),
      });
    } finally {
      setPdfGenerating(false);
    }
  };

  const handleDownloadInfographic = async () => {
    if (!activeDataset) return;
    const resolvedContext = resolveReportContext(activeDataset);
    if (!resolvedContext) return;
    setInfographicGenerating(true);
    try {
      let panoramaChartDataUrl: string | undefined;
      const panoramaCaptureTarget = overviewChartsCaptureRef.current;
      if (panoramaCaptureTarget) {
        const canvas = await html2canvas(panoramaCaptureTarget, {
          backgroundColor: "#ffffff",
          scale: 2,
          useCORS: true,
          logging: false,
        });
        panoramaChartDataUrl = canvas.toDataURL("image/png");
      }

      const payload = buildInfographicPayload({
        reportContext: resolvedContext,
        configs: activeDataset.evaluation.llmConfigs,
        rows: activeDataset.rows,
        allResults: activeDataset.evaluation.allResults,
        metaAnalysis: activeDataset.evaluation.metaAnalysis,
        recommendations: activeDataset.evaluation.metaRecommendations,
        panoramaChartDataUrl,
      });

      const response = await fetch("/api/infographic", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-access-key": accessKey,
        },
        body: JSON.stringify({ payload }),
      });

      if (response.status === 401) {
        sessionStorage.removeItem("accessKey");
        setAccessKey("");
        setState("login");
        return;
      }

      if (!response.ok) {
        let errText = "No se pudo generar la infografia";
        try {
          const errorData = (await response.json()) as { error?: string };
          if (errorData.error) errText = errorData.error;
        } catch {
          // Keep default error text.
        }
        setError((prev) => `${prev ? `${prev}\n` : ""}${errText}`);
        return;
      }

      const blob = await response.blob();
      const contentType = response.headers.get("content-type") || "";

      let finalBlob = blob;
      if (contentType.includes("image/svg+xml")) {
        const svgText = await blob.text();
        const svgBlob = new Blob([svgText], { type: "image/svg+xml" });
        const svgUrl = URL.createObjectURL(svgBlob);
        try {
          const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error("No se pudo cargar el SVG de la infografia."));
            image.src = svgUrl;
          });
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth || 1600;
          canvas.height = img.naturalHeight || 900;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            const pngBlob = await new Promise<Blob | null>((resolve) =>
              canvas.toBlob((generatedBlob) => resolve(generatedBlob), "image/png")
            );
            if (pngBlob) {
              finalBlob = pngBlob;
            }
          }
        } finally {
          URL.revokeObjectURL(svgUrl);
        }
      }

      const url = URL.createObjectURL(finalBlob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `infografia_${sanitizeBaseName(activeDataset.fileName)}_${Date.now()}.png`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } finally {
      setInfographicGenerating(false);
    }
  };

  const handleReset = () => {
    setDatasets([]);
    setActiveDatasetId("");
    setError("");
    setState("upload");
  };

  if (state === "login") {
    return <LoginGate onLogin={handleLogin} />;
  }

  if (state === "context") {
    return (
      <div className="min-h-screen">
        <header className="border-b border-[#0e3d66] bg-[#165185]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
            <div className="flex items-baseline gap-2">
              <h1 className="text-lg font-semibold tracking-tight text-white">
                MetaEvaluaciones PRO
              </h1>
              <span className="text-xs text-white/40">
                by{" "}
                <a
                  href="https://alemoralv.github.io/alemoralv/#home"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white/70 underline decoration-white/30 hover:decoration-white/60 transition-colors"
                >
                  alemoralv
                </a>
              </span>
            </div>
            <button
              onClick={() => {
                sessionStorage.removeItem("accessKey");
                sessionStorage.removeItem(REPORT_CONTEXT_STORAGE_KEY);
                setAccessKey("");
                setReportContext(null);
                setState("login");
              }}
              className="text-sm text-white/60 hover:text-white transition-colors"
            >
              Salir
            </button>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
          <AgentContextForm
            initialValue={reportContext}
            onSubmit={handleContextSubmit}
          />
        </main>
      </div>
    );
  }

  const activeEvaluation = activeDataset?.evaluation ?? null;
  const totalProgress = Object.values(activeEvaluation?.allProgress ?? {}).reduce(
    (acc, p) => ({ current: acc.current + p.current, total: acc.total + p.total }),
    { current: 0, total: 0 }
  );

  return (
    <div className="min-h-screen">
      <header className="border-b border-[#0e3d66] bg-[#165185]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <h1 className="text-lg font-semibold tracking-tight text-white">
              MetaEvaluaciones PRO
            </h1>
            <span className="text-xs text-white/40">
              by{" "}
              <a
                href="https://alemoralv.github.io/alemoralv/#home"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white/70 underline decoration-white/30 hover:decoration-white/60 transition-colors"
              >
                alemoralv
              </a>
            </span>
          </div>
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
                  sessionStorage.removeItem(REPORT_CONTEXT_STORAGE_KEY);
                  setAccessKey("");
                  setReportContext(null);
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
              <h2 className="text-xl font-medium">Sube tus archivos CSV</h2>
              <p className="text-sm text-gray-500 mt-1">
                Cada archivo debe contener las columnas: question,
                expectedResponse, actualResponse
              </p>
            </div>
            <CsvUploader onUpload={handleUpload} disabled={false} />
          </div>
        )}

        {state === "configure" && activeDataset && (
          <div className="space-y-6">
            <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
              {datasets.map((dataset) => (
                <button
                  key={dataset.id}
                  onClick={() => setActiveDatasetId(dataset.id)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    activeDatasetId === dataset.id
                      ? "border-[#165185] text-[#165185]"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {dataset.fileName}
                </button>
              ))}
            </div>

            <div className="border border-gray-200 rounded-lg bg-white p-5 space-y-4">
              <h3 className="text-sm font-semibold text-gray-700">
                Contexto del reporte para este CSV
              </h3>
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={activeDataset.useSharedContext}
                  onChange={(e) => {
                    setDatasetField(
                      activeDataset.id,
                      "useSharedContext",
                      e.target.checked
                    );
                  }}
                  className="h-4 w-4 accent-gray-900"
                />
                Usar contexto compartido
              </label>
              {activeDataset.useSharedContext ? (
                <p className="text-xs text-gray-500">
                  Se usarán los datos generales del evaluador/agente para{" "}
                  <span className="font-medium">{activeDataset.fileName}</span>.
                </p>
              ) : (
                <AgentContextForm
                  initialValue={activeDataset.contextOverride ?? reportContext}
                  onSubmit={(context) => {
                    setDatasetField(activeDataset.id, "contextOverride", context);
                  }}
                  submitLabel={`Guardar contexto para ${activeDataset.fileName}`}
                  title={`Contexto para ${activeDataset.fileName}`}
                  description="Esta configuración solo aplica a este CSV."
                />
              )}
            </div>

            <div className="border border-gray-200 rounded-lg bg-white p-5 space-y-4">
              <h3 className="text-sm font-semibold text-gray-700">
                Configuración de evaluadores para este CSV
              </h3>
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={activeDataset.useSharedLlmConfig}
                  onChange={(e) => {
                    setDatasetField(
                      activeDataset.id,
                      "useSharedLlmConfig",
                      e.target.checked
                    );
                  }}
                  className="h-4 w-4 accent-gray-900"
                />
                Usar configuración compartida de evaluadores
              </label>
            </div>

            <LLMConfigurator
              key={`${activeDataset.id}-${activeDataset.useSharedLlmConfig ? "shared" : "override"}`}
              initialConfigs={
                activeDataset.useSharedLlmConfig
                  ? sharedLlmConfigs
                  : activeDataset.llmConfigsOverride ?? sharedLlmConfigs
              }
              initialMetaEnabled={
                activeDataset.useSharedLlmConfig
                  ? sharedMetaEnabled
                  : Boolean(activeDataset.metaEnabledOverride)
              }
              onStart={handleStartEvaluation}
              disabled={false}
              startLabel={`Evaluar ${activeDataset.fileName}`}
            />
          </div>
        )}

        {state === "evaluating" && activeDataset && activeEvaluation && (
          <div className="space-y-8">
            <div className="text-center">
              <h2 className="text-xl font-medium">Evaluando respuestas...</h2>
              <p className="text-sm text-gray-500 mt-1">
                {activeDataset.fileName} - {activeEvaluation.llmConfigs.length} evaluador
                {activeEvaluation.llmConfigs.length !== 1 ? "es" : ""} corriendo en paralelo
              </p>
            </div>

            <ProgressBar
              current={totalProgress.current}
              total={totalProgress.total}
            />

            <div className="space-y-2">
              {activeEvaluation.llmConfigs.map((config) => {
                const p = activeEvaluation.allProgress[config.id] || {
                  current: 0,
                  total: activeDataset.rows.length,
                };
                const done = activeEvaluation.completedLlms.includes(config.id);
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

            {Object.keys(activeEvaluation.allResults).length > 0 && (
              <div>
                <div className="flex gap-1 border-b border-gray-200 mb-4">
                  {activeEvaluation.llmConfigs.map((config) => (
                    <button
                      key={config.id}
                      onClick={() =>
                        setDatasetEvaluation(activeDataset.id, (evaluation) => ({
                          ...evaluation,
                          activeTab: config.id,
                        }))
                      }
                      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                        activeEvaluation.activeTab === config.id
                          ? "border-[#165185] text-[#165185]"
                          : "border-transparent text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      {llmLabel(config)}
                    </button>
                  ))}
                </div>

                {activeEvaluation.llmConfigs.map((config) => {
                  if (config.id !== activeEvaluation.activeTab) return null;
                  const results = activeEvaluation.allResults[config.id] || [];
                  if (results.length === 0) return null;
                  return (
                    <div key={config.id} className="space-y-6">
                      <ScoreCharts results={results} />
                      <ResultsTable
                        rows={activeDataset.rows}
                        results={results}
                        modelLabel={config.model}
                        temperature={config.temperature}
                        fileNameBase={sanitizeBaseName(activeDataset.fileName)}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {state === "results" && activeDataset && (
          <div className="space-y-6">
            <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
              {datasets.map((dataset) => (
                <button
                  key={dataset.id}
                  onClick={() => setActiveDatasetId(dataset.id)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    activeDatasetId === dataset.id
                      ? "border-[#165185] text-[#165185]"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {dataset.fileName}
                </button>
              ))}
            </div>

            <div className="text-center">
              <h2 className="text-xl font-medium">Evaluación completada</h2>
              <p className="text-sm text-gray-500 mt-1">
                {activeDataset.rows.length} respuestas en {activeDataset.fileName}
              </p>
            </div>

            {activeDataset.evaluation.status !== "done" ? (
              <div className="border border-gray-200 rounded-lg bg-white p-6 text-center">
                <p className="text-sm text-gray-600 mb-4">
                  Este CSV aún no ha sido evaluado.
                </p>
                <button
                  onClick={() => setState("configure")}
                  className="px-4 py-2 bg-[#165185] text-white text-sm rounded-lg hover:bg-[#0e3d66] transition-colors"
                >
                  Configurar y evaluar este CSV
                </button>
              </div>
            ) : (
              <>
            <div className="flex justify-center gap-3 flex-wrap">
              <button
                onClick={handleDownloadPdf}
                disabled={
                  pdfGenerating ||
                  infographicGenerating ||
                  activeDataset.evaluation.activeTab === "meta" ||
                  activeDataset.evaluation.activeTab === "overview"
                }
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
                disabled={pdfGenerating || infographicGenerating}
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
                onClick={handleDownloadOverviewSlidesPdf}
                disabled={pdfGenerating || infographicGenerating}
                className="px-4 py-2 bg-[#165185] text-white text-sm rounded-lg hover:bg-[#0e3d66] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {pdfGenerating ? (
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v12m6-6H6m3-9h6a2 2 0 012 2v14H7V5a2 2 0 012-2z" />
                  </svg>
                )}
                PDF diapositivas
              </button>
              <button
                onClick={handleDownloadTex}
                disabled={pdfGenerating || infographicGenerating}
                className="px-4 py-2 bg-[#165185] text-white text-sm rounded-lg hover:bg-[#0e3d66] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Descargar LaTeX
              </button>
              <button
                onClick={handleDownloadInfographic}
                disabled={pdfGenerating || infographicGenerating}
                className="px-4 py-2 bg-[#165185] text-white text-sm rounded-lg hover:bg-[#0e3d66] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {infographicGenerating ? (
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h10M7 12h10M7 17h6M5 4h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" />
                  </svg>
                )}
                Descargar infografia
              </button>
            </div>

            <div className="text-center">
              <button
                onClick={() => setState("configure")}
                className="text-sm text-[#165185] hover:underline"
              >
                Reconfigurar/Reevaluar este CSV
              </button>
            </div>

            <div>
              <div className="flex gap-1 border-b border-gray-200 mb-6 overflow-x-auto">
                <button
                  onClick={() =>
                    setDatasetEvaluation(activeDataset.id, (evaluation) => ({
                      ...evaluation,
                      activeTab: "overview",
                    }))
                  }
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    activeDataset.evaluation.activeTab === "overview"
                      ? "border-[#165185] text-[#165185]"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Panorama General
                </button>
                {activeDataset.evaluation.llmConfigs.map((config) => (
                  <button
                    key={config.id}
                    onClick={() =>
                      setDatasetEvaluation(activeDataset.id, (evaluation) => ({
                        ...evaluation,
                        activeTab: config.id,
                      }))
                    }
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                      activeDataset.evaluation.activeTab === config.id
                        ? "border-[#165185] text-[#165185]"
                        : "border-transparent text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {llmLabel(config)}
                  </button>
                ))}
                {activeDataset.evaluation.metaEnabled &&
                  activeDataset.evaluation.consistency && (
                  <button
                    onClick={() =>
                      setDatasetEvaluation(activeDataset.id, (evaluation) => ({
                        ...evaluation,
                        activeTab: "meta",
                      }))
                    }
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                      activeDataset.evaluation.activeTab === "meta"
                        ? "border-[#165185] text-[#165185]"
                        : "border-transparent text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    Análisis Meta-evaluador
                  </button>
                )}
              </div>

              {activeDataset.evaluation.activeTab === "overview" ? (
                <div>
                  <AgentComparisonPanel
                    configs={activeDataset.evaluation.llmConfigs}
                    allResults={activeDataset.evaluation.allResults}
                  />
                </div>
              ) : activeDataset.evaluation.activeTab === "meta" ? (
                <div>
                  {activeDataset.evaluation.consistency && (
                    <div>
                      <MetaEvaluationPanel
                        consistency={activeDataset.evaluation.consistency}
                        metaAnalysis={activeDataset.evaluation.metaAnalysis}
                        recommendations={activeDataset.evaluation.metaRecommendations}
                        metaAnalyzing={activeDataset.evaluation.metaAnalyzing}
                      />
                    </div>
                  )}
                </div>
              ) : (
                activeDataset.evaluation.llmConfigs.map((config) => {
                  if (config.id !== activeDataset.evaluation.activeTab) return null;
                  const results = activeDataset.evaluation.allResults[config.id] || [];
                  return (
                    <div key={config.id} className="space-y-6">
                      <ScoreCharts
                        ref={(handle) => {
                          chartRefsMap.current[`${activeDataset.id}:${config.id}`] = handle;
                        }}
                        results={results}
                      />
                      <ResultsTable
                        rows={activeDataset.rows}
                        results={results}
                        modelLabel={config.model}
                        temperature={config.temperature}
                        fileNameBase={sanitizeBaseName(activeDataset.fileName)}
                      />
                    </div>
                  );
                })
              )}
            </div>

            {/* Hidden chart renders for non-active tabs (needed for "Descargar todo en PDF") */}
            <div className="absolute left-[-9999px] top-0" aria-hidden="true">
              <div ref={overviewChartsCaptureRef} style={{ width: 1200 }}>
                <AgentComparisonPanel
                  configs={activeDataset.evaluation.llmConfigs}
                  allResults={activeDataset.evaluation.allResults}
                  hideTables
                />
              </div>
              {activeDataset.evaluation.metaEnabled &&
                activeDataset.evaluation.consistency &&
                activeDataset.evaluation.activeTab !== "meta" && (
                <div style={{ width: 1200 }}>
                  <MetaEvaluationPanel
                    consistency={activeDataset.evaluation.consistency}
                    metaAnalysis={activeDataset.evaluation.metaAnalysis}
                    recommendations={activeDataset.evaluation.metaRecommendations}
                    metaAnalyzing={activeDataset.evaluation.metaAnalyzing}
                  />
                </div>
              )}
              {activeDataset.evaluation.llmConfigs
                .filter((c) => c.id !== activeDataset.evaluation.activeTab)
                .map((config) => {
                  const results = activeDataset.evaluation.allResults[config.id] || [];
                  if (results.length === 0) return null;
                  return (
                    <div key={config.id} style={{ width: 800 }}>
                      <ScoreCharts
                        ref={(handle) => {
                          chartRefsMap.current[`${activeDataset.id}:${config.id}`] = handle;
                        }}
                        results={results}
                      />
                    </div>
                  );
                })}
            </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
