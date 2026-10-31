# 十类数据事实与可复算计算

更新：2026-10-31。

## 修改计划与完成范围

按文献调研补齐十类基础事实；将推论/预测从类型中分离；扩展确定性统计操作；将计算输入绑定真实来源；补齐类型专属校验、卡片和 Designer 单位映射；执行 Markdown、来源追溯、真实 Pi 本地服务及界面验收。

依据 [Calliope 的十类事实框架](https://arxiv.org/pdf/2010.09975)、[DataShot](https://www.microsoft.com/en-us/research/wp-content/uploads/2019/08/VIS2019_DataShot.pdf) 与 [Aletheia](https://faculty.cc.gatech.edu/~john.stasko/papers/uist24-factcheck.pdf)。项目使用 comparison 对应文献 difference，correlation 对应 association；这些是项目内部命名，不新增重复类型。聚类、均衡性、周期性等高级洞察尚未加入。

## 类型与依据方式

| 类型 | 含义 | 来源计算操作 |
| --- | --- | --- |
| value | 单个数值或聚合统计 | sum / mean / median / min / max / count |
| comparison | 两项差值或基期到末期的相对变化 | difference / change_percent |
| trend | 观测时间点上的上升、下降、恒定或混合变化 | trend |
| distribution | 类别度量分布或数值区间频数 | distribution / distribution_count / histogram |
| correlation | 数值变量相关，或文献报告的关联效应 | pearson；OR/RR/HR 仅引用来源 |
| proportion | 一部分占该表全部数值之和的百分比 | proportion |
| categorization | 已有类别枚举与去重计数 | distinct_count |
| rank | 一个关注对象在完整比较集合中的名次 | rank |
| extreme | 最大/最小值及所有并列对象 | extreme_max / extreme_min |
| outlier | 被明确算法识别的异常观测 | outlier_iqr |

`inference` 不再是合法事实类型。每条事实必填独立的 `derivation`：quoted（原文引用）、computed（来源独立复算）、inferred（推断）、forecast（预测）。预测和推断须解释假设与限制；引用文献预测也应注明预测性质，不冒充历史实测值。

每条事实的统计口径 `specification` 必填：scope、measure、breakdown、focus、aggregation、method、distribution_kind、calculation_id、series_unit。作者仍以中文 Markdown 表格提交，JSON 仅是内部索引与计算记录。

分布类别为 none/categorical/numeric；分布事实必须选择后两种。聚合方法是运算属性，不是另一种事实类型。事实关联类型仍为 temporal/comparison/correlation/causal/contains/context，不能填入 distribution 等事实类型。

## 来源绑定计算

`calculate` 接收 operation、source_id、block_id 与零起始列号：label_column、value_column，相关计算另需 paired_column。排名、占比、异常需要唯一 focus；可选 ties、direction、iqr_multiplier、bins 和原单位声明 unit。

服务器通过来源目录读取指定 E- 证据块的实际单元格，拒绝同时传入模型自填 values/labels/paired_values。工具返回 Markdown：精确数值、序列、单位、序列单位、字段、方法、关注对象、范围以及计算记录编号。

支持首行为明确表头的规则 Markdown 表格、CSV、TSV；原始上传的 CSV/TSV 支持单列类别。列数必须一致，表头非空且唯一，缺失/带单位的数值单元格不自动删除或换算。复杂合并表格、缺少明确表头等情况应整理为完整规范资料，或直接引用文献报告的结果。选择 E- 块时要选实际包含表头和数据的块，不能选章节标题。

记录保存在项目 `state/calculations/calc-<SHA256>.json`。编号绑定来源内容摘要、证据块、列选择、算法参数、单位声明及结果。正式提交重新读取当前来源并复算，核对记录、精确核心数值、完整返回序列、统计口径及证据块关联。记录被篡改、来源改变、操作不匹配、改写结果或单位均拒绝。

computed 的 calculation_id 必须存在。其他依据方式的 calculation_id 填“未提供”（空值）。只传 values 的 calculate 仍可作为辅助计算，但不会生成可提交的来源计算凭据。

## 方法约定

- 差值：恰好两项，末项减首项。若原单位是 %，差值单位为“百分点”，底层序列单位仍为 %。
- 变化率：至少两项，基期不能为零，使用 `(last-first)/abs(first)*100`；不代表逐年连续增长。
- 趋势：至少两个严格递增、同粒度的 YYYY/ YYYY-MM / YYYY-MM-DD；检查相邻观测，返回 increasing/decreasing/constant/mixed，不补齐缺年，也不据此断言缺失年份持续上升。
- 占比：非负数值，分母为完整证据块全部数值之和且必须大于零；不自动换成外部总体、人口患病率或互相重叠类别的外部基数。
- 分类：枚举已有标签并去重计数，不做无监督聚类。
- 排名：对象唯一，支持升/降序，competition（1、1、3）或 dense（1、1、2）；保留完整排序序列及比较范围，不把子集称为全国排名。
- 极值：保留所有并列最大/最小对象，不把极值直接认定为异常。
- 异常：IQR，线性 type7 分位数，默认倍数 1.5；至少四个完整观测。指定对象不在围栏之外时拒绝异常事实。IQR 为零时保留异常距离，但归一化分数为空，不捏造分数。
- 相关：Pearson r，至少三组完整配对、两列不同且不能恒定；不计算 p 值、不声称显著或因果。内部缩放降低溢出风险。
- 类别分布：按标签求和或计数；数值分布按显式递增边界分箱，左闭右开、末箱右闭，必须覆盖全部数据。
- 数值采用有限浮点数，溢出/无定义结果报错；核心数值与返回结果精确一致，展示用舍入值写在标题或描述。

单位是显式的原单位声明，不会从自由文本自动证明或进行隐式换算。序列单位与核心数值单位分开，例如排名 value 用“名”，销售额 series 用“万元”。Designer 的 metric 必须对应 value 单位，bar/line/donut 必须对应 series_unit。

## 展示、失效与限制

事实卡片显示十类标签、引用/计算/推断/预测标记、关注对象和可展开统计口径。占比提供百分比条，排名/极值/异常保留核心结果与参照序列，排名高亮仅对应关注对象。草稿、校验状态和正式提交继续使用 Analyst 工作台。

新的必填统计口径与类型列表会使旧分析草稿范围失效。旧格式正式分析在下一次工作流检查时不能通过当前 Schema，将重新执行 Analyst 及下游；不自动迁移或猜测旧 inference 的类型。已有有效需求、Researcher 资料仍可复用。本次没有主动重跑用户项目。

引用校验仍只证明引文出处；原文报告的统计结论不等于本系统独立复算。来源完整性、单位声明、总体代表性、因果与预测假设仍需专业核实。模型自评可信度不是统计置信区间。系统不宣称已支持所有高级统计方法。

## 验证

99 项全量测试、类型检查和生产构建通过。新增覆盖十类 Markdown 往返、来源绑定计算、并列与异常边界、无定义输入、时间字段、分箱覆盖、单列类别、篡改/错配拒绝、百分点与百分比、标量/序列单位区分以及真实 Pi + 本地模型服务实际调用新计算工具。

界面验收脚本 `tsx tests/fixtures/taxonomy-preview.mts` 在隔离配置和临时项目下验证十类标签、依据方式、统计口径与排名高亮，截图不进入产品数据。没有调用外部付费模型验证其新协议遵循能力。

关联事实按明确指标单位校验：r/ρ/τ 属于相关系数，范围 [-1, 1]；OR/RR/HR 为非负有限比值，可大于 1，须在方法与上下文说明参照组和调整口径。未知单位拒绝，不根据数值大小猜指标。calculate 仅提供 Pearson r，不能把 OR/RR/HR 声明为已执行确定性回归计算；引用结果继续核对来源原文，不能解释为因果。

序列要求统一单位，series_unit 不能以顿号、逗号或分号列出多种单位。人数与百分比、患病率与 OR 应拆为独立且可追溯的事实；不通过改单位文字、删掉观测或猜测换算关系来规避。已有混合序列仍保留原始数据，但 Designer 不能把它直接交给同一数值轴或环图。
