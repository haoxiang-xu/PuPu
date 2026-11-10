import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { agentEnglishText } from "../agents_i18n";
import React, { useEffect, useState } from "react";
import Input from "../../../../../BUILTIN_COMPONENTs/input/input";
import Select from "../../../../../BUILTIN_COMPONENTs/select/select";
import TextField from "../../../../../BUILTIN_COMPONENTs/input/textfield";
import usePendingText from "./pending_text";
import { node_bindings, node_kernel, with_node_kernel } from "../skeleton_document";
import { bound_from_text } from "../output_schema_fields";
import {
  HISTORY_SCOPES,
  OVERFLOW_POLICIES,
  kernel_problems,
  new_kernel_config,
  reservation_ceiling,
  with_kernel_profile,
} from "../kernel_config";
import { is_unavailable, kernel_profiles } from "../skeleton_resources";
import { identity_of, own, safe_text } from "../document_values";

/* The Kernel Loop: which model this Agent thinks with, and how.
 *
 * The node the UI calls "Agent" is a Kernel Loop, and its `config.kernel` is
 * the whole of that decision — the model's profile, the prompt, how many turns
 * it may take, how much of the window is kept for the reply, whether it sees
 * the session, and what happens when the window overflows.
 *
 * Nothing before Run says a word about it. Measured on the pinned pair
 * (`kernel_config_capture.js`): an Agent node with NO kernel saves happily,
 * draws no draft diagnostic and passes the structural execution gate — only
 * `prepare_agent_graph` refuses it, which is Run. So the author would compose
 * a whole Agent, be told the draft is fine, and find out at the first run.
 * This section is the only thing that can tell them, which is why it says the
 * refusal in those words rather than merely disabling something.
 *
 * The profile is NOT assembled here. Its endpoint, credential reference,
 * window, output cap and capabilities are facts about this deployment that no
 * renderer can see, and the runtime says whose they are — "Model/provider
 * resolution stays host-owned". They come from the producer
 * (`skeleton_kernel_profiles.py`), which derives them from the installed
 * wheel's own catalog and validates each one with the runtime's validator
 * before offering it. This panel picks one and carries it unchanged. */

const SECTION_LABEL = {
  fontSize: 11,
  fontWeight: 600,
  color: "#86868b",
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

const CAPTION = { fontSize: 10.5, color: "#86868b", lineHeight: 1.45 };
const MONO = { fontFamily: "ui-monospace, Menlo, monospace" };
const PROBLEM = { fontSize: 10.5, lineHeight: 1.45 };

/* The same pair the pool section uses: the light-mode red is unreadable on a
   dark panel. */
const refused_style = (isDark) => ({
  ...PROBLEM,
  color: isDark ? "rgba(255,140,140,0.95)" : "rgba(176,32,32,0.95)",
});
const ROW = { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" };





/* Not the same thing as an empty catalog, and it took a negative test to show
   that this panel was saying the one about the other: a malformed answer was
   coerced to two empty lists, which reads as "this build offers no model" —
   a statement about the build, made about an answer nobody could read. Both
   the facade and the consumer now refuse that answer instead of emptying it,
   and this is what the refusal looks like. */








const UNAVAILABLE_REASON = {
  output_limit_unknown:
    "this build declares no output limit for it, and a reply reservation has to be bounded by one",
  context_window_unknown: "this build declares no context window for it",
  profile_refused: "the profile this build derived for it was refused",
};

const is_object = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/* `{{#input.<name>#}}`, and only that. `_render_prompt`
   (`kernel_runtime.py:34-41`) substitutes that one pattern, so a reference
   written any other way is left in the prompt verbatim — and a reference to a
   name this node does not bind is replaced with NOTHING, silently. That is
   the one thing acceptance 4 forbids a missing value from doing, so it is
   said here rather than discovered in an answer. */
const PROMPT_REFERENCE = /\{\{#input\.([^#}]+)#\}\}/g;

export function prompt_references(prompt) {
  if (typeof prompt !== "string") return [];
  const names = [];
  let match = PROMPT_REFERENCE.exec(prompt);
  while (match !== null) {
    if (!names.includes(match[1])) names.push(match[1]);
    match = PROMPT_REFERENCE.exec(prompt);
  }
  PROMPT_REFERENCE.lastIndex = 0;
  return names;
}

export function unbound_references(prompt, bindings) {
  const bound = (Array.isArray(bindings) ? bindings : [])
    .map((binding) => (is_object(binding) ? own(binding, "name") : undefined))
    .filter((name) => typeof name === "string");
  return prompt_references(prompt).filter((name) => !bound.includes(name));
}

function model_label(profile, t = agentEnglishText) {
  if (!is_object(profile)) return t("agents.execution.kernel.unreadable_model");
  const provider = safe_text(own(profile, "provider"));
  const model = safe_text(own(profile, "model"));
  return `${provider} · ${model}`;
}

/* A number box that does not rewrite what is being typed.
 *
 * The lesson from the schema editor's bounds, which cost a round: a box that
 * re-renders the canonical form of what it parsed turns `0.` into `0` and
 * deletes the point under the cursor. The same mechanism is reused rather
 * than rediscovered — the text is held against the value it is about to be
 * given, and the document is written only when the text is a whole number
 * inside this model's ceiling.
 *
 * Both of these keys are required and must be one or more, so an empty box is
 * not a stored state. It is a box on its way to another number, and what the
 * document still holds is said out loud so the author is not guessing which
 * of their keystrokes landed. */
function CountRow({ label, stored, ceiling, caption, onStore, about, isDark, testId }) {
  const { t } = useTranslation();
  /* The ceiling is part of what the text was typed against, not just part of
     the verdict on it. Measured: 20000 refused against a 4096 limit, then a
     model allowing 32000 picked — the number became storable, so the refusal
     beside it disappeared, and the box went on showing 20000 while the
     document still held 4096. Nothing had written it; nothing was going to.
     So a new ceiling voids the text, and the box shows what is stored. */
  const pending = usePendingText(stored, identity_of([about, ceiling]));
  const shown =
    pending.text !== null
      ? pending.text
      : typeof stored === "number"
        ? String(stored)
        : "";

  function storable(value) {
    return (
      value !== undefined &&
      value >= 1 &&
      (ceiling === undefined || value <= ceiling)
    );
  }

  const read = bound_from_text(shown, true);
  const refused = pending.text !== null && !storable(read.ok ? read.value : undefined);

  function type(next) {
    const parsed = bound_from_text(next, true);
    const value = parsed.ok ? parsed.value : undefined;
    pending.hold(next, storable(value) ? value : stored);
    if (storable(value)) onStore(value);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={ROW}>
        <span style={{ ...CAPTION, flexShrink: 0 }}>{label}</span>
        <Input
          value={shown}
          set_value={type}
          placeholder="—"
          style={{
            width: 88,
            fontSize: 11.5,
            ...MONO,
            paddingVertical: 4,
            paddingHorizontal: 6,
            borderRadius: 5,
          }}
        />
        <span style={{ ...CAPTION, flexShrink: 0 }}>{caption}</span>
      </div>
      {refused && (
        <span data-testid={`${testId}-refused`} style={refused_style(isDark)}>
          {ceiling === undefined ? t("agents.execution.kernel.pending_count", { stored: safe_text(stored) }) : t("agents.execution.kernel.pending_bounded_count", { ceiling, stored: safe_text(stored) })}
        </span>
      )}
    </div>
  );
}

export default function KernelSection({
  document,
  node,
  /* Which handed-over document this is — see `DetailPanel`. The two count
     boxes below hold text this document does not. */
  revision,
  isDark,
  onChange,
}) {
  const { t } = useTranslation();
  const kernel = node_kernel(node);
  const stored_profile = kernel ? own(kernel, "profile") : undefined;

  /* The catalog, read once per mounted section.
   *
   * No request ticket, unlike the pool's library read: that one re-asks while
   * the panel stays mounted, so an answer there can be about an earlier
   * question. This asks once — the catalog is a fact about the build, not
   * about the selected node — so the only answer that can arrive late is one
   * for a section that is gone, which is what the `live` flag is for. A
   * ticket beside it would be machinery whose second case cannot happen.
   *
   * The `catch` is not optional: without it a rejected promise leaves the
   * section saying it is still reading, forever.
   *
   * Three outcomes and not two. `unreachable` is "this build has no route to
   * the runtime"; `unreadable` is "the route answered with something that is
   * not a catalog". Collapsing them left the second wearing the caption for
   * an empty catalog, which says this build offers no model — said about an
   * answer that said nothing at all. */
  const [catalog, setCatalog] = useState({
    reading: true,
    failure: null,
    profiles: [],
    unavailable_models: [],
  });
  useEffect(() => {
    let live = true;
    kernel_profiles()
      .then((result) => {
        if (!live) return;
        if (!result.ok) {
          setCatalog({
            reading: false,
            failure: is_unavailable(result) ? "unreachable" : "unreadable",
            profiles: [],
            unavailable_models: [],
            error: result.error || null,
          });
          return;
        }
        /* The consumer has already refused anything that is not two arrays of
           objects, so these are read rather than coerced. */
        setCatalog({
          reading: false,
          failure: null,
          profiles: result.data.profiles,
          unavailable_models: result.data.unavailable,
        });
      })
      .catch(() => {
        if (!live) return;
        /* `kernel_profiles` answers rather than throwing, so this is a fault
           in the code above and not a verdict about the runtime — which is
           why it says the answer could not be read and does not claim the
           runtime is out of reach. */
        setCatalog({
          reading: false,
          failure: "unreadable",
          profiles: [],
          unavailable_models: [],
        });
      });
    return () => {
      live = false;
    };
  }, []);

  const problems = kernel ? kernel_problems(kernel, ["config", "kernel"], t) : [];
  const bindings = node_bindings(node);
  const unbound = kernel ? unbound_references(own(kernel, "prompt"), bindings) : [];

  function store(next_kernel) {
    onChange(with_node_kernel(document, node.id, next_kernel));
  }

  /* The stored model stays in the list even when this build no longer offers
     it — a wheel can stop declaring a model, and a picker that dropped the
     current one would read as the author never having chosen it, then quietly
     replace it on the next click. */
  const offered = catalog.profiles;
  const stored_id = is_object(stored_profile) ? own(stored_profile, "id") : undefined;
  const in_catalog =
    typeof stored_id === "string" &&
    offered.some((profile) => own(profile, "id") === stored_id);
  const options = [
    ...(is_object(stored_profile) && !in_catalog
      ? [
          {
            value: typeof stored_id === "string" ? stored_id : "__stored__",
            label: t("agents.execution.kernel.unlisted_model_option", { stored_profile: model_label(stored_profile, t) }),
          },
        ]
      : []),
    ...offered.map((profile) => ({
      value: own(profile, "id"),
      label: model_label(profile, t),
    })),
  ];

  function pick(next_id) {
    const profile = offered.find((item) => own(item, "id") === next_id);
    if (!profile) return;
    store(kernel ? with_kernel_profile(kernel, profile) : new_kernel_config(profile));
  }

  return (
    <div
      data-testid="skeleton-kernel"
      style={{ display: "flex", flexDirection: "column", gap: 8 }}
    >
      <span style={SECTION_LABEL}>{t("agents.inspector.model")}</span>

      {!kernel && (
        <span data-testid="kernel-absent" style={CAPTION}>
          {t("agents.execution.kernel.no_model")}
        </span>
      )}

      {catalog.failure === "unreachable" && (
        <span data-testid="kernel-catalog-unavailable" style={CAPTION}>
          {t("agents.execution.kernel.catalog_unreachable")}
        </span>
      )}

      {catalog.failure === "unreadable" && (
        <span data-testid="kernel-catalog-unreadable" style={CAPTION}>
          {t("agents.execution.kernel.catalog_unreadable")}
        </span>
      )}

      {!catalog.reading && catalog.failure === null && options.length === 0 && (
        <span data-testid="kernel-catalog-empty" style={CAPTION}>
          {t("agents.execution.kernel.catalog_empty")}
        </span>
      )}

      {options.length > 0 && (
        <div data-testid="kernel-model" style={ROW}>
          <Select
            options={options}
            value={typeof stored_id === "string" ? stored_id : null}
            set_value={pick}
            filterable
            placeholder={t("agents.execution.kernel.pick_a_model")}
            dropdown_style={{ maxHeight: "min(280px, 40vh)" }}
            style={{
              width: 232,
              flexShrink: 0,
              fontSize: 11.5,
              paddingVertical: 4,
              paddingHorizontal: 6,
              borderRadius: 5,
              gap: 4,
            }}
          />
          {is_object(stored_profile) && (
            <span data-testid="kernel-profile-facts" style={{ ...CAPTION, ...MONO }}>
              {t("agents.execution.kernel.profile_facts", { protocol: safe_text(own(stored_profile, "protocol")), endpoint: safe_text(own(stored_profile, "endpoint")), window: safe_text(own(stored_profile, "context_window")) })}
            </span>
          )}
        </div>
      )}

      {catalog.unavailable_models.length > 0 && (
        <span data-testid="kernel-catalog-reasons" style={CAPTION}>
          {catalog.unavailable_models.length > 6 ? t("agents.execution.kernel.not_offered_more", { models: catalog.unavailable_models.slice(0, 6).map((entry) => t("agents.execution.kernel.model_reason", { model: safe_text(own(entry, "id")), reason: own(UNAVAILABLE_REASON, own(entry, "reason")) ? t(`agents.execution.kernel.reason_${own(entry, "reason")}`) : safe_text(own(entry, "reason")) })).join(t("agents.execution.kernel.list_separator")), count: catalog.unavailable_models.length - 6 }) : t("agents.execution.kernel.not_offered", { models: catalog.unavailable_models.slice(0, 6).map((entry) => t("agents.execution.kernel.model_reason", { model: safe_text(own(entry, "id")), reason: own(UNAVAILABLE_REASON, own(entry, "reason")) ? t(`agents.execution.kernel.reason_${own(entry, "reason")}`) : safe_text(own(entry, "reason")) })).join(t("agents.execution.kernel.list_separator")) })}
        </span>
      )}

      {kernel && (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <TextField
              value={typeof own(kernel, "prompt") === "string" ? kernel.prompt : ""}
              set_value={(next) => store({ ...kernel, prompt: next })}
              placeholder={t("agents.execution.kernel.prompt_placeholder")}
              min_rows={3}
              max_display_rows={12}
              style={{ fontSize: 11.5, borderRadius: 6 }}
            />
            <span data-testid="kernel-prompt-references" style={CAPTION}>
              {bindings.length === 0 ? t("agents.execution.kernel.no_inputs", { token: "{{#input.name#}}" }) : t("agents.execution.kernel.input_references", { tokens: bindings.map((binding) => `{{#input.${safe_text(own(binding, "name"))}#}}`).slice(0, 4).join(" "), more: bindings.length > 4 ? " …" : "" })}
            </span>
            {unbound.length > 0 && (
              <span data-testid="kernel-prompt-unbound" style={refused_style(isDark)}>
                {t("agents.execution.kernel.unbound_prompt", { tokens: unbound.map((name) => `{{#input.${name}#}}`).join(t("agents.schema.fields.list_separator")) })}
              </span>
            )}
          </div>

          <CountRow
            label={t("agents.execution.kernel.at_most")}
            stored={own(kernel, "max_iterations")}
            caption={t("agents.execution.kernel.turns_before_pupu_stops_it")}
            onStore={(value) => store({ ...kernel, max_iterations: value })}
            about={identity_of([revision, node.id, "max_iterations"])}
            isDark={isDark}
            testId="kernel-iterations"
          />

          <CountRow
            label={t("agents.execution.kernel.keep")}
            stored={own(kernel, "output_tokens")}
            ceiling={reservation_ceiling(stored_profile)}
            caption={t("agents.execution.kernel.reply_tokens_caption", { stored_profile: reservation_ceiling(
              stored_profile,
            ) })}
            onStore={(value) => store({ ...kernel, output_tokens: value })}
            about={identity_of([revision, node.id, "output_tokens"])}
            isDark={isDark}
            testId="kernel-reservation"
          />

          <div style={ROW}>
            <span style={{ ...CAPTION, flexShrink: 0 }}>{t("agents.execution.kernel.it_sees")}</span>
            <span data-testid="kernel-history" style={{ display: "contents" }}>
            <Select
              options={HISTORY_SCOPES.map((value) => ({
                value,
                label: t(`agents.execution.kernel.history_${value}`),
              }))}
              value={own(kernel, "history")}
              set_value={(next) => store({ ...kernel, history: next })}
              filterable={false}
              style={{
                width: 168,
                flexShrink: 0,
                fontSize: 11.5,
                paddingVertical: 4,
                paddingHorizontal: 6,
                borderRadius: 5,
                gap: 4,
              }}
            />
            </span>
            <span style={{ ...CAPTION, flexShrink: 0 }}>{t("agents.execution.kernel.and_when_the_window_fills")}</span>
            <span data-testid="kernel-overflow" style={{ display: "contents" }}>
            <Select
              options={OVERFLOW_POLICIES.map((value) => ({
                value,
                label: t(`agents.execution.kernel.overflow_${value}`),
              }))}
              value={own(kernel, "overflow")}
              set_value={(next) => store({ ...kernel, overflow: next })}
              filterable={false}
              style={{
                width: 168,
                flexShrink: 0,
                fontSize: 11.5,
                paddingVertical: 4,
                paddingHorizontal: 6,
                borderRadius: 5,
                gap: 4,
              }}
            />
            </span>
          </div>
        </>
      )}

      {problems.length > 0 && (
        <div
          data-testid="kernel-problems"
          style={{ display: "flex", flexDirection: "column", gap: 3 }}
        >
          {problems.map((item, index) => (
            <span key={`${item.code}:${item.where}:${index}`} style={refused_style(isDark)}>
              {`${item.where} — ${item.message}`}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
