import React from "react";
import Select from "../../../../../BUILTIN_COMPONENTs/select/select";
import Input from "../../../../../BUILTIN_COMPONENTs/input/input";
import { safe_text } from "../document_values";
import {
  MISSING_POLICIES,
  binding_default,
  missing_policy,
  with_missing_policy,
} from "../skeleton_io";

/* What a binding does when its upstream value is not there.
 *
 * The control names the behaviour, because the policy is about absence and not
 * about the value: choosing "fail" does not forbid an explicit null — a
 * resolved null is a value and passes — and a default is substituted only when
 * nothing arrives, not when null does. Labelling these "Required" and
 * "Nullable" would read as a type constraint and be wrong in both cases.
 *
 * Changing the policy rebuilds the binding rather than assigning onto it: a
 * `default` left beside another policy is an unknown field, and the runtime
 * rejects the whole document for it. */

const CAPTION = {
  fontSize: 10.5,
  lineHeight: 1.45,
  color: "#86868b",
};

export default function MissingPolicySelect({ binding, onChange, isDark }) {
  const value = binding && binding.missing;
  const chosen = missing_policy(value);
  const storedDefault = binding_default(binding);
  const hasStoredJsonDefault = storedDefault !== undefined && typeof storedDefault !== "string";
  let storedJsonText = "";
  if (hasStoredJsonDefault) {
    try {
      storedJsonText = JSON.stringify(storedDefault) ?? safe_text(storedDefault);
    } catch (_error) {
      storedJsonText = safe_text(storedDefault);
    }
  }

  function set_policy(next) {
    onChange(with_missing_policy(binding, next));
  }

  function set_default(next) {
    onChange(with_missing_policy(binding, "default", next));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ ...CAPTION, flexShrink: 0 }}>If missing</span>
        <Select
          options={MISSING_POLICIES.map((policy) => ({
            value: policy.value,
            label: policy.label,
          }))}
          value={value}
          set_value={set_policy}
          filterable={false}
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 11.5,
            paddingVertical: 4,
            paddingHorizontal: 6,
            borderRadius: 5,
            gap: 4,
          }}
        />
      </div>

      {value === "default" && (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ ...CAPTION, flexShrink: 0 }}>Default</span>
          <Input
            value={typeof storedDefault === "string" ? storedDefault : ""}
            set_value={set_default}
            placeholder={hasStoredJsonDefault
              ? "Enter text to replace the stored JSON value"
              : "Substituted only when nothing arrives"}
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 11.5,
              paddingVertical: 4,
              paddingHorizontal: 6,
              borderRadius: 5,
              backgroundColor: isDark
                ? "rgba(255,255,255,0.04)"
                : "rgba(0,0,0,0.025)",
            }}
          />
        </div>
      )}

      {hasStoredJsonDefault && (
        <span data-testid="stored-json-default" style={{ ...CAPTION, overflowWrap: "anywhere" }}>
          Stored JSON default: <code>{storedJsonText}</code>. It stays unchanged
          until you enter replacement text.
        </span>
      )}

      {chosen && (
        <span data-testid="missing-policy-description" style={CAPTION}>
          {chosen.description}
        </span>
      )}
    </div>
  );
}
