export const roles = [
  "chatbot",
  "researcher",
  "analyst",
  "designer",
  "builder",
] as const;
export type Role = (typeof roles)[number];
export type Status =
  "pending" | "running" | "completed" | "failed" | "interrupted";
export interface ModelConfig {
  provider: string;
  model: string;
  thinkingLevel: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
}
export type Models = Record<Role, ModelConfig>;
export interface Source {
  id: string;
  title: string;
  url: string | null;
  published_at: string | null;
  accessed_at: string;
  kind: "upload" | "web";
  path: string;
  fields: string[];
  limitations: string[];
}
export interface Intent {
  title: string;
  topic: string;
  objective: string;
  audience: string;
  scope: string;
  data_requirements: string;
  story_direction: string;
  visual_preferences: string;
  constraints: string[];
}
export interface Research {
  summary: string;
  sources: Source[];
  datasets: {
    id: string;
    source_id: string;
    path: string;
    fields: string[];
    description: string;
  }[];
  limitations: string[];
}
export interface Fact {
  id: string;
  title: string;
  type:
    | "value"
    | "comparison"
    | "trend"
    | "distribution"
    | "correlation"
    | "proportion"
    | "categorization"
    | "rank"
    | "extreme"
    | "outlier";
  derivation: "quoted" | "computed" | "inferred" | "forecast";
  specification: { scope: string; measure: string; breakdown: string; focus: string; method: string; series_unit: string; aggregation: "none" | "count" | "sum" | "mean" | "median" | "min" | "max" | "distinct_count"; distribution_kind: "none" | "categorical" | "numeric"; calculation_id: string | null };
  description: string;
  value: string | number;
  unit: string;
  evidence: { source_id: string; quote: string; location: string }[];
  analysis: string;
  context: string;
  source_ids: string[];
  importance: number;
  relations: {
    target_id: string;
    type:
      | "temporal"
      | "comparison"
      | "correlation"
      | "causal"
      | "contains"
      | "context";
    basis: string;
  }[];
  confidence: { score: number; reason: string };
  series: { label: string; value: number }[];
}
export interface DataFacts {
  summary: string;
  facts: Fact[];
}
export interface Design {
  narrative_rationale: string;
  title: string;
  theme: string;
  storyline: {
    rationale: string;
    id: string;
    title: string;
    description: string;
    fact_ids: string[];
  }[];
  page: { width: number; height: number; background: string };
  palette: string[];
  font: string;
  components: {
    id: string;
    type:
      "heading" | "text" | "bar" | "line" | "donut" | "metric" | "illustration";
    parent_id: string | null;
    story_ids: string[];
    fact_ids: string[];
    title: string;
    description: string;
    layout: { x: number; y: number; width: number; height: number };
    mapping: { label_field: string; value_field: string; unit: string };
    interaction: { trigger: string; behavior: string };
    animation: { trigger: string; behavior: string };
  }[];
  assets: {
    id: string;
    purpose: string;
    width: number;
    height: number;
    style: string;
    prompt: string;
  }[];
}
export interface Upload {
  id: string;
  name: string;
  path: string;
  normalized: string;
  sha256: string;
  size: number;
}
export interface Question {
  title: string;
  options: string[];
}
export interface Message {
  role: "user" | "assistant";
  text: string;
  at: string;
  question?: Question;
}
export interface Stage {
  status: Status;
  attempts: number;
  inputs?: string[];
  outputs?: string[];
  input_hash?: string;
  output_hash?: string;
  version?: string;
  completed_at?: string;
  error?: string;
}
export interface TaskState {
  project_id: string;
  status: Status;
  current_stage: Role | null;
  completed: Role[];
  pending: Role[];
  stages: Record<Role, Stage>;
  updated_at: string;
  last_success_at: string | null;
  error: string | null;
}
export interface Project {
  id: string;
  title: string;
  brief: string;
  mode: "live";
  created_at: string;
  updated_at: string;
  uploads: Upload[];
  messages: Message[];
  state: TaskState;
}
export interface ProjectDetail extends Project {
  stage_results?: Partial<Record<Role, { notes: string; summary: string }>>;
  intent?: Intent;
  research?: Research;
  research_progress?: ResearchProgress;
  analysis_progress?: AnalysisProgress;
  design_progress?: DesignProgress;
  datafacts?: DataFacts;
  design?: Design;
  has_html: boolean;
  has_pdf: boolean;
  files: string[];
}

export interface SearchHit { title: string; url: string; description: string }
export interface SearchTask {
  id: string;
  question: string;
  query: string;
  priority: number;
  target: string;
  status: "pending" | "running" | "completed" | "failed";
  hits: SearchHit[];
  attempts: number;
  updated_at: string;
  error?: string;
  config_key?: string;
  config_attempts?: number;
}
export interface CollectedSource {
  id: string;
  requested_url: string;
  url: string;
  title: string;
  status: "fetching" | "accepted" | "rejected" | "failed";
  reason: string;
  task_ids: string[];
  updated_at: string;
  attempts: number;
  source?: Source;
  raw_path?: string;
  rendered_path?: string;
  reader?: string;
  content_scope?: "abstract" | "fulltext";
  redirect_chain?: string[];
  diagnostics?: string[];
  reader_config?: string;
  reader_attempts?: number;
  content_hash?: string;
  preview?: string;
}
export interface ResearchProgress {
  scope: string;
  revision: number;
  updated_at: string;
  plan_markdown: string;
  tasks: SearchTask[];
  sources: CollectedSource[];
  archived_tasks: SearchTask[];
}

export interface AnalysisIssue { fact?: string; location: string; message: string; fix: string; }
export interface AnalysisDraftFact { key: string; fact: Fact; status: "verified" | "needs_revision"; issues: AnalysisIssue[]; }
export interface AnalysisProgress {
  status: "empty" | "draft" | "stale" | "unavailable";
  revision?: string;
  updated_at?: string;
  summary: string;
  facts: AnalysisDraftFact[];
  issues: AnalysisIssue[];
  counts: { saved: number; verified: number; needs_revision: number };
  message: string;
}

export interface DesignIssue { component?: string; story?: string; location: string; message: string; fix: string; }
export interface DesignProgress {
  status: "empty" | "draft" | "stale" | "unavailable";
  revision?: string;
  updated_at?: string;
  phase: "narrative" | "visual" | "ready";
  design?: Design;
  notes?: string;
  issues: DesignIssue[];
  counts: { stories: number; selected_facts: number; components: number; verified_stories: number };
  message: string;
}
