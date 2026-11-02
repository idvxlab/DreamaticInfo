import { observeAsset } from "./asset-observation.js";
import { JSDOM } from 'jsdom';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { atomic, safePath } from './store.js';
import { hash } from './validation.js';

/** SVG is inert, self-contained vector markup. Rendering in context remains a Designer responsibility. */
export function inspectSvg(svg: string) {
  if (Buffer.byteLength(svg) > 1_000_000 || /<!DOCTYPE|<!ENTITY/i.test(svg)) throw new Error('SVG exceeds limits or declares entities');
  const document = new JSDOM(svg, { contentType: 'image/svg+xml' }).window.document;
  const root = document.documentElement;
  if (root.localName !== 'svg' || root.namespaceURI !== 'http://www.w3.org/2000/svg') throw new Error('Expected SVG root');
  const box = root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  if (!box || box.length !== 4 || box.some(n => !Number.isFinite(n)) || box[2] <= 0 || box[3] <= 0) throw new Error('SVG needs a finite positive viewBox');
  for (const dimension of ['width', 'height']) if (!/^\d+(?:\.\d+)?(?:px)?$/.test(root.getAttribute(dimension) ?? '') || parseFloat(root.getAttribute(dimension)!) <= 0) throw new Error('SVG needs positive pixel dimensions');
  const allowed = new Set('svg g defs path rect circle ellipse line polyline polygon text tspan title desc linearGradient radialGradient stop clipPath mask pattern use'.split(' '));
  for (const element of [root, ...root.querySelectorAll('*')]) {
    if (!allowed.has(element.localName)) throw new Error(`Unsupported SVG element: ${element.localName}`);
    for (const attribute of element.attributes) {
      if (/^on/i.test(attribute.name) || /(?:javascript:|@import|expression\s*\()/i.test(attribute.value)) throw new Error('Active SVG content');
      if (/(?:^|:)href$/i.test(attribute.name) && !/^#[\w.-]+$/.test(attribute.value)) throw new Error('External SVG reference');
      for (const match of attribute.value.matchAll(/url\((.*?)\)/gi)) if (!/^['"]?#[\w.-]+['"]?$/.test(match[1].trim())) throw new Error('External SVG resource');
    }
  }
  return { width: parseFloat(root.getAttribute('width')!), height: parseFloat(root.getAttribute('height')!), viewBox: box };
}
export async function saveSvg(root: string, id: string, svg: string, contract: unknown) {
  if (!/^[\w-]+$/.test(id)) throw new Error('Invalid visual resource ID');
  const technical = inspectSvg(svg), version = hash({ svg, contract });
  const relative = `assets/svg/${id}/${version}.svg`;
  await atomic(path.join(root, relative), svg);
  await observeAsset(root, { id, version, status: "ready", resource_path: relative, resource_contract: hash(contract), technical: { width: technical.width, height: technical.height, bytes: Buffer.byteLength(svg), svg: true }, lifecycle: ["generated", "technical_checked"], visual_acceptance: "pending" });
  return { id, version, path: relative, technical, visual_acceptance: 'pending' as const };
}
export async function readSvg(root: string, relative: string) {
  if (!/^assets\/svg\/[\w-]+\/[a-f0-9]{64}\.svg$/.test(relative)) throw new Error('Invalid visual resource path');
  const svg = await readFile(await safePath(root, relative), 'utf8');
  inspectSvg(svg);
  return svg;
}
