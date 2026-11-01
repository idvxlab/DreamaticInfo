import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';

export default function SupportingPanel({ title, summary, children }: { title: string; summary: ReactNode; children: ReactNode }) {
  return <details className="supporting-panel">
    <summary className="supporting-panel-toggle">
      <span className="supporting-panel-title">{title}</span>
      <span className="supporting-panel-summary">{summary}</span>
      <ChevronDown size={14} className="supporting-panel-chevron" aria-hidden="true" />
    </summary>
    <div className="supporting-panel-content">{children}</div>
  </details>;
}
