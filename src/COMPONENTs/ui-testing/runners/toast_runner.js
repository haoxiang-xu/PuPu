import { useCallback, useContext, useRef, useState } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import useAsyncAction from "../../../BUILTIN_COMPONENTs/mini_react/use_async_action";
import { toast } from "../../../SERVICEs/toast";
import { ERROR_SCENARIO_GROUPS } from "../scenarios/toast_error_scenarios";

const MONO_FONT = "SF Mono, Menlo, Consolas, monospace";

const makeTokens = (isDark) => ({
  text: isDark ? "rgba(255,255,255,0.86)" : "rgba(0,0,0,0.78)",
  muted: isDark ? "rgba(255,255,255,0.48)" : "rgba(0,0,0,0.46)",
  faint: isDark ? "rgba(255,255,255,0.30)" : "rgba(0,0,0,0.30)",
  panel: isDark ? "rgba(255,255,255,0.045)" : "rgba(255,255,255,0.72)",
  border: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
  divider: isDark ? "rgba(255,255,255,0.055)" : "rgba(0,0,0,0.05)",
  hover: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.025)",
});

const compactButtonStyle = (tokens) => ({
  root: {
    fontSize: 12.5,
    color: tokens.text,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 6,
    border: `1px solid ${tokens.border}`,
    background: "transparent",
    flex: "none",
  },
});

/* ── section shell ─────────────────────────────────────────────────── */

const Section = ({ title, hint, tokens, children }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 10,
        padding: "0 2px",
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: tokens.faint,
          userSelect: "none",
        }}
      >
        {title}
      </span>
      {hint ? (
        <span style={{ fontSize: 11.5, color: tokens.faint }}>{hint}</span>
      ) : null}
    </div>
    <div
      style={{
        borderRadius: 8,
        border: `1px solid ${tokens.border}`,
        background: tokens.panel,
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  </div>
);

/* ── scenario rows ─────────────────────────────────────────────────── */

const ScenarioRowShell = ({ scenario, tokens, first, children }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "10px 14px",
        borderTop: first ? "none" : `1px solid ${tokens.divider}`,
        background: hovered ? tokens.hover : "transparent",
        transition: "background 0.15s",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{ fontSize: 13, fontWeight: 500, color: tokens.text }}
          >
            {scenario.name}
          </span>
          <span
            style={{
              fontSize: 10.5,
              fontFamily: MONO_FONT,
              color: tokens.faint,
            }}
          >
            {scenario.source}
          </span>
        </div>
        <div style={{ fontSize: 12, marginTop: 2, color: tokens.muted }}>
          {scenario.note}
        </div>
      </div>
      {children}
    </div>
  );
};

const DirectScenarioRow = ({ scenario, tokens, first, onFired }) => (
  <ScenarioRowShell scenario={scenario} tokens={tokens} first={first}>
    <Button
      label="Run"
      ariaLabel={scenario.name}
      onClick={() => {
        scenario.fire();
        onFired(scenario.name);
      }}
      style={compactButtonStyle(tokens)}
    />
  </ScenarioRowShell>
);

const AsyncScenarioRow = ({ scenario, tokens, first, onFired }) => {
  /* the real reporting path: useAsyncAction's fallback (or its
     AbortError suppression) decides whether a toast appears */
  const { run } = useAsyncAction(
    useCallback(
      async () => {
        throw scenario.makeError();
      },
      [scenario],
    ),
    { label: scenario.label, pendingDelayMs: 0 },
  );

  return (
    <ScenarioRowShell scenario={scenario} tokens={tokens} first={first}>
      <Button
        label="Run"
        ariaLabel={scenario.name}
        onClick={() => {
          run();
          onFired(scenario.name);
        }}
        style={compactButtonStyle(tokens)}
      />
    </ScenarioRowShell>
  );
};

/* ── runner ────────────────────────────────────────────────────────── */

const ToastRunner = () => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const tokens = makeTokens(isDark);

  const seqRef = useRef(0);
  const loadingIdRef = useRef(null);
  const [lastAction, setLastAction] = useState("Idle");

  const nextKey = (name) => {
    seqRef.current += 1;
    return `ui-testing:toast:${name}:${seqRef.current}`;
  };

  const fireVariant = (type, message, description) => {
    toast[type](message, { description, dedupeKey: nextKey(type) });
    setLastAction(message);
  };

  const fireBurst = () => {
    for (let i = 1; i <= 5; i += 1) {
      toast.info(`Stacked toast ${i}/5`, {
        description: "Overflow collapses into “+N more”.",
        dedupeKey: nextKey(`burst-${i}`),
      });
    }
    setLastAction("Burst ×5");
  };

  const startLoading = () => {
    loadingIdRef.current = toast.loading("Preparing workspace", {
      description: "Persistent until resolved or dismissed.",
      dedupeKey: nextKey("loading"),
    });
    setLastAction("Loading");
  };

  const settleLoading = (ok) => {
    const id = loadingIdRef.current;
    if (!id) return;
    toast.update(id, {
      type: ok ? "success" : "error",
      variant: ok ? "success" : "error",
      title: ok ? "Workspace ready" : "Workspace preparation failed",
      message: ok ? "Workspace ready" : "Workspace preparation failed",
      description: ok
        ? "Updated in place from the loading toast."
        : "The loading toast escalated to a persistent error.",
      duration: ok ? 4000 : Infinity,
    });
    loadingIdRef.current = null;
    setLastAction(ok ? "Resolved" : "Rejected");
  };

  const dismissLoading = () => {
    const id = loadingIdRef.current;
    if (!id) return;
    toast.dismiss(id);
    loadingIdRef.current = null;
    setLastAction("Dismissed");
  };

  return (
    <div
      className="scrollable"
      data-sb-edge="16"
      data-sb-wall="2"
      style={{
        position: "absolute",
        inset: 0,
        overflowY: "auto",
        padding: "52px 44px 40px 244px",
        color: tokens.text,
        fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 640,
          display: "flex",
          flexDirection: "column",
          gap: 22,
        }}
      >
        <div>
          <div style={{ fontSize: 22, lineHeight: 1.2, fontWeight: 600 }}>
            Toast
          </div>
          <div style={{ fontSize: 13, marginTop: 5, color: tokens.muted }}>
            Every variant stacks in one top-center pile — errors persist until
            dismissed, the rest auto-expire.
          </div>
        </div>

        <Section
          title="Variants & stacking"
          hint="fire a few in a row to see the pile"
          tokens={tokens}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              padding: 12,
            }}
          >
            <Button
              label="Success"
              onClick={() =>
                fireVariant("success", "Chat exported", "chat_042.md written to disk.")
              }
              style={compactButtonStyle(tokens)}
            />
            <Button
              label="Info"
              onClick={() =>
                fireVariant("info", "Model switched", "Now chatting with claude-fable-5.")
              }
              style={compactButtonStyle(tokens)}
            />
            <Button
              label="Warning"
              onClick={() =>
                fireVariant(
                  "warning",
                  "Context nearly full",
                  "Older turns will be summarized soon.",
                )
              }
              style={compactButtonStyle(tokens)}
            />
            <Button
              label="Burst ×5"
              onClick={fireBurst}
              style={compactButtonStyle(tokens)}
            />
          </div>
        </Section>

        <Section
          title="Lifecycle"
          hint="one toast updated in place"
          tokens={tokens}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              padding: 12,
            }}
          >
            <Button
              label="Loading"
              onClick={startLoading}
              style={compactButtonStyle(tokens)}
            />
            <Button
              label="Resolve"
              onClick={() => settleLoading(true)}
              style={compactButtonStyle(tokens)}
            />
            <Button
              label="Reject"
              onClick={() => settleLoading(false)}
              style={compactButtonStyle(tokens)}
            />
            <Button
              label="Dismiss"
              onClick={dismissLoading}
              style={compactButtonStyle(tokens)}
            />
          </div>
        </Section>

        {ERROR_SCENARIO_GROUPS.map((group) => (
          <Section
            key={group.key}
            title={group.label}
            hint={
              group.key === "hooks"
                ? "real reporting semantics, not just visuals"
                : "real error shapes, real reporting entry points"
            }
            tokens={tokens}
          >
            {group.scenarios.map((scenario, index) =>
              scenario.via === "useAsyncAction" ? (
                <AsyncScenarioRow
                  key={scenario.key}
                  scenario={scenario}
                  tokens={tokens}
                  first={index === 0}
                  onFired={setLastAction}
                />
              ) : (
                <DirectScenarioRow
                  key={scenario.key}
                  scenario={scenario}
                  tokens={tokens}
                  first={index === 0}
                  onFired={setLastAction}
                />
              ),
            )}
          </Section>
        ))}

        <div style={{ fontSize: 12, color: tokens.faint }}>
          Last: {lastAction}
        </div>
      </div>
    </div>
  );
};

export default ToastRunner;
