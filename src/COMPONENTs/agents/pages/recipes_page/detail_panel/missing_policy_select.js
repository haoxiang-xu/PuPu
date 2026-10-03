import React from "react";
import Select from "../../../../../BUILTIN_COMPONENTs/select/select";
import Input from "../../../../../BUILTIN_COMPONENTs/input/input";
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
            value={
              binding_default(binding) === undefined
                ? ""
                : String(binding_default(binding))
            }
            set_value={set_default}
            placeholder="Substituted only when nothing arrives"
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

      {chosen && (
        <span data-testid="missing-policy-description" style={CAPTION}>
          {chosen.description}
        </span>
      )}
    </div>
  );
}
