// ==========================================
// AuraSearch AI - Core Type Definitions
// ==========================================

export type AgentState =
  | "idle"
  | "listening"
  | "thinking"
  | "searching"
  | "reading"
  | "speaking"
  | "waiting"
  | "error";

export type RiskLevel = "low" | "medium" | "high";

export type MessageRole = "user" | "assistant" | "system" | "tool";

export interface Source {
  title: string;
  url: string;
  snippet: string;
  source: string;
  publishedDate?: string;
}

export interface ToolCall {
  name: string;
  riskLevel: RiskLevel;
  input: Record<string, any>;
  output?: Record<string, any>;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  error?: string;
}

export interface Message {
  role: MessageRole;
  content: string;
  timestamp: number;
  sources?: Source[];
  action?: string;
  riskLevel?: RiskLevel;
  isStreaming?: boolean;
  toolCalls?: ToolCall[];
  pendingAction?: PendingAction;
}

export interface PendingAction {
  id: string;
  action: string;
  description: string;
  riskLevel: RiskLevel;
  details: Record<string, any>;
}

export interface AgentRequest {
  message: string;
  history?: Message[];
  confirmationId?: string;
  confirmed?: boolean;
}

export interface AgentResponse {
  response?: string;
  message?: string;
  sources?: Source[];
  action?: string;
  riskLevel?: RiskLevel;
  pendingAction?: PendingAction;
  toolCalls?: ToolCall[];
  error?: string;
}

// Tool interface
export interface ToolDefinition {
  name: string;
  description: string;
  riskLevel: RiskLevel;
  inputSchema: Record<string, any>;
  execute: (input: any) => Promise<ToolResult>;
}

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  sources?: Source[];
}

// Search result
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
  publishedDate?: string;
}

// Search provider interface
export interface SearchProvider {
  name: string;
  search: (query: string, count?: number) => Promise<SearchResult[]>;
}

// LLM provider interface
export interface LLMProvider {
  name: string;
  generate: (prompt: string, options?: LLMOptions) => Promise<LLMResponse>;
}

export interface LLMOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  system?: string;
}

export interface LLMResponse {
  text: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// Memory
export interface MemoryEntry {
  id: string;
  type: "conversation" | "preference" | "fact" | "search";
  key: string;
  value: string;
  timestamp: number;
}

// Settings
export interface AppSettings {
  voiceEnabled: boolean;
  muted: boolean;
  speechRate: number;
  searchProvider: "duckduckgo" | "brave" | "tavily" | "searxng";
  llmProvider: "ollama" | "openai" | "gemini";
  memoryEnabled: boolean;
  theme: "dark" | "light";
}
