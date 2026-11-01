import React, { useEffect, useRef } from "react";
import Button from "../../../../BUILTIN_COMPONENTs/input/button";
import { ControlPopover } from "./canvas_chrome";
import { can_preflight, preflight_message } from "./skeleton_resource_session";

/* Run, in the control center (menu C of the unified design).
 *
 * Running from the builder is not wired yet — a native Agent runs from chat —
 * so this menu does what can be done today and says plainly what cannot: it
 * checks whether the saved version can run, says why not, and keeps the run
 * itself in place, disabled, with the reason beside it. A button that is drawn
 * and does nothing would claim a feature this build does not have.
 *
 * Opening the menu is the question "can it run?", so it asks the store once
 * when nothing current answers it. A check answers about the SAVED version,
 * so with unsaved edits it says to save first instead of answering about a
 * document the author is no longer looking at. */

export const RUN_UNAVAILABLE = "Running from here is not available yet. Start a chat with this Agent to run it.";

export function RunTrigger({ open, onToggle }) {
  return (
    <Button
      label="Run"
      prefix_icon="play"
      ariaLabel="Open the run menu"
      onClick={onToggle}
      style={{
        fontSize: 12,
        paddingVertical: 5,
        paddingHorizontal: 12,
        borderRadius: 7,
        backgroundColor: "#4a5bd8",
        hoverBackgroundColor: "#3f4fc4",
        color: "#fff",
        opacity: open ? 0.85 : 1,
        content: { icon: { width: 11, height: 11 } },
      }}
    />
  );
}

export default function SkeletonRunMenu({ session, isDark, onCheck }) {
  /* Asked once per saved version this menu has been open for: a save while
     it is open is a new version, and the answer on screen is about the old. */
  const asked = useRef(null);
  const checkable = can_preflight(session);
  const answer = preflight_message(session);
  const saved_version = `${session.open_id}:${session.edit_token}`;
  useEffect(() => {
    if (asked.current === saved_version || !checkable || session.preflight) return;
    asked.current = saved_version;
    onCheck();
  }, [checkable, saved_version, session.preflight, onCheck]);

  const muted = "#86868b";
  const title = session.document && session.document.kind === "workflow" ? "Run this workflow" : "Run this Agent";
  return (
    <ControlPopover isDark={isDark} testId="skeleton-run-menu">
      <span style={{ fontSize: 12, fontWeight: 600 }}>{title}</span>
      {session.dirty && !session.conflict ? (
        <span data-testid="skeleton-run-save-first" style={{ fontSize: 11, lineHeight: 1.45, color: muted }}>
          Checking it can run asks the saved version, so save first.
        </span>
      ) : answer ? (
        <span data-testid="skeleton-preflight-state" style={{ fontSize: 11, lineHeight: 1.45 }}>
          {answer}
        </span>
      ) : (
        <span style={{ fontSize: 11, lineHeight: 1.45, color: muted }}>
          {checkable ? "Checking…" : "Not checked yet."}
        </span>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Button
          label="Check it can run"
          onClick={onCheck}
          disabled={!checkable}
          style={{ fontSize: 11.5, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6 }}
        />
      </div>
      <div style={{ height: 1, backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span data-testid="skeleton-run-unavailable" style={{ flex: 1, fontSize: 11, lineHeight: 1.45, color: muted }}>
          {RUN_UNAVAILABLE}
        </span>
        <Button
          label="Run"
          prefix_icon="play"
          disabled
          style={{
            fontSize: 12,
            paddingVertical: 5,
            paddingHorizontal: 12,
            borderRadius: 7,
            opacity: 0.4,
            content: { icon: { width: 11, height: 11 } },
          }}
        />
      </div>
    </ControlPopover>
  );
}
