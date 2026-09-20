import { useContext } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import Icon from "../../../BUILTIN_COMPONENTs/icon/icon";
import { useTranslation } from "../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { OLLAMA_RAIL_ID, RAIL_KIND } from "../rail_entries";

const OLLAMA_DOWNLOAD_URL = "https://ollama.com/download";

/**
 * WelcomePane — first run (#204, design G3): shown only while no provider is
 * usable. Two paths, no inline key fields (the key control lives in the
 * provider panes and nowhere else): bring a key → pick a provider on the
 * left; run locally → Ollama.
 */
export const WelcomePane = ({ entries, onSelect }) => {
  const { theme } = useContext(ConfigContext);
  const { t } = useTranslation();
  const fontFamily = theme?.font?.fontFamily || "Jost, sans-serif";

  const keyProviders = entries.filter(
    (e) => e.kind === RAIL_KIND.NATIVE || e.kind === RAIL_KIND.SHIPPED,
  );

  const pathTitleStyle = {
    fontSize: 14,
    fontWeight: 600,
    fontFamily: theme?.font?.titleFontFamily || "NunitoSans, sans-serif",
    color: "var(--pupu-text)",
    margin: 0,
  };
  const mutedStyle = {
    fontSize: 12.5,
    fontFamily,
    color: "var(--pupu-text-faint)",
    lineHeight: 1.5,
    margin: 0,
  };
  const actionStyle = {
    fontSize: 12.5,
    fontFamily,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 7,
    alignSelf: "flex-start",
    color: "var(--pupu-text-secondary)",
    hoverBackgroundColor: "var(--pupu-overlay-hover)",
    content: { icon: { width: 13, height: 13 } },
  };

  return (
    <div data-testid="model-providers-welcome">
      <p style={{ ...mutedStyle, margin: "4px 0 18px" }}>
        {t("model_providers.page.welcome_desc")}
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            padding: "4px 24px 4px 0",
            minWidth: 0,
          }}
        >
          <p style={pathTitleStyle}>{t("model_providers.page.path_key_title")}</p>
          <div style={{ display: "flex", gap: 6, opacity: 0.7 }}>
            {keyProviders.map((entry) => (
              <Icon
                key={entry.id}
                src={entry.icon}
                style={{ width: 16, height: 16 }}
              />
            ))}
          </div>
          <p style={mutedStyle}>{t("model_providers.page.path_key_desc")}</p>
          <Button
            label={t("model_providers.page.path_key_action")}
            postfix_icon="arrow_right"
            onClick={() => keyProviders[0] && onSelect(keyProviders[0].id)}
            style={actionStyle}
          />
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            padding: "4px 0 4px 24px",
            borderLeft: "1px solid var(--pupu-border)",
            minWidth: 0,
          }}
        >
          <p style={pathTitleStyle}>{t("model_providers.page.path_local_title")}</p>
          <div style={{ display: "flex", gap: 6, opacity: 0.7 }}>
            <Icon src="ollama" style={{ width: 16, height: 16 }} />
          </div>
          <p style={mutedStyle}>{t("model_providers.page.path_local_desc")}</p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Button
              label={t("model_providers.page.path_local_action")}
              prefix_icon="download"
              onClick={() => {
                if (typeof window !== "undefined" && typeof window.open === "function") {
                  window.open(OLLAMA_DOWNLOAD_URL, "_blank", "noopener");
                }
              }}
              style={{ ...actionStyle, backgroundColor: "var(--pupu-overlay-active)" }}
            />
            <Button
              label={t("model_providers.page.path_local_open")}
              onClick={() => onSelect(OLLAMA_RAIL_ID)}
              style={actionStyle}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default WelcomePane;
