import { useCallback, useContext, useRef, useState } from "react";
import { AgreementModal } from "../../../BUILTIN_COMPONENTs/modal/modal";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { useTranslation } from "../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import {
  clearComputerUseConsentAfter,
  hasValidComputerUseConsent,
  readComputerUseConsent,
  recordComputerUseConsent,
} from "../../../SERVICEs/computer_use_consent_store";
import { disableComputerUse } from "./enable_controller";

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

  const settle = useCallback(async (agreed) => {
    setOpen(false);
    // Claim the resolver before awaiting persistence: AgreementModal can fire
    // onAgree and onClose for one click, and only the first callback may settle
    // the gate.
    const resolve = resolverRef.current;
    resolverRef.current = null;
    if (!resolve) return;

    let record = null;
    if (agreed) {
      record = recordComputerUseConsent();
      try {
        await record?.persistence;
        setConsentRecord(record);
      } catch (_error) {
        // SQL rejected consent: the low-level mirror has already rolled back.
        // Resolve false so enableComputerUse is never reached.
        setConsentRecord(readComputerUseConsent());
        resolve(false);
        return;
      }
    }
    resolve(Boolean(agreed));
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

  const resetConsent = useCallback(async () => {
    // Revoke runtime capability before deleting the authorization record. If
    // either persistence or the sidecar push fails, retaining consent is safer
    // than leaving an already-running sidecar active without authorization.
    const disabling = disableComputerUse();
    const confirmedDisabled = Promise.resolve(disabling).then((disabled) => {
      if (
        !disabled?.pushed ||
        disabled.ok !== true ||
        disabled.enabled !== false
      ) {
        const error = new Error("computer use disable was not confirmed");
        error.code = "computer_use_disable_not_confirmed";
        throw error;
      }
    });
    try {
      // Admit the conditional clear in this same turn. The preference FIFO now
      // represents the whole revoke operation to the quit drain, while the
      // actual consent record remains present until runtime OFF is confirmed.
      await clearComputerUseConsentAfter(confirmedDisabled);
      setConsentRecord(null);
      return true;
    } catch (_error) {
      // Keep the display aligned with the rolled-back SQL mirror.
      setConsentRecord(readComputerUseConsent());
      return false;
    }
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
