import React, { useId, useState } from "react";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import VariableSettings from "./variable_settings";
import MissingPolicySelect from "./missing_policy_select";
import { removeButtonStyle } from "./panel_style";

/* A variable row's "what if nothing arrives", for the nodes that keep it.
 *
 * An Agent, Start and End always read null when a value is missing, so their
 * rows carry no policy. Every other node stores one (`error` by default) and
 * its row keeps the control: a quiet "more" beside the row's ×, opening the
 * same policy editor the old row held, under the row. Presentation only — the
 * policy is read from and written to the binding exactly as before. */
export default function usePillMissingPolicy({ binding, onChange, isDark, hidden, testid }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const settingsId = useId();
  if (hidden) return { action: null, settings: null };
  const action = (
    <Button prefix_icon="more" ariaLabel={`${binding?.name || t("agents.io.input_variables")} · ${t("agents.missing.if_missing")}`}
      dom_props={{ "aria-expanded": expanded, "aria-controls": settingsId }}
      onClick={() => setExpanded(!expanded)}
      style={{ ...removeButtonStyle(isDark), marginRight: 2 }} />
  );
  const settings = (
    <VariableSettings id={settingsId} testid={`${testid}-settings`} expanded={expanded} isDark={isDark} footer={null}>
      <div style={{ padding: "0 10px 6px 11px", minWidth: 0 }}>
        <MissingPolicySelect binding={binding} onChange={onChange} isDark={isDark} labelWidth={64} />
      </div>
    </VariableSettings>
  );
  return { action, settings };
}
