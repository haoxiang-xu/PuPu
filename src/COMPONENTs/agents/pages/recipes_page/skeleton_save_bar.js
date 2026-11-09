import { agentProblemMessage } from "./agents_i18n";
import { useTranslation } from "../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import React from "react";
import Button from "../../../../BUILTIN_COMPONENTs/input/button";
import {
  SESSION_STATUS,
  can_preflight,
  can_save,
  conflict_message,
  preflight_message,
} from "./skeleton_resource_session";

/* Saving, and what to do when someone else got there first.
 *
 * A conflict is not offered as "retry". Retrying at the same token fails
 * identically, and retrying at the newer one replaces the other person's work
 * without anyone seeing it happen. The two honest choices are named for what
 * they do, and both are explicit. */

const BAR = (isDark) => ({
  display: "flex",
  flexDirection: "column",
  gap: 6,
  padding: "8px 10px",
  borderRadius: 7,
  background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.025)",
});

const NOTE = { fontSize: 10.5, lineHeight: 1.45, color: "#86868b" };

const CONFLICT_BOX = (isDark) => ({
  display: "flex",
  flexDirection: "column",
  gap: 6,
  padding: "8px 10px",
  borderRadius: 7,
  background: isDark ? "rgba(120,90,20,0.22)" : "rgba(255,244,214,0.9)",
  border: isDark
    ? "1px solid rgba(220,180,80,0.28)"
    : "1px solid rgba(190,150,40,0.25)",
});

export default function SkeletonSaveBar({
  session,
  isDark,
  onSave,
  onKeepMine,
  onTakeTheirs,
  onPreflight,
}) {
  const { t } = useTranslation();
  if (!session || session.status === SESSION_STATUS.EMPTY) return null;

  if (session.status === SESSION_STATUS.UNAVAILABLE) {
    return (
      <div data-testid="skeleton-store-unavailable" style={BAR(isDark)}>
        <span style={NOTE}>
          {t("agents.save.store_unavailable")}
        </span>
      </div>
    );
  }

  const conflict = conflict_message(session, t);
  const preflight = preflight_message(session, t);

  return (
    <div data-testid="skeleton-save-bar" style={BAR(isDark)}>
      {conflict && (
        <div data-testid="skeleton-save-conflict" style={CONFLICT_BOX(isDark)}>
          <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: 0.3 }}>
            {t("agents.save.saved_elsewhere")}
          </span>
          <span style={{ fontSize: 10.5, lineHeight: 1.45 }}>{conflict}</span>
          <div style={{ display: "flex", gap: 6 }}>
            <Button
              label={t("agents.save.look_at_theirs")}
              onClick={onTakeTheirs}
              style={{
                fontSize: 11,
                paddingVertical: 3,
                paddingHorizontal: 8,
                borderRadius: 5,
              }}
            />
            <Button
              label={t("agents.save.keep_mine")}
              onClick={onKeepMine}
              style={{
                fontSize: 11,
                paddingVertical: 3,
                paddingHorizontal: 8,
                borderRadius: 5,
                color: "#4a5bd8",
              }}
            />
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Button
          label={session.saving ? t("agents.save.saving") : t("agents.save.save")}
          onClick={onSave}
          disabled={!can_save(session)}
          style={{
            fontSize: 11.5,
            paddingVertical: 4,
            paddingHorizontal: 10,
            borderRadius: 5,
            color: can_save(session) ? "#4a5bd8" : undefined,
          }}
        />
        <Button
          label={t("agents.save.check_can_run")}
          onClick={onPreflight}
          disabled={!can_preflight(session)}
          style={{
            fontSize: 11.5,
            paddingVertical: 4,
            paddingHorizontal: 10,
            borderRadius: 5,
          }}
        />
        <span data-testid="skeleton-save-state" style={{ ...NOTE, marginLeft: "auto" }}>
          {session.dirty ? t("agents.save.unsaved_changes") : t("agents.save.saved")}
        </span>
      </div>

      {!session.dirty || session.conflict ? null : (
        <span style={NOTE}>
          {t("agents.save.save_before_check")}
        </span>
      )}

      {preflight && (
        <span data-testid="skeleton-preflight-state" style={NOTE}>
          {preflight}
        </span>
      )}

      {session.error && (
        <span
          data-testid="skeleton-save-error"
          style={{
            fontSize: 10.5,
            lineHeight: 1.45,
            color: isDark ? "rgba(255,140,140,0.95)" : "rgba(176,32,32,0.95)",
          }}
        >
          {agentProblemMessage(session.error, t) || session.error.code}
        </span>
      )}
    </div>
  );
}
