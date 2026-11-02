// Minimal public API surface used by the offline CSS resource validator.
declare module 'css-tree' {
  export function parse(css: string, options?: { context?: string; parseCustomProperty?: boolean; onParseError?: (error: Error) => void }): unknown;
  export function walk(ast: unknown, visit: (node: { type: string; value?: string; name?: string }) => void): void;
}
