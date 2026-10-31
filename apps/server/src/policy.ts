import { setting } from "./config-store.js";
export const policy = {
  get upload_limit_mb() {
    return Number(setting("DREAMATIC_UPLOAD_LIMIT_MB"));
  },
  get max_fetch_bytes() {
    return Number(setting("DREAMATIC_MAX_FETCH_BYTES"));
  },
  get max_stage_minutes() {
    return Number(setting("DREAMATIC_STAGE_TIMEOUT_MINUTES"));
  },
  get retries() {
    return Number(setting("DREAMATIC_RETRY_ATTEMPTS"));
  },
};
