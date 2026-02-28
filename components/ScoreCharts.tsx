"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";
import { EvaluationResult } from "@/lib/types";
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

export interface ScoreChartsHandle {
  getChartsContainer(): HTMLDivElement | null;
}

interface ScoreChartsProps {
  results: EvaluationResult[];
}

const BANDS = [
  "1-10", "11-20", "21-30", "31-40", "41-50",
  "51-60", "61-70", "71-80", "81-90", "91-100",
] as const;

type Band = (typeof BANDS)[number];

function classifyScore(score: number): Band {
  if (score <= 10) return "1-10";
  if (score <= 20) return "11-20";
  if (score <= 30) return "21-30";
  if (score <= 40) return "31-40";
  if (score <= 50) return "41-50";
  if (score <= 60) return "51-60";
  if (score <= 70) return "61-70";
  if (score <= 80) return "71-80";
  if (score <= 90) return "81-90";
  return "91-100";
}

const ScoreCharts = forwardRef<ScoreChartsHandle, ScoreChartsProps>(
  function ScoreCharts({ results }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => ({
      getChartsContainer() {
        return containerRef.current;
      },
    }));

    if (results.length === 0) return null;

    const distribution = BANDS.map((band) => ({
      name: band,
      Precisión: results.filter((r) => classifyScore(r.accuracy) === band).length,
      Completitud: results.filter((r) => classifyScore(r.completeness) === band).length,
      Relevancia: results.filter((r) => classifyScore(r.relevance) === band).length,
      Coherencia: results.filter((r) => classifyScore(r.coherence) === band).length,
      Claridad: results.filter((r) => classifyScore(r.clarity) === band).length,
      Utilidad: results.filter((r) => classifyScore(r.usefulness) === band).length,
    }));

    const avg = (field: "accuracy" | "completeness" | "relevance" | "coherence" | "clarity" | "usefulness") =>
      results.length > 0
        ? Math.round(
            (results.reduce((s, r) => s + r[field], 0) / results.length) * 10
          ) / 10
        : 0;

    const radarData = [
      { dimension: "Precisión", value: avg("accuracy"), fullMark: 100 },
      { dimension: "Completitud", value: avg("completeness"), fullMark: 100 },
      { dimension: "Relevancia", value: avg("relevance"), fullMark: 100 },
      { dimension: "Coherencia", value: avg("coherence"), fullMark: 100 },
      { dimension: "Claridad", value: avg("clarity"), fullMark: 100 },
      { dimension: "Utilidad", value: avg("usefulness"), fullMark: 100 },
    ];

    const COLORS = ["#4f46e5", "#0891b2", "#059669", "#d97706", "#dc2626", "#7c3aed"];

    return (
      <div ref={containerRef} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="border border-gray-200 rounded-lg bg-white p-4">
          <h4 className="text-sm font-medium text-gray-700 mb-3">
            Distribución de puntajes
          </h4>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={distribution} margin={{ bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="name" tick={{ fontSize: 10 } as Record<string, unknown>} angle={-45} textAnchor="end" height={50} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Precisión" fill={COLORS[0]} radius={[4, 4, 0, 0]} />
            <Bar dataKey="Completitud" fill={COLORS[1]} radius={[4, 4, 0, 0]} />
            <Bar dataKey="Relevancia" fill={COLORS[2]} radius={[4, 4, 0, 0]} />
            <Bar dataKey="Coherencia" fill={COLORS[3]} radius={[4, 4, 0, 0]} />
            <Bar dataKey="Claridad" fill={COLORS[4]} radius={[4, 4, 0, 0]} />
            <Bar dataKey="Utilidad" fill={COLORS[5]} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="border border-gray-200 rounded-lg bg-white p-4">
        <h4 className="text-sm font-medium text-gray-700 mb-3">
          Perfil de evaluación
        </h4>
        <ResponsiveContainer width="100%" height={300}>
          <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
            <PolarGrid stroke="#e5e7eb" />
            <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 11 }} />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 100]}
              tick={{ fontSize: 10 }}
            />
            <Radar
              name="Promedio"
              dataKey="value"
              stroke="#4f46e5"
              fill="#4f46e5"
              fillOpacity={0.25}
            />
            <Tooltip />
          </RadarChart>
        </ResponsiveContainer>
        </div>
      </div>
    );
  }
);

export default ScoreCharts;
