export interface EvaluationRow {
  question: string;
  expectedResponse: string;
  actualResponse: string;
}

export interface EvaluationResult {
  index: number;
  accuracy: number;
  completeness: number;
  relevance: number;
  coherence: number;
  clarity: number;
  usefulness: number;
  overallScore: number;
  feedback: string;
}

export interface EnrichedRow {
  question: string;
  expectedResponse: string;
  actualResponse: string;
  accuracy: number;
  completeness: number;
  relevance: number;
  coherence: number;
  clarity: number;
  usefulness: number;
  overallScore: number;
  feedback: string;
}

export interface LLMConfig {
  id: string;
  model: string;
  temperature: number;
  topP: number;
  maxTokens?: number;
}

export interface QuestionConsistency {
  questionIndex: number;
  question: string;
  accuracyStdDev: number;
  completenessStdDev: number;
  relevanceStdDev: number;
  coherenceStdDev: number;
  clarityStdDev: number;
  usefulnessStdDev: number;
  overallStdDev: number;
}

export interface AgentCapabilities {
  webSearch: boolean;
  generalKnowledge: boolean;
  orchestration: boolean;
  tools: boolean;
}

export interface AgentReportContext {
  evaluatorName: string;
  agentName: string;
  modelName: string;
  knowledgeSource: string;
  capabilities: AgentCapabilities;
  testPhase: string;
  systemInstructions?: string;
}
