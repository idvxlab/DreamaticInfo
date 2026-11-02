import { parse, walk } from 'css-tree';

/** Parse CSS so quoted data URLs, nested SVG text and comments remain opaque. */
export function cssResourceIssues(css: string, inline = false): string[] {
  const issues: string[] = [];
  try {
    const ast = parse(css, { context: inline ? 'declarationList' : 'stylesheet', parseCustomProperty: true, onParseError: () => { issues.push('Malformed CSS cannot be checked for offline resources'); } });
    walk(ast, node => {
      if (node.type === 'Atrule' && node.name?.toLowerCase() === 'import') issues.push('CSS @import prohibited; inline the stylesheet');
      if (node.type === 'Url' && !/^(?:data:|#)/i.test(node.value?.trim() ?? '')) issues.push(`Remote CSS resources prohibited: ${node.value?.slice(0, 160)}`);
      // Alternate resource functions can fetch strings without a url() node.
      if (node.type === 'Function' && /^(?:-webkit-)?image-set$/i.test(node.name ?? '')) issues.push('CSS image-set prohibited; use an embedded url()');
    });
  } catch { issues.push('Malformed CSS cannot be checked for offline resources'); }
  return [...new Set(issues)];
}
