import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReview, parseReviewOutcome, assetPresentation } from '../apps/server/src/visual-review.js';
import { documentTemplate, parseDocument } from '../apps/server/src/markdown-protocol.js';
const design = parseDocument('designer', documentTemplate('designer')).data;
design.assets[0].id = 'A-001';
design.components[0].id = 'C-001';
design.components[0].asset_ids = ['A-001'];
const header = '| 编号 | 归属 | 组件 | 问题 |\n';
const issue = '| R1 | builder | A-001 | Present but too faint: increase presentation opacity. |';

test('missing separator never drops the first issue; assets map to their using component', () => {
 const parsed = parseReview(header + issue, design);
 assert.equal(parsed.length, 1);
 assert.equal(parsed[0].component, 'C-001');
 assert.deepEqual(parseReview(header + '| --- | --- | --- | --- |\n' + issue, design), parsed);
 assert.throws(() => parseReview(header + issue.replace('A-001', 'unknown'), design), /无效/);
 assert.throws(() => parseReview(header + issue + '\n' + issue, design), /重复/);
 assert.throws(() => parseReview(header, design), /问题表/);
});

test('every open issue must be retained or explicitly resolved; closed IDs cannot be reused', () => {
 const previous = parseReview(header + issue, design);
 assert.throws(() => parseReviewOutcome('无问题', design, previous), /未核销/);
 assert.equal(parseReviewOutcome(header + issue, design, previous).issues[0].id, 'R1');
 assert.deepEqual(parseReviewOutcome('## 已解决\n- R1\n\n## 待修问题\n无问题', design, previous).resolved, ['R1']);
 assert.throws(() => parseReviewOutcome('## 已解决\n- R2\n\n## 待修问题\n无问题', design, previous), /上一轮/);
 assert.throws(() => parseReviewOutcome('## 已解决\n- R1\n\n## 待修问题\n' + header + issue, design, previous), /同时待修/);
 assert.throws(() => parseReviewOutcome(header + issue, design, [], [{revision:'old', issues:[], resolved:['R1']}]), /不能复用/);
});

test('asset diagnostics provide source dimensions and presentation CSS without image bytes', () => {
 const png = Buffer.alloc(24); png.write('PNG', 1); png.writeUInt32BE(1600,16); png.writeUInt32BE(960,20);
 const report = assetPresentation(`<style>.hero-accent{width:200px;height:120px;opacity:.12}</style><img class="hero-accent" data-asset-id="A-001" src="data:image/png;base64,${png.toString('base64')}">`);
 assert.deepEqual(report[0].dimensions, {width:1600,height:960});
 assert.equal(report[0].embedded,true);
 assert.match(report[0].class_rules[0], /opacity/);
 assert.ok(!JSON.stringify(report).includes('base64'));
});
