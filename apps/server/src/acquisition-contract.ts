import { Type } from "typebox";
/** File and statistical-slice inputs are distinct so required years cannot disappear. */
const identity = {
  task_id: Type.String(), candidate_id: Type.String({pattern:"^C-[a-f0-9]{20}$",description:"Stable candidate ID from search_sources or verify_official_record; copy exactly."}), rationale: Type.String({ minLength: 10 }),
  retry: Type.Optional(Type.Boolean()),
};
export const datasetRequestSchema = Type.Union([
  Type.Object({ ...identity,
    country: Type.String({ pattern: "^[A-Za-z0-9_-]+(?:;[A-Za-z0-9_-]+)*$", description: "Provider geography code: World Bank WLD/CHN/USA or CHN;USA; WHO CHN; Eurostat DE; UN SDG numeric M49 such as 156." }),
    from: Type.String({ pattern: "^[0-9]{4}$", description: "Start YEAR, e.g. 2019. Never a source name such as worldbank." }),
    to: Type.String({ pattern: "^[0-9]{4}$", description: "End YEAR, e.g. 2024. Both from and to are mandatory for an indicator slice." }),
    filters: Type.Optional(Type.Record(Type.String(), Type.String(), { description: "Additional dimension filters only for Eurostat. Do not put dates here." })),
  }, { additionalProperties: false }),
  Type.Object({ ...identity,
    file: Type.String({ minLength: 1, description: "Exact filename from inspect_dataset; repository file acquisition only." }),
    upstream_url: Type.Optional(Type.String()),
  }, { additionalProperties: false }),
]);
