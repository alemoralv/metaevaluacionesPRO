"use client";

import { useCallback, useState, DragEvent, ChangeEvent } from "react";
import Papa from "papaparse";
import { EvaluationRow } from "@/lib/types";

interface CsvUploaderProps {
  onUpload: (rows: EvaluationRow[]) => void;
  disabled: boolean;
}

const REQUIRED_COLUMNS = ["question", "expectedResponse", "actualResponse"];

export default function CsvUploader({ onUpload, disabled }: CsvUploaderProps) {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");

  const processFile = useCallback(
    (file: File) => {
      setError("");
      setFileName(file.name);

      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.errors.length > 0) {
            setError(`Error al leer CSV: ${results.errors[0].message}`);
            return;
          }

          const headers = results.meta.fields || [];
          const missing = REQUIRED_COLUMNS.filter(
            (col) => !headers.includes(col)
          );

          if (missing.length > 0) {
            setError(
              `Columnas faltantes: ${missing.join(", ")}. El CSV necesita: ${REQUIRED_COLUMNS.join(", ")}`
            );
            return;
          }

          const rows: EvaluationRow[] = (
            results.data as Record<string, string>[]
          )
            .filter(
              (row) =>
                row.question?.trim() &&
                row.expectedResponse?.trim() &&
                row.actualResponse?.trim()
            )
            .map((row) => ({
              question: row.question.trim(),
              expectedResponse: row.expectedResponse.trim(),
              actualResponse: row.actualResponse.trim(),
            }));

          if (rows.length === 0) {
            setError("El CSV no contiene filas válidas con datos en las 3 columnas requeridas");
            return;
          }

          onUpload(rows);
        },
        error: (err) => {
          setError(`Error al procesar el archivo: ${err.message}`);
        },
      });
    },
    [onUpload]
  );

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file && file.name.endsWith(".csv")) {
        processFile(file);
      } else {
        setError("Solo se aceptan archivos .csv");
      }
    },
    [processFile]
  );

  const handleFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
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
            Arrastra tu archivo CSV aquí o{" "}
            <span className="text-gray-900 font-medium underline">
              selecciónalo
            </span>
          </p>
          <p className="text-xs text-gray-400">
            Columnas requeridas: question, expectedResponse, actualResponse
          </p>
          {fileName && !error && (
            <p className="text-xs text-gray-500 mt-2">{fileName}</p>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}
    </div>
  );
}
