import { useContext } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import Button from "../../BUILTIN_COMPONENTs/input/button";
import { useTranslation } from "../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { RAIL_KIND } from "./rail_entries";

/**
 * ProviderRail — the left strip of the Model Providers page (#204, design B1).
 *
 * Strictly the Settings modal's strip (settings_modal_content.js): 140 px,
 * sidebar fill, one hairline on the right, `16px 10px 10px` padding, 2 px
 * gap, 12 px uppercase captions padded `8px 12px 12px`, rows as full-width
 * BUILTIN Buttons at `8px 12px` / radius 7 / 13 px with opacity-only
 * selection (1 vs 0.65) — the project owner wants the Plugins, Models and
 * Settings strips identical. The B1 status dot (green = usable, hollow =
 * needs a key / service down) therefore sits at the row's right edge, inside
 * the Button, so the left padding stays the shared value. Shipped providers
 * follow the native ones under the same caption; user-authored providers get
 * their own "Custom" caption and the Add entry.
 */

const DOT_ON = "var(--pupu-success, #5cc084)";
const DOT_OFF = "var(--pupu-border)";

const RailCaption = ({ children }) => {
  const { theme } = useContext(ConfigContext);
  return (
    <div
      style={{
        fontSize: 12,
        fontFamily: theme?.font?.fontFamily || "inherit",
        textTransform: "uppercase",
        letterSpacing: "1.5px",
        color: "var(--pupu-text)",
        opacity: 0.3,
        padding: "8px 12px 12px",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </div>
  );
};

const RailRow = ({ entry, selected, onSelect, label }) => {
  const isAction = entry.kind === RAIL_KIND.ADD_CUSTOM;
  return (
    <div
      data-testid={`provider-rail-row-${entry.id}`}
      data-selected={selected ? "true" : "false"}
      data-configured={
        entry.configured === null ? "none" : entry.configured ? "true" : "false"
      }
    >
      <Button
        prefix_icon={entry.icon}
        label={label}
        onClick={() => onSelect(entry.id)}
        ariaLabel={label}
        style={{
          width: "100%",
          justifyContent: "flex-start",
          fontSize: 13,
          opacity: selected ? 1 : 0.65,
          padding: "8px 12px",
          borderRadius: 7,
          iconSize: 16,
          content: {
            /* A long custom display name truncates instead of running under
               the rail's right edge. */
            label: {
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            },
            children: { marginLeft: "auto", display: "flex", alignItems: "center" },
          },
        }}
      >
        {!isAction && (
          <span
            aria-hidden="true"
            data-testid="provider-rail-dot"
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              backgroundColor: entry.configured ? DOT_ON : DOT_OFF,
              flex: "none",
            }}
          />
        )}
      </Button>
    </div>
  );
};

export const ProviderRail = ({ entries, selectedId, onSelect }) => {
  const { t } = useTranslation();

  const providers = entries.filter(
    (e) => e.kind !== RAIL_KIND.CUSTOM && e.kind !== RAIL_KIND.ADD_CUSTOM,
  );
  const custom = entries.filter(
    (e) => e.kind === RAIL_KIND.CUSTOM || e.kind === RAIL_KIND.ADD_CUSTOM,
  );

  return (
    <div
      data-testid="provider-rail"
      className="scrollable"
      style={{
        position: "relative",
        width: 140,
        flexShrink: 0,
        backgroundColor: "var(--pupu-sidebar)",
        borderRight: "1px solid var(--pupu-border)",
        padding: "16px 10px 10px",
        display: "flex",
        flexDirection: "column",
        gap: 2,
        overflowY: "auto",
        /* content-box, like the Settings strip: 140 + 10 + 10 padding + the
           hairline = 161 px rendered. Declaring border-box here made the
           rail 21 px narrower than Settings' while claiming the same
           width. */
      }}
    >
      <RailCaption>{t("model_providers.page.rail_providers")}</RailCaption>
      {providers.map((entry) => (
        <RailRow
          key={entry.id}
          entry={entry}
          selected={entry.id === selectedId}
          onSelect={onSelect}
          label={entry.title}
        />
      ))}
      {custom.length > 0 && (
        <>
          <RailCaption>{t("model_providers.page.rail_custom")}</RailCaption>
          {custom.map((entry) => (
            <RailRow
              key={entry.id}
              entry={entry}
              selected={entry.id === selectedId}
              onSelect={onSelect}
              label={
                /* "Add" — the Custom caption above already says what; the
                   140 px strip has no room for "Add provider". */
                entry.kind === RAIL_KIND.ADD_CUSTOM
                  ? t("model_providers.custom.add")
                  : entry.title
              }
            />
          ))}
        </>
      )}
    </div>
  );
};

export default ProviderRail;
