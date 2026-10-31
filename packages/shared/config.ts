export interface ConfigField {
  key: string;
  label: string;
  module: string;
  type: "text" | "secret" | "number" | "url" | "select";
  defaultValue: string;
  example: string;
  description: string;
  options?: string[];
  min?: number;
  max?: number;
  advanced?: boolean;
  restartRequired?: boolean;
}
export interface RuntimeConfig {
  envPath: string;
  pendingApply: boolean;
  modules: { id: string; title: string; description: string }[];
  fields: ConfigField[];
  values: Record<string, string>;
  secretConfigured: Record<string, boolean>;
  restartRequired: string[];
}
