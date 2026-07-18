import { useEffect, useId, useState } from "react";

import Icon from "../../../BUILTIN_COMPONENTs/icon/icon";
import { getCommand } from "../../../SERVICEs/command_registry";

/*
 * S2 — command-expansion bubble rendering.
 *
 * Renders the user bubble body when it carries a valid `composer` sidecar
 * (see docs/superpowers/specs/2026-07-18-composer-sidecar-contract.md):
 *   ① green command chips  ② collapsible template panel  ③ user body text.
 *
 * This surface is a PURE CONSUMER of the composer sidecar. It never writes it,
 * never sends it to the model/history/backend, and never drives the stream.
 * `parseComposer` is the atomic §4 gate: any malformed/out-of-bounds member →
 * returns null → caller falls back to the permanent baseline `<span>{content}>`.
 */

// S2-internal render constant (contract §135 allows S2 self-determination).
const COLLAPSE_MIN_LINES = 4; // templateLineCount > 3 collapses.

/**
 * Atomic validation + slicing of the composer sidecar. Returns null for every
 * invalid/missing case (fail-open to baseline — contract §4). Never throws.
 */
export const parseComposer = (message) => {
  const composer = message && message.composer;
  if (!composer || typeof composer !== "object") return null;

  // §1.1 version gate — only v:1 is understood.
  if (composer.v !== 1) return null;

  // §1.2 rawText — must be a non-empty string.
  if (typeof composer.rawText !== "string" || composer.rawText === "") return null;

  // §1.3 commands — non-empty array, each element carries string name +
  // string sourceToolkitId.
  const commands = composer.commands;
  if (!Array.isArray(commands) || commands.length === 0) return null;
  for (const cmd of commands) {
    if (!cmd || typeof cmd.name !== "string" || !cmd.name) return null;
    if (typeof cmd.sourceToolkitId !== "string") return null;
  }

  // content must be a string to slice against (integrity guard).
  if (typeof message.content !== "string") return null;
  const content = message.content;

  // §1.4 templateLength — integer, 0 ≤ templateLength ≤ content.length.
  const templateLength = composer.templateLength;
  if (
    typeof templateLength !== "number" ||
    !Number.isInteger(templateLength) ||
    templateLength < 0 ||
    templateLength > content.length
  ) {
    return null;
  }

  // §0 derivation (spec §0): slice content, never reverse-infer templateLength.
  const templateText = content.slice(0, templateLength);
  const userBody = content.slice(templateLength).replace(/^\n\n/, "");
  const templateLineCount =
    templateLength > 0 ? templateText.split("\n").length : 0;

  return { commands, templateText, userBody, templateLineCount };
};

/* Resolve a command's live attribution + glyph from the registry. Miss (plugin
 * uninstalled / different owner) → degrade to a plain green chip with no tail,
 * NOT grey (grey would misread as an error). Spec §2.2 / §4. */
const resolveCommand = (rawName, sourceToolkitId) => {
  const displayName = rawName.startsWith("/") ? rawName : `/${rawName}`;
  let attribution = "";
  let icon = "";
  try {
    const def = getCommand(displayName);
    if (def) {
      if (typeof def.icon === "string") icon = def.icon;
      // Only attribute when the currently-registered owner matches the stored
      // one — otherwise the producing plugin is gone / replaced (§1.3).
      if (
        def.sourceLabel &&
        (def.sourceToolkitId || "") === (sourceToolkitId || "")
      ) {
        attribution = def.sourceLabel;
      }
    }
  } catch (e) {
    // fail-open: never let a registry miss break content rendering (§4.5).
  }
  return { displayName, attribution, icon };
};

const CommandChip = ({ command, isDark }) => {
  const { displayName, attribution, icon } = resolveCommand(
    command.name,
    command.sourceToolkitId,
  );

  const nameColor = isDark
    ? "rgba(160,230,180,0.98)"
    : "rgba(25,125,65,0.98)";
  const tailColor = isDark
    ? "rgba(160,230,180,0.70)"
    : "rgba(25,125,65,0.72)";

  const title = attribution ? `${displayName} — from ${attribution}` : displayName;
  const ariaLabel = attribution
    ? `${displayName} command from ${attribution}`
    : `${displayName} command`;

  return (
    <span
      title={title}
      aria-label={ariaLabel}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        maxWidth: "100%",
        padding: "3px 9px",
        borderRadius: 7,
        backgroundColor: isDark
          ? "rgba(120,200,150,0.16)"
          : "rgba(40,150,80,0.13)",
        fontSize: 12.5,
        lineHeight: "16px",
        fontWeight: 500,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {icon ? (
        <span
          aria-hidden="true"
          style={{ width: 14, height: 14, flexShrink: 0, display: "inline-block" }}
        >
          <Icon src={icon} color={nameColor} />
        </span>
      ) : null}
      <span style={{ color: nameColor }}>{displayName}</span>
      {attribution ? (
        <span
          style={{ color: tailColor, fontWeight: 400, userSelect: "none" }}
        >
          {` · ${attribution}`}
        </span>
      ) : null}
    </span>
  );
};

const TemplatePanel = ({ templateText, isDark, theme, panelId, animateIn }) => {
  // Entrance fade (spec §3.5): opacity 0→1 + translateY(-4→0). Zero-measurement
  // constitution — no height:auto animation, no JS layout measurement.
  const [shown, setShown] = useState(!animateIn);
  useEffect(() => {
    if (!animateIn) return undefined;
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [animateIn]);

  return (
    <div
      id={panelId}
      style={{
        marginTop: 6,
        padding: "10px 12px",
        borderRadius: 10,
        maxHeight: 320,
        overflowY: "auto",
        backgroundColor: isDark
          ? "rgba(255,255,255,0.035)"
          : "rgba(0,0,0,0.025)",
        border: isDark
          ? "1px solid rgba(255,255,255,0.10)"
          : "1px solid rgba(0,0,0,0.09)",
        fontFamily:
          (theme && theme.font && theme.font.monospaceFontFamily) ||
          "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 12.5,
        lineHeight: 1.5,
        color: isDark ? "rgba(255,255,255,0.62)" : "rgba(0,0,0,0.60)",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        userSelect: "text",
        opacity: shown ? 1 : 0,
        transform: shown ? "translateY(0)" : "translateY(-4px)",
        transition:
          "opacity 140ms cubic-bezier(0.22,1,0.36,1), transform 140ms cubic-bezier(0.22,1,0.36,1)",
      }}
    >
      {templateText}
    </div>
  );
};

const DisclosureBar = ({
  open,
  onToggle,
  commandCount,
  templateLineCount,
  isDark,
  panelId,
}) => {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [focusVisible, setFocusVisible] = useState(false);

  const plural = commandCount > 1;
  const noun = plural ? "templates" : "template";
  const verb = open ? "Hide" : "Expanded";
  const metric = plural
    ? ` · ${commandCount} commands · ${templateLineCount} lines`
    : ` · ${templateLineCount} lines`;

  const ariaLabel = open
    ? "Hide command template"
    : `Show command template, ${templateLineCount} lines`;

  const handleKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      onToggle();
    }
  };

  const labelColor = isDark ? "rgba(255,255,255,0.60)" : "rgba(0,0,0,0.55)";
  const metricColor = isDark ? "rgba(255,255,255,0.38)" : "rgba(0,0,0,0.38)";

  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={open}
      aria-controls={panelId}
      aria-label={ariaLabel}
      onClick={onToggle}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setPressed(false);
      }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onFocus={(e) => {
        // Only surface the ring for keyboard focus, not mouse clicks.
        if (e.target && typeof e.target.matches === "function") {
          try {
            if (e.target.matches(":focus-visible")) setFocusVisible(true);
          } catch (err) {
            setFocusVisible(true);
          }
        }
      }}
      onBlur={() => setFocusVisible(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        minHeight: 30,
        padding: "0 8px",
        marginTop: 2,
        borderRadius: 8,
        cursor: "pointer",
        userSelect: "none",
        backgroundColor: pressed
          ? isDark
            ? "rgba(255,255,255,0.09)"
            : "rgba(0,0,0,0.07)"
          : hovered
          ? isDark
            ? "rgba(255,255,255,0.06)"
            : "rgba(0,0,0,0.045)"
          : "transparent",
        boxShadow: focusVisible
          ? isDark
            ? "0 0 0 2px rgba(160,230,180,0.45)"
            : "0 0 0 2px rgba(40,150,80,0.35)"
          : "none",
        transition: "background-color 120ms ease",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 14,
          height: 14,
          flexShrink: 0,
          display: "inline-block",
          color: labelColor,
          transform: open ? "rotate(90deg)" : "rotate(0deg)",
          transition: "transform 160ms cubic-bezier(0.22,1,0.36,1)",
        }}
      >
        <Icon src="arrow_right" color="currentColor" />
      </span>
      <span style={{ fontSize: 12, color: labelColor }}>{`${verb} ${noun}`}</span>
      <span style={{ fontSize: 12, color: metricColor }}>{metric}</span>
    </div>
  );
};

const CommandExpansionBody = ({ parts, isDark, theme }) => {
  const { commands, templateText, userBody, templateLineCount } = parts;
  const [open, setOpen] = useState(false);
  const panelId = useId();

  const collapsible = templateLineCount >= COLLAPSE_MIN_LINES;
  const hasShortPanel = templateLineCount > 0 && !collapsible; // 1..3 lines, always open
  const hasPanel = templateLineCount > 0;
  const hasBelowChips = hasPanel || (typeof userBody === "string" && userBody);

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* ① chip row */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          alignItems: "center",
          marginBottom: hasBelowChips ? 6 : 0,
        }}
      >
        {commands.map((command, index) => (
          <CommandChip
            key={`${command.name}-${index}`}
            command={command}
            isDark={isDark}
          />
        ))}
      </div>

      {/* ② collapse segment */}
      {collapsible ? (
        <>
          <DisclosureBar
            open={open}
            onToggle={() => setOpen((v) => !v)}
            commandCount={commands.length}
            templateLineCount={templateLineCount}
            isDark={isDark}
            panelId={panelId}
          />
          {open ? (
            <TemplatePanel
              templateText={templateText}
              isDark={isDark}
              theme={theme}
              panelId={panelId}
              animateIn
            />
          ) : null}
        </>
      ) : hasShortPanel ? (
        <TemplatePanel
          templateText={templateText}
          isDark={isDark}
          theme={theme}
          panelId={panelId}
          animateIn={false}
        />
      ) : null}

      {/* ③ user body — always visible when non-empty */}
      {typeof userBody === "string" && userBody ? (
        <span
          style={{
            marginTop: hasPanel ? 8 : hasBelowChips ? 8 : 0,
            userSelect: "text",
          }}
        >
          {userBody}
        </span>
      ) : null}
    </div>
  );
};

export default CommandExpansionBody;
