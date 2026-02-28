import { EvaluationRow, EvaluationResult, QuestionConsistency } from "./types";

function populationStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance =
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function computeConsistency(
  rows: EvaluationRow[],
  allResults: Record<string, EvaluationResult[]>
): QuestionConsistency[] {
  const agentIds = Object.keys(allResults);

  return rows.map((row, i) => {
    const accuracies: number[] = [];
    const completions: number[] = [];
    const relevances: number[] = [];
    const coherences: number[] = [];
    const clarities: number[] = [];
    const usefulnesses: number[] = [];
    const overalls: number[] = [];

    for (const agentId of agentIds) {
      const result = allResults[agentId]?.find((r) => r.index === i);
      if (result) {
        accuracies.push(result.accuracy);
        completions.push(result.completeness);
        relevances.push(result.relevance);
        coherences.push(result.coherence);
        clarities.push(result.clarity);
        usefulnesses.push(result.usefulness);
        overalls.push(result.overallScore);
      }
    }

    return {
      questionIndex: i,
      question: row.question,
      accuracyStdDev: Math.round(populationStdDev(accuracies) * 100) / 100,
      completenessStdDev:
        Math.round(populationStdDev(completions) * 100) / 100,
      relevanceStdDev: Math.round(populationStdDev(relevances) * 100) / 100,
      coherenceStdDev: Math.round(populationStdDev(coherences) * 100) / 100,
      clarityStdDev: Math.round(populationStdDev(clarities) * 100) / 100,
      usefulnessStdDev: Math.round(populationStdDev(usefulnesses) * 100) / 100,
      overallStdDev: Math.round(populationStdDev(overalls) * 100) / 100,
    };
  });
}
