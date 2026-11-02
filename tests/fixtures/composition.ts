import type { Design } from "../../packages/shared/types.js";
export const composition: Design["composition"] = {
  core_message: "Fixture: compare the verified observations, not a population claim.",
  information_hierarchy: "Primary: headline and main comparison; secondary: explanation; supporting: sources. Unselected facts remain in the workbench.",
  primary_visual: "The main comparison is the focal graphic; no generated scene is needed for this statistical fixture.",
  typography: "System sans-serif; heading 32px/700, values 28px/600, body 16px, sources 12px. Offline fallback is system sans-serif.",
  background_treatment: "Flat neutral ground, clean data regions, no texture behind labels.",
  decoration_rules: "Rules group related evidence; no decorative arrows that imply factual relationships.",
  visual_acceptance: "Check headline dominance, associated labels, calm data regions and source legibility. This fixture does not prove aesthetic quality.",
  "task": "statistical",
  "reading": "guided",
  "medium": "responsive",
  "selection_basis": "测试：按证据阅读",
  "communication": "解释测试数据",
  "art_direction": "暖灰背景，橙色重点，系统字体，低装饰密度",
  "layout_rules": "网格排列，来源在所属内容之后，不允许文字遮挡",
  "safe_regions": "正文、数值、标签与来源独立区域",
  "responsive_rules": "窄屏单列，保留解释和来源",
  "print_rules": "展开必要信息，关闭动画",
  "acceptance": "数据准确，桌面移动打印可读"
};
