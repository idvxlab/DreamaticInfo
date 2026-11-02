import path from 'node:path';
import { readFile, readdir, lstat } from 'node:fs/promises';
import { approvedSkillPaths } from './config-store.js';
import { hash } from './validation.js';

/** Hash discoverable Skill bodies, including local supporting instructions. No runtime data is read. */
export async function roleInstructionDigest(role: string) {
  const roots = [...(['designer', 'builder', 'analyst'].includes(role) ? ['skills/technical', ...(role === 'designer' ? ['skills/artistic'] : [])] : []), ...approvedSkillPaths(role)];
  return instructionDigest(await readFile(path.resolve(`agents/${role}.md`), "utf8"), roots);
}
export async function instructionDigest(prompt: string, roots: string[]) {
  const files: [string, string][] = [];
  const visited = new Set<string>();
  async function visit(file: string) {
    const absolute = path.resolve(file);
    if (visited.has(absolute)) return;
    visited.add(absolute);
    const info = await lstat(absolute);
    if (info.isSymbolicLink()) throw new Error("Skill instruction symlinks are not supported in fingerprint roots");
    if (info.isDirectory()) {
      for (const entry of (await readdir(absolute)).sort()) if (!entry.startsWith('.') && entry !== 'node_modules') await visit(path.join(absolute, entry));
    } else if (/\.md$/i.test(absolute)) files.push([absolute, hash(await readFile(absolute, 'utf8'))]);
  }
  for (const root of roots) await visit(root);
  return hash({ prompt, files });
}
