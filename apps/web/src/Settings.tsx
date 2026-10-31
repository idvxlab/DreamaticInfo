import { resolveModels } from "../../../packages/shared/model-settings";
import { roles } from "../../../packages/shared/types";
import { Save, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { RuntimeConfig } from "../../../packages/shared/config";
import { api } from "./api";
interface SettingsModalProps {
  initial: RuntimeConfig;
  onClose: () => void;
  onSave: (config: {
    values: Record<string, string>;
    secrets: Record<string, string>;
  }) => Promise<RuntimeConfig>;
}
export function SettingsModal({
  initial,
  onClose,
  onSave,
}: SettingsModalProps) {
  const t = (text: string) =>
    ({
      Settings: "设置",
      "Read and save the project .env configuration":
        "读取并保存项目 .env 配置",
      "Close settings": "关闭设置",
      "The configuration file has changes waiting to be applied. Save to apply them.":
        "配置文件中有尚未应用的更改；重启项需重启服务后生效。",
      "Changes apply automatically after saving, including to existing conversations.":
        "保存后运行配置自动生效；端口与工作目录需重启服务。",
      "Configuration modules": "配置模块",
      "Configured; leave blank to keep": "已配置；留空保留",
      "Not configured separately": "尚未单独配置",
      "Restart required": "重启后生效",
      "Leave blank to keep the current key": "留空保留当前密钥",
      "Automatic / default": "自动 / 默认",
      "Example:": "示例：",
      Advanced: "高级选项",
      "Optional overrides. Leave unchanged to use the default configuration.":
        "可选覆盖项。留空继承默认连接与模型；密钥留空保留当前配置。",
      Cancel: "取消",
      "Saving…": "保存中…",
      "Save configuration": "保存配置",
      "Could not save configuration": "无法保存配置",
    })[text] || text;
  const [values, setValues] = useState(initial.values);
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [module, setModule] = useState(initial.modules[0]!.id);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false),
    [error, setError] = useState<string>();
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    dialog.current?.querySelector<HTMLButtonElement>('[role="tab"]')?.focus();
  }, []);
  async function submit() {
    setSaving(true);
    setError(undefined);
    try {
      const saved = await onSave({
        values: Object.fromEntries(
          Object.entries(values).filter(
            ([key, value]) => value !== initial.values[key],
          ),
        ),
        secrets,
      });
      setValues(saved.values);
      setSecrets({});
      setNotice(
        saved.restartRequired.length
          ? "已写入 .env。端口或工作目录更改将在重启服务后生效。"
          : "配置已保存到 .env，并已应用。",
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? t(reason.message)
          : t("Could not save configuration"),
      );
    } finally {
      setSaving(false);
    }
  }
  const effectiveModels = resolveModels(values);
  const fields = initial.fields.filter((field) => field.module === module);
  const activeModule = initial.modules.find((item) => item.id === module)!;
  const basicFields = fields.filter((field) => !field.advanced);
  const advancedFields = fields.filter((field) => field.advanced);
  const renderFields = (selected: RuntimeConfig["fields"]) =>
    selected.map((field) => {
      const secret = field.type === "secret",
        value = (secret ? secrets[field.key] : values[field.key]) ?? "";
      const update = (next: string) => {
        setNotice("");
        return secret
          ? setSecrets((current) => ({ ...current, [field.key]: next }))
          : setValues((current) => ({ ...current, [field.key]: next }));
      };
      return (
        <label key={field.key}>
          <span>
            {t(field.label)}
            {secret && (
              <em>
                {initial.secretConfigured[field.key]
                  ? t("Configured; leave blank to keep")
                  : t("Not configured separately")}
              </em>
            )}
            {field.restartRequired && <em>{t("Restart required")}</em>}
          </span>
          <code className="config-env-key">{field.key}</code>
          {field.options ? (
            <select
              aria-label={t(field.label)}
              value={value}
              disabled={saving}
              onChange={(event) => update(event.target.value)}
            >
              {(field.options.includes(value)
                ? field.options
                : [value, ...field.options]
              ).map((option) => (
                <option key={option} value={option}>
                  {t(option) || t("Automatic / default")}
                </option>
              ))}
            </select>
          ) : (
            <input
              aria-label={t(field.label)}
              type={
                secret
                  ? "password"
                  : field.type === "number"
                    ? "number"
                    : "text"
              }
              value={value}
              disabled={saving}
              min={field.min}
              max={field.max}
              step={field.type === "number" ? 1 : undefined}
              placeholder={
                secret
                  ? t("Leave blank to keep the current key")
                  : field.example
              }
              autoComplete={secret ? "new-password" : "off"}
              onChange={(event) => update(event.target.value)}
            />
          )}
          <small className="config-example">
            {t("Example:")} <code>{field.example}</code>
          </small>
          {field.description && (
            <small className="config-help">{t(field.description)}</small>
          )}
        </label>
      );
    });
  return (
    <div
      className="modal-backdrop config-backdrop"
      role="presentation"
      onMouseDown={() => {
        if (!saving) onClose();
      }}
    >
      <section
        ref={dialog}
        className="settings-modal config-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !saving) onClose();
          if (event.key === "Tab") {
            const controls = [
              ...dialog.current!.querySelectorAll<HTMLElement>(
                'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"], summary',
              ),
            ].filter((control) => control.getClientRects().length > 0);
            const first = controls[0],
              last = controls.at(-1);
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <header>
          <div className="settings-icon">
            <SlidersHorizontal size={17} />
          </div>
          <span>
            <strong id="settings-title">{t("Settings")}</strong>
            <small>{t("Read and save the project .env configuration")}</small>
          </span>
          <button
            type="button"
            title={t("Close settings")}
            aria-label={t("Close settings")}
            disabled={saving}
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </header>
        <div className="config-source">
          <code title={initial.envPath}>{initial.envPath}</code>
          <span>
            {t(
              initial.pendingApply
                ? "The configuration file has changes waiting to be applied. Save to apply them."
                : "Changes apply automatically after saving, including to existing conversations.",
            )}
          </span>
        </div>
        <div
          className="config-tabs"
          role="tablist"
          aria-label={t("Configuration modules")}
        >
          {initial.modules.map((item, index) => (
            <button
              type="button"
              key={item.id}
              id={`config-tab-${item.id}`}
              role="tab"
              aria-selected={module === item.id}
              aria-controls={`config-panel-${item.id}`}
              tabIndex={module === item.id ? 0 : -1}
              onClick={() => setModule(item.id)}
              onKeyDown={(event) => {
                if (
                  ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
                ) {
                  event.preventDefault();
                  const next =
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? initial.modules.length - 1
                        : (index +
                            (event.key === "ArrowRight" ? 1 : -1) +
                            initial.modules.length) %
                          initial.modules.length;
                  setModule(initial.modules[next]!.id);
                  dialog.current
                    ?.querySelector<HTMLButtonElement>(
                      `#config-tab-${initial.modules[next]!.id}`,
                    )
                    ?.focus();
                }
              }}
            >
              {t(item.title)}
            </button>
          ))}
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div
            className="config-form"
            role="tabpanel"
            id={`config-panel-${module}`}
            aria-labelledby={`config-tab-${module}`}
          >
            <p className="config-module-description">
              {t(activeModule.description)}
            </p>
            {renderFields(basicFields)}
            {module === "reasoning" && (
              <section
                className="config-effective-models"
                aria-label="智能体实际使用的连接"
              >
                <strong>智能体实际使用的连接</strong>
                <p>角色覆盖优先于默认配置。下列内容随表单变化，保存后生效。</p>
                {roles.map((role) => {
                  const suffix = role.toUpperCase(),
                    model = effectiveModels[role],
                    custom = model.provider.startsWith("dreamatic-info-");
                  const override = !!(
                    values[`DREAMATIC_PROVIDER_${suffix}`] ||
                    values[`DREAMATIC_MODEL_${suffix}`] ||
                    values[`DREAMATIC_BASE_URL_${suffix}`]
                  );
                  return (
                    <div key={role}>
                      <b>
                        {role === "chatbot"
                          ? "ChatBot"
                          : role[0].toUpperCase() + role.slice(1)}
                      </b>
                      <span>
                        {custom ? "兼容 API" : model.provider} / {model.model}
                        <small>
                          {custom
                            ? values[`DREAMATIC_BASE_URL_${suffix}`] ||
                              values.DREAMATIC_BASE_URL
                            : "Pi 原生提供商"}
                        </small>
                      </span>
                      <em>{override ? "独立覆盖" : "继承默认"}</em>
                      {override && (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => {
                            setValues((current) => ({
                              ...current,
                              [`DREAMATIC_PROVIDER_${suffix}`]: "",
                              [`DREAMATIC_MODEL_${suffix}`]: "",
                              [`DREAMATIC_BASE_URL_${suffix}`]: "",
                              [`DREAMATIC_THINKING_LEVEL_${suffix}`]: "",
                            }));
                            setNotice(
                              "已恢复默认连接与模型，请保存配置。已有独立密钥保持不变。",
                            );
                          }}
                        >
                          使用默认
                        </button>
                      )}
                    </div>
                  );
                })}
              </section>
            )}

            {advancedFields.length > 0 && (
              <details key={module} className="config-advanced">
                <summary>{t("Advanced")}</summary>
                <p className="config-help">
                  {t(
                    "Optional overrides. Leave unchanged to use the default configuration.",
                  )}
                </p>
                <div className="config-advanced-fields">
                  {renderFields(advancedFields)}
                </div>
              </details>
            )}
          </div>
          {notice && (
            <p className="config-notice" role="status">
              {notice}
            </p>
          )}
          {error && (
            <p className="config-error" role="alert">
              {error}
            </p>
          )}
          <footer>
            <button type="button" disabled={saving} onClick={onClose}>
              {t("Cancel")}
            </button>
            <button type="submit" className="primary" disabled={saving}>
              <Save size={14} />
              {saving ? t("Saving…") : t("Save configuration")}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

export default function Settings({ onClose }: { onClose: () => void }) {
  const [config, setConfig] = useState<RuntimeConfig | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    api<RuntimeConfig>("/settings", { signal: controller.signal })
      .then(setConfig)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, []);
  if (!config)
    return (
      <div className="modal-backdrop config-backdrop">
        <section
          className="settings-modal config-modal"
          role="dialog"
          aria-modal="true"
          aria-label="设置"
        >
          <header>
            <div className="settings-icon">
              <SlidersHorizontal size={17} />
            </div>
            <span>
              <strong>设置</strong>
              <small>{error || "正在读取项目配置…"}</small>
            </span>
            <button aria-label="关闭设置" onClick={onClose}>
              <X size={16} />
            </button>
          </header>
        </section>
      </div>
    );
  return (
    <SettingsModal
      initial={config}
      onClose={onClose}
      onSave={async (input) => {
        const next = await api<RuntimeConfig>("/settings", {
          method: "PUT",
          body: JSON.stringify(input),
        });
        setConfig(next);
        return next;
      }}
    />
  );
}
