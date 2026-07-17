import { useCallback, useContext, useRef, useState } from "react";
import { AgreementModal } from "../../../BUILTIN_COMPONENTs/modal/modal";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { useTranslation } from "../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import {
  clearComputerUseConsent,
  hasValidComputerUseConsent,
  readComputerUseConsent,
  recordComputerUseConsent,
} from "../../../SERVICEs/computer_use_consent_store";

/* ────────────────────────────────────────────────────────────────────────── */
/*  ComputerUseConsentModal                                                    */
/*                                                                             */
/*  The one-time informed-consent dialog required before enabling computer     */
/*  use. It REUSES the shared AgreementModal (no dedicated panel component) —   */
/*  agree = explicit affirmative consent; closing / backdrop / ESC / decline    */
/*  = NOT consent. The six disclosure points live in i18n (computer_use.*).     */
/* ────────────────────────────────────────────────────────────────────────── */

export const CONSENT_POINT_KEYS = [
  "computer_use.consent_point_control",
  "computer_use.consent_point_screenshots",
  "computer_use.consent_point_malicious",
  "computer_use.consent_point_confirm",
  "computer_use.consent_point_revoke",
];

export const ComputerUseConsentModal = ({ open, onAgree, onDecline }) => {
  const { onThemeMode } = useContext(ConfigContext);
  const { t } = useTranslation();
  const isDark = onThemeMode === "dark_mode";

  const message = (
    <div>
      <div style={{ marginBottom: 12 }}>{t("computer_use.consent_intro")}</div>
      <ul
        style={{
          margin: 0,
          paddingLeft: 18,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          color: isDark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.65)",
        }}
      >
        {CONSENT_POINT_KEYS.map((key) => (
          <li key={key} style={{ lineHeight: 1.5 }}>
            {t(key)}
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <AgreementModal
      open={open}
      onClose={onDecline}
      onAgree={onAgree}
      title={t("computer_use.consent_title")}
      message={message}
      agreeLabel={t("computer_use.consent_agree")}
      declineLabel={t("computer_use.consent_decline")}
    />
  );
};

/* ────────────────────────────────────────────────────────────────────────── */
/*  useComputerUseConsent — the gate                                           */
/*                                                                             */
/*  requireComputerUseConsent() returns a Promise<boolean>:                     */
/*    • valid consent on record → resolves true immediately (no modal)          */
/*    • otherwise → opens the modal, resolves true on agree / false on          */
/*      decline / dismiss.                                                       */
/*                                                                             */
/*  RELEASE WIRE-POINT: today there is NO user-writable "enable computer use"   */
/*  switch (the flag is the PUPU_COMPUTER_USE env var; C2 kept flag-write out    */
/*  of v1, C3 is read-only). When the real enable path lands (the separately    */
/*  tracked pre-release enablement work), its switch handler should do:         */
/*      if (await requireComputerUseConsent()) { ...enable... }                 */
/*  and only flip the flag / write sidecar config when it resolves true. Until   */
/*  then this gate is exercised via the dev entry in the Computer Use panel.     */
/* ────────────────────────────────────────────────────────────────────────── */

export const useComputerUseConsent = () => {
  const [open, setOpen] = useState(false);
  const [consentRecord, setConsentRecord] = useState(() =>
    readComputerUseConsent(),
  );
  const resolverRef = useRef(null);

  const settle = useCallback((agreed) => {
    setOpen(false);
    let record = null;
    if (agreed) {
      record = recordComputerUseConsent();
      setConsentRecord(record);
    }
    // Guard against AgreementModal firing both onAgree and onClose on agree:
    // whoever settles first clears the resolver; the follow-up is a no-op.
    const resolve = resolverRef.current;
    resolverRef.current = null;
    if (resolve) resolve(Boolean(agreed));
  }, []);

  const requireComputerUseConsent = useCallback(() => {
    if (hasValidComputerUseConsent()) {
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setOpen(true);
    });
  }, []);

  const resetConsent = useCallback(() => {
    clearComputerUseConsent();
    setConsentRecord(null);
  }, []);

  const consentModal = (
    <ComputerUseConsentModal
      open={open}
      onAgree={() => settle(true)}
      onDecline={() => settle(false)}
    />
  );

  return {
    requireComputerUseConsent,
    resetConsent,
    consentRecord,
    consentModal,
  };
};
