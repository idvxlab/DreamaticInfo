export const ACQUISITION_VERSION = "source-first-v1";
export const SOURCE_REGISTRY = {
  pubmed: { name: "PubMed / PMC", mode: "api", domain: "pubmed.ncbi.nlm.nih.gov", guidance: "Biomedical literature; search terms support MeSH and date filters. Abstracts are not full text." },
  kaggle: { name: "Kaggle Datasets", mode: "api", domain: "www.kaggle.com", guidance: "Community datasets: inspect publisher, upstream provenance, license and version; exclude synthetic/demo data for real-world claims." },
  worldbank: { name: "World Bank", mode: "api", domain: "api.worldbank.org", guidance: "Search indicator metadata with English terms or an exact code; fetch a country/year slice using country=CHN or CHN;USA, from=2019, to=2024. from/to are years, never source names." },
  who: { name: "WHO GHO", mode: "api", domain: "ghoapi.azureedge.net", guidance: "Legacy GHO OData endpoint: WHO announced deprecation by end of 2025; current live probes return 500. Do not prioritize it or repeat queries after service failure. Use a validated alternative official source and disclose the gap; no verified replacement API has been configured." },
  eurostat: { name: "Eurostat", mode: "code", domain: "ec.europa.eu", guidance: "Use an exact dataset code; inspect JSON-stat dimensions and request a bounded slice." },
  unsdg: { name: "UN SDG", mode: "api", domain: "unstats.un.org", guidance: "Search official series metadata; use the exact returned series code and numeric UN M49 geography (e.g. 156), from=2019, to=2024. ISO codes such as CHN are invalid here." },
  zenodo: { name: "Zenodo", mode: "api", domain: "zenodo.org", guidance: "Research datasets; inspect authors, DOI, license, version and related original publications." },
  nbs: { name: "国家统计局", mode: "directory", domain: "data.stats.gov.cn", guidance: "Official directory/page access only; no verified stable public API. Use a known official page/download or supplemental official-domain discovery." },
  web: { name: "补充网页搜索", mode: "supplement", domain: "", guidance: "Only for an explicit data gap, background explanation or image discovery; record purpose/reason." },
} as const;
export type ConnectorId = keyof typeof SOURCE_REGISTRY;
export function connectorId(value: string): ConnectorId {
  if (!Object.hasOwn(SOURCE_REGISTRY, value)) throw new Error(`目标来源必须使用注册编号：${Object.keys(SOURCE_REGISTRY).join(", ")}`);
  return value as ConnectorId;
}
