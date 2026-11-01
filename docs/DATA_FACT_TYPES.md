# Statistical facts, structures and reproducible calculations

Updated 2026-11-01. Statistical taxonomy follows [Calliope](https://arxiv.org/pdf/2010.09975), [DataShot](https://www.microsoft.com/en-us/research/wp-content/uploads/2019/08/VIS2019_DataShot.pdf) and [Aletheia](https://faculty.cc.gatech.edu/~john.stasko/papers/uist24-factcheck.pdf). Internal comparison corresponds to difference and correlation to association; do not add duplicate types. Advanced clustering, balance and periodicity are not implemented.

| Type | Meaning | Source calculation |
| --- | --- | --- |
| value | Observation or aggregate | sum/mean/median/min/max/count |
| comparison | Difference or relative endpoint change | difference/change_percent |
| trend | Increasing/decreasing/constant/mixed observed sequence | trend |
| distribution | Categorical measures or numeric-bin frequencies | distribution/distribution_count/histogram |
| correlation | Paired association or quoted association effect | pearson; quoted OR/RR/HR only |
| proportion | Part divided by all values in the complete table | proportion |
| categorization | Existing labels and distinct count | distinct_count |
| rank | One focus object's position in the full set | rank |
| extreme | Max/min with all ties | extreme_max/extreme_min |
| outlier | Observation identified by explicit algorithm | outlier_iqr |

inference is not a type. Required derivation is quoted/computed/inferred/forecast. Explain assumptions/limitations, including quoted predictions, rather than presenting them as observed history. Required specification is scope/measure/breakdown/focus/aggregation/method/distribution_kind/calculation_id/series_unit. JSON indexes/receipts are program-maintained; authors submit Markdown.

Distribution kind is none/categorical/numeric, with the latter two required for distribution facts. Aggregation is an operation property, not a type. Relationship enums remain temporal/comparison/correlation/causal/contains/context.

## Source-bound calculations

calculate accepts operation, source_id, block_id and zero-based label_column/value_column; paired_column for correlation; focus for rank/proportion/outlier; optional ties/direction/iqr_multiplier/bins/unit. Read real E- block cells, never formal model-filled values/labels/paired_values. Results return precise values, complete series, separate units, fields, method, scope/focus and receipt ID as Markdown.

Regular Markdown/CSV/TSV tables need a clear unique nonempty header and consistent columns. Raw CSV/TSV supports single-column categories. Do not drop missing/non-numeric/unit-bearing cells or guess conversions. Merged/incomplete tables require proper source preparation or quoted published results. Select a block containing the actual header/data, not only its section title.

state/calculations/calc-<SHA256>.json binds source digest, block, columns, algorithm parameters, unit and result. Submission rereads/recomputes and checks receipt, exact core result, complete series, specification and evidence block. Reject tampering, changed sources, mismatched operations, values or units. computed requires calculation_id; other derivations use null. Auxiliary values-only calculations cannot become formal source receipts.

## Method rules

- Difference: exactly two values, last minus first; percent differences have percentage-point core units and percent series units.
- Change: at least two values, nonzero baseline; (last-first)/abs(first)*100 does not imply continuous annual growth.
- Trend: at least two strictly increasing equal-granularity YYYY/YYYY-MM/YYYY-MM-DD points; classify adjacent observations without filling missing years.
- Proportion: nonnegative values and positive complete-table sum, not an external prevalence/population denominator or overlapping categories.
- Categorization enumerates/distinct-counts existing labels, not unsupervised clustering.
- Rank preserves the full set and supports ascending/descending and competition (1,1,3) or dense (1,1,2) ties.
- Extreme preserves all tied objects and is not automatically an outlier.
- IQR uses type7 quantiles, default multiplier 1.5 and at least four observations. Reject focus inside fences. Zero IQR retains distance with null normalized score, not fabricated significance.
- Pearson r uses at least three complete nonconstant pairs from different columns; no p value, significance or causal claim. Internal scaling reduces overflow.
- Categorical distributions sum/count by label; numeric bins are explicit/increasing, left-closed/right-open except the last right-closed bin, covering every value.
- Finite floating-point results must match exactly. Put display rounding in title/description.

Units are explicit original-unit declarations, not automatically proven from prose or implicitly converted. Metric uses fact.unit; bar/line/donut use specification.series_unit. Rank core and sales-series units differ. Mixed-unit lists cannot share an axis/donut; ratios/products such as mg/dL are not unit lists. Do not delete observations or relabel units to evade validation.

r/rho/tau coefficients are finite in [-1,1]. Quoted OR/RR/HR ratios are finite and nonnegative, may exceed one and must preserve reference groups/adjustment. Unknown units are rejected, not guessed from magnitudes. calculate supports Pearson only; do not claim regression computation for quoted ratios. Association remains distinct from causation and model confidence from confidence intervals.

## Structural facts and presentation

timeline/process/hierarchy/scatter use explicit structure, source-linked records and dedicated mappings, validation, guides and workbench graphics. They cannot masquerade as numeric series or use statistical calculation credentials. See INFOGRAPHIC_IMPLEMENTATION.md and the structured-visualization Skill.

Cards show types, derivation, focus, expandable specification, exact core results and reference observations. Scope/schema changes invalidate stale drafts/artifacts without old-format migration; valid upstream research may remain. Tests do not prove source representativeness or all free-text claims. Historical statistical acceptance passed 99 tests/check/build, including native Pi/local source calculations and taxonomy-preview.mts. Current totals and live-provider limitations are in VALIDATION.md.
