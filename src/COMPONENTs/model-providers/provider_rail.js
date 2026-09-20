import { useContext } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import Button from "../../BUILTIN_COMPONENTs/input/button";
import { useTranslation } from "../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { RAIL_KIND } from "./rail_entries";

/**
 * ProviderRail — the left strip of the Model Providers page (#204, design B1).
 *
 * Same region language as the Settings modal's strip: sidebar fill, one
 * hairline on the right, uppercase captions. A row is a full-width BUILTIN
 * Button carrying the brand icon and the title; the B1 status dot sits in
 * front of it (green = usable, hollow = needs a key / service down). Shipped
 * providers follow the native ones under the same caption; user-authored
 * providers get their own "Custom" caption and the Add entry.
 */

const DOT_ON = "var(--pupu-success, #5cc084)";
const DOT_OFF = "var(--pupu-border)";

const RailCaption = ({ children }) => {
  const { theme } = useContext(ConfigContext);
  return (
    <div
      style={{
        fontSize: 10,
        fontFamily: theme?.font?.fontFamily || "inherit",
        textTransform: "uppercase",
        letterSpacing: "1.5px",
        color: "var(--pupu-text)",
        opacity: 0.3,
        padding: "12px 12px 6px",
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
      style={{ position: "relative" }}
    >
      {!isAction && (
        <span
          aria-hidden="true"
          data-testid="provider-rail-dot"
          style={{
            position: "absolute",
            left: 9,
            top: "50%",
            transform: "translateY(-50%)",
            width: 6,
            height: 6,
            borderRadius: "50%",
            backgroundColor: entry.configured ? DOT_ON : DOT_OFF,
            pointerEvents: "none",
          }}
        />
      )}
      <Button
        prefix_icon={entry.icon}
        label={label}
        onClick={() => onSelect(entry.id)}
        ariaLabel={label}
        style={{
          width: "100%",
          justifyContent: "flex-start",
          fontSize: 13,
          opacity: selected ? 1 : isAction ? 0.5 : 0.65,
          padding: isAction ? "7px 10px 7px 10px" : "7px 10px 7px 20px",
          borderRadius: 7,
          iconSize: 16,
          ...(selected
            ? { backgroundColor: "var(--pupu-overlay-active)" }
            : {}),
          /* A long custom display name truncates instead of running under
             the rail's right edge. */
          content: {
            label: {
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            },
          },
        }}
      />
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
        width: 160,
        flexShrink: 0,
        backgroundColor: "var(--pupu-sidebar)",
        borderRight: "1px solid var(--pupu-border)",
        padding: "16px 10px 10px",
        display: "flex",
        flexDirection: "column",
        gap: 2,
        overflowY: "auto",
        boxSizing: "border-box",
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
                entry.kind === RAIL_KIND.ADD_CUSTOM
                  ? t("model_providers.page.add_provider")
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
