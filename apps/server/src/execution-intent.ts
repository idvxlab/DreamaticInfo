import type { Project } from '../../../packages/shared/types.js';
/** Explicit operations preserve material and budgets; redesign alone opens a fresh draft scope. */
export function executionIntent(p: Project, mode: 'continue' | 'repair' | 'redesign', reason: string) {
  if (!reason.trim()) throw new Error('Execution operation requires a traceable reason');
  if (mode !== 'continue' && p.state.stages.analyst.status !== 'completed') throw new Error('Formal facts required');
  return { mode, at: new Date().toISOString(), reason: reason.trim(), design_scope: mode === 'redesign' ? crypto.randomUUID() : p.execution?.design_scope };
}
