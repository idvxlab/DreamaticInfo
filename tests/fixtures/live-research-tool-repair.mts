/** Public API only; temporary config/projects, no paid model or user project writes. */
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const root=await mkdtemp(path.join(os.tmpdir(),'info-live-research-repair-'));process.env.INFO_CONFIG_DIR=root;
try {
  const store=await import('../../apps/server/src/store.js');
  const {ResearchWorkbench}=await import('../../apps/server/src/research-workbench.js');
  const {validateProvenance}=await import('../../apps/server/src/provenance.js');
  const p=await store.create('Official record verification','live'),w=await ResearchWorkbench.open(p);
  await w.savePlan('## 调研目标\nVerify the exact official GDP indicator and preserve a partial time scope.\n\n## 搜索队列\n| 编号 | 问题 | 关键词 | 优先级 | 目标来源 |\n| --- | --- | --- | --- | --- |\n| Q1 | GDP trend | GDP growth | 1 | worldbank |');
  const candidate=await w.verify('Q1','NY.GDP.MKTP.KD.ZG');
  await w.inspect('Q1',candidate.candidate_id!);
  const {entry}=await w.acquire('Q1',candidate.candidate_id!,{country:'CHN;USA',from:'2020',to:'2021'},'Official GDP growth for China/US; bounded two-year comparison and original metadata retained.');
  await w.saveCoverage(`| 任务 | 来源编号 | 缺口说明 |\n| --- | --- | --- |\n| Q1 | ${entry.source!.id} | Earlier and later years intentionally excluded from this verification |`);
  const draft=await w.composeReport(`## 概要\nTwo-year GDP comparison from the official API.\n\n## 采用来源\n- ${entry.source!.id}\n\n## 局限\n无`);
  const formal=await w.submitReport(draft.draft_revision);await validateProvenance(p,'researcher',formal.data);
  console.log(JSON.stringify({candidate_id:candidate.candidate_id,rows:entry.acquisition?.rows,source_kind:formal.data.sources[0].kind,datasets:formal.data.datasets.length,partial_gap_retained:formal.data.limitations.includes('Earlier and later years intentionally excluded from this verification'),provenance_verified:true}));
} finally {await rm(root,{recursive:true,force:true});}
