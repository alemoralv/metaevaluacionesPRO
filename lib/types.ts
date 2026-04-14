export type EvaluationMode = "one-shot" | "conversational";
export type LLMProvider = "openai" | "gemini";
export type AuthMode = "user" | "admin";

export interface ConversationTurn {
  question: string;
  expectedResponse: string;
  actualResponse: string;
}

export interface EvaluationRow {
  question: string;
  expectedResponse: string;
  actualResponse: string;
  mode?: EvaluationMode;
  turnCount?: number;
  conversationTurns?: ConversationTurn[];
}

export interface ConversationEvaluationRow extends EvaluationRow {
  mode: "conversational";
  turnCount: number;
  conversationTurns: ConversationTurn[];
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
  provider: LLMProvider;
  model: string;
  temperature: number;
  topP: number;
  maxTokens?: number;
}

export interface ClientAuthSession {
  mode: AuthMode;
  provider: LLMProvider;
  apiKey?: string;
  adminPassword?: string;
  gwBaseUrl?: string;
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

export interface UploadedCsvDataset {
  id: string;
  fileName: string;
  mode: EvaluationMode;
  rows: EvaluationRow[];
}

export interface DatasetEvaluationState {
  status: "idle" | "evaluating" | "done";
  llmConfigs: LLMConfig[];
  metaEnabled: boolean;
  allResults: Record<string, EvaluationResult[]>;
  allProgress: Record<string, { current: number; total: number }>;
  completedLlms: string[];
  activeTab: string;
  consistency: QuestionConsistency[] | null;
  metaAnalysis: string | null;
  metaRecommendations: string[];
  metaAnalyzing: boolean;
  error: string;
}

export interface EvaluationDataset {
  id: string;
  fileName: string;
  mode: EvaluationMode;
  rows: EvaluationRow[];
  useSharedContext: boolean;
  contextOverride: AgentReportContext | null;
  useSharedLlmConfig: boolean;
  llmConfigsOverride: LLMConfig[] | null;
  metaEnabledOverride: boolean | null;
  evaluation: DatasetEvaluationState;
}
