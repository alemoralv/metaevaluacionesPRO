"use client";

import { useCallback, useState, DragEvent, ChangeEvent } from "react";
import Papa from "papaparse";
import {
  ConversationTurn,
  EvaluationMode,
  EvaluationRow,
  UploadedCsvDataset,
} from "@/lib/types";

interface CsvUploaderProps {
  mode: EvaluationMode;
  onUpload: (datasets: UploadedCsvDataset[]) => void;
  disabled: boolean;
}

const REQUIRED_COLUMNS = ["question", "expectedResponse", "actualResponse"];

interface ParsedCsvResult {
  dataset: UploadedCsvDataset | null;
  error: string | null;
}

function generateDatasetId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 10);
}

function compactConversationSummary(turns: ConversationTurn[]): {
  question: string;
  expectedResponse: string;
  actualResponse: string;
} {
  const summaryPrefix = `Conversación de ${turns.length} turno${turns.length === 1 ? "" : "s"}`;
  const firstTurn = turns[0];
  return {
    question: `${summaryPrefix}: ${firstTurn.question}`,
    expectedResponse: turns
      .map((turn, index) => `Turno ${index + 1}: ${turn.expectedResponse}`)
      .join(" | "),
    actualResponse: turns
      .map((turn, index) => `Turno ${index + 1}: ${turn.actualResponse}`)
      .join(" | "),
  };
}

export default function CsvUploader({ mode, onUpload, disabled }: CsvUploaderProps) {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  const [fileNames, setFileNames] = useState<string[]>([]);

  const parseSingleFile = useCallback((file: File): Promise<ParsedCsvResult> => {
    return new Promise((resolve) => {
      Papa.parse<Record<string, string>>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.errors.length > 0) {
            resolve({
              dataset: null,
              error: `${file.name}: Error al leer CSV: ${results.errors[0].message}`,
            });
            return;
          }

          const headers = results.meta.fields || [];
          const rows: EvaluationRow[] = [];
          const rowErrors: string[] = [];

          if (mode === "one-shot") {
            const missing = REQUIRED_COLUMNS.filter(
              (col) => !headers.includes(col)
            );

            if (missing.length > 0) {
              resolve({
                dataset: null,
                error: `${file.name}: Columnas faltantes: ${missing.join(", ")}. El CSV necesita: ${REQUIRED_COLUMNS.join(", ")}`,
              });
              return;
            }

            results.data.forEach((row) => {
              if (
                row.question?.trim() &&
                row.expectedResponse?.trim() &&
                row.actualResponse?.trim()
              ) {
                rows.push({
                  question: row.question.trim(),
                  expectedResponse: row.expectedResponse.trim(),
                  actualResponse: row.actualResponse.trim(),
                  mode: "one-shot",
                });
              }
            });
          } else {
            const indexedQuestionColumns = headers
              .map((column) => {
                const match = /^question(\d+)$/.exec(column.trim());
                return match ? Number(match[1]) : null;
              })
              .filter((value): value is number => value !== null)
              .sort((a, b) => a - b);

            if (indexedQuestionColumns.length === 0) {
              resolve({
                dataset: null,
                error: `${file.name}: No se detectaron columnas conversacionales. Usa encabezados como question1, expectedResponse1, actualResponse1.`,
              });
              return;
            }

            const missingTriplets = indexedQuestionColumns
              .filter(
                (index) =>
                  !headers.includes(`expectedResponse${index}`) ||
                  !headers.includes(`actualResponse${index}`)
              )
              .map((index) => `question${index}/expectedResponse${index}/actualResponse${index}`);

            if (missingTriplets.length > 0) {
              resolve({
                dataset: null,
                error: `${file.name}: Faltan columnas para turnos conversacionales: ${missingTriplets.join(", ")}`,
              });
              return;
            }

            results.data.forEach((rawRow, rowIndex) => {
              const turns: ConversationTurn[] = [];
              for (const turnIndex of indexedQuestionColumns) {
                const question = (rawRow[`question${turnIndex}`] ?? "").trim();
                if (!question) break;

                const expectedResponse = (rawRow[`expectedResponse${turnIndex}`] ?? "").trim();
                const actualResponse = (rawRow[`actualResponse${turnIndex}`] ?? "").trim();

                if (!expectedResponse || !actualResponse) {
                  rowErrors.push(
                    `Fila ${rowIndex + 2}: el turno ${turnIndex} tiene question${turnIndex} pero faltan expectedResponse${turnIndex} o actualResponse${turnIndex}.`
                  );
                  return;
                }

                turns.push({
                  question,
                  expectedResponse,
                  actualResponse,
                });
              }

              if (turns.length === 0) return;

              const summary = compactConversationSummary(turns);
              rows.push({
                ...summary,
                mode: "conversational",
                turnCount: turns.length,
                conversationTurns: turns,
              });
            });
          }

          if (rows.length === 0) {
            resolve({
              dataset: null,
              error:
                rowErrors.length > 0
                  ? `${file.name}: ${rowErrors.join(" ")}`
                  : mode === "one-shot"
                    ? `${file.name}: El CSV no contiene filas válidas con datos en las 3 columnas requeridas`
                    : `${file.name}: El CSV no contiene conversaciones válidas.`,
            });
            return;
          }

          resolve({
            dataset: {
              id: generateDatasetId(),
              fileName: file.name,
              mode,
              rows,
            },
            error: rowErrors.length > 0 ? `${file.name}: ${rowErrors.join(" ")}` : null,
          });
        },
        error: (err) => {
          resolve({
            dataset: null,
            error: `${file.name}: Error al procesar el archivo: ${err.message}`,
          });
        },
      });
    });
  }, [mode]);

  const processFiles = useCallback(
    async (files: File[]) => {
      setError("");

      const csvFiles = files.filter((file) =>
        file.name.toLowerCase().endsWith(".csv")
      );
      if (csvFiles.length === 0) {
        setError("Solo se aceptan archivos .csv");
        return;
      }

      setFileNames(csvFiles.map((file) => file.name));
      const parsed = await Promise.all(csvFiles.map((file) => parseSingleFile(file)));
      const validDatasets = parsed
        .map((item) => item.dataset)
        .filter((dataset): dataset is UploadedCsvDataset => dataset !== null);
      const errors = parsed
        .map((item) => item.error)
        .filter((item): item is string => Boolean(item));

      if (validDatasets.length === 0) {
        setError(errors.join("\n"));
        return;
      }

      if (errors.length > 0) {
        setError(errors.join("\n"));
      }

      onUpload(validDatasets);
    },
    [onUpload, parseSingleFile]
  );

  const handleDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const files = Array.from(e.dataTransfer.files || []);
      await processFiles(files);
    },
    [processFiles]
  );

  const handleFileChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) {
        await processFiles(files);
      }
    },
    [processFiles]
  );

  return (
    <div className="w-full max-w-xl mx-auto">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer ${
          dragOver
            ? "border-gray-900 bg-gray-100"
            : "border-gray-300 hover:border-gray-400"
        } ${disabled ? "opacity-50 pointer-events-none" : ""}`}
        onClick={() =>
          !disabled && document.getElementById("csv-input")?.click()
        }
      >
        <input
          id="csv-input"
          type="file"
          accept=".csv"
          multiple
          onChange={handleFileChange}
          className="hidden"
          disabled={disabled}
        />

        <div className="space-y-2">
          <svg
            className="w-10 h-10 mx-auto text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
          <p className="text-sm text-gray-600">
            Arrastra tus archivos CSV aquí o{" "}
            <span className="text-gray-900 font-medium underline">
              selecciónalos
            </span>
          </p>
          <p className="text-xs text-gray-400">
            {mode === "conversational"
              ? "Columnas esperadas por turno: question1, expectedResponse1, actualResponse1, question2, ..."
              : "Columnas requeridas: question, expectedResponse, actualResponse"}
          </p>
          {fileNames.length > 0 && (
            <p className="text-xs text-gray-500 mt-2">
              {fileNames.length} archivo{fileNames.length !== 1 ? "s" : ""}:{" "}
              {fileNames.join(", ")}
            </p>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-600 text-sm whitespace-pre-line">{error}</p>
        </div>
      )}
    </div>
  );
}
