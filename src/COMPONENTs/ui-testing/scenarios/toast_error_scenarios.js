import { FrontendApiError } from "../../../SERVICEs/api.shared";
import { toast } from "../../../SERVICEs/toast";

/* ═══════════════════════════════════════════════════════════════════════
   Real error scenario catalog for the ui-testing Toast runner.

   Every scenario mirrors an error PuPu can actually produce, using the
   real error class (FrontendApiError), the real codes thrown by the api
   facade, and the real reporting entry points:

   - via "reportError":     fired exactly like the production call site
   - via "useAsyncAction":  the runner routes makeError() through a real
                            useAsyncAction instance so the hook's fallback
                            reporting (or AbortError suppression) runs
   ═══════════════════════════════════════════════════════════════════════ */

const abortError = () => {
  const err = new Error("The operation was aborted");
  err.name = "AbortError";
  return err;
};

/* ── Chat ──────────────────────────────────────────────────────────── */

const CHAT_SCENARIOS = [
  {
    key: "attachment_cleanup_failed",
    name: "Attachment cleanup failed",
    group: "Chat",
    source: "src/PAGEs/chat/hooks/use_chat_attachments.js:518",
    sink: "toast.reportError (live in production)",
    note: "Deleting a draft attachment payload from storage rejected.",
    expectToast: true,
    fire: () =>
      toast.reportError(
        new Error("Failed to delete attachment payload from storage"),
        {
          title: "Attachment storage cleanup failed",
          dedupeKey: "attachment_delete_failed",
        },
      ),
  },
  {
    key: "stream_v2_start_failed",
    name: "Chat stream failed to start",
    group: "Chat",
    source: "src/SERVICEs/api.unchain.js:1543",
    sink: "not toast-wired yet — shown as the bare reportError fallback",
    note: "startStreamV2 rejected before the first SSE frame.",
    expectToast: true,
    fire: () =>
      toast.reportError(
        new FrontendApiError(
          "unchain_stream_v2_start_failed",
          "Failed to start Unchain v2 stream",
        ),
      ),
  },
];

/* ── Toolkit ───────────────────────────────────────────────────────── */

const TOOLKIT_SCENARIOS = [
  {
    key: "toolkit_catalog_load_failed",
    name: "Toolkit catalog load failed",
    group: "Toolkit",
    source: "src/COMPONENTs/toolkit/pages/toolkit_installed_page.js:39",
    sink: "useAsyncAction label \"toolkit_catalog_load\" (production swallows to inline error UI)",
    note: "listToolModalCatalog rejected; fired here through the hook fallback.",
    expectToast: true,
    via: "useAsyncAction",
    label: "toolkit_catalog_load",
    makeError: () =>
      new FrontendApiError(
        "unchain_tool_modal_catalog_failed",
        "Failed to query Unchain tool modal catalog",
      ),
  },
  {
    key: "toolkit_detail_load_failed",
    name: "Toolkit detail load failed",
    group: "Toolkit",
    source: "src/COMPONENTs/toolkit/components/toolkit_detail_panel.js:266",
    sink: "useAsyncAction label \"toolkit_detail_load\" (production swallows to inline error UI)",
    note: "getToolkitDetail rejected; fired here through the hook fallback.",
    expectToast: true,
    via: "useAsyncAction",
    label: "toolkit_detail_load",
    makeError: () =>
      new FrontendApiError(
        "unchain_toolkit_detail_failed",
        "Failed to query Unchain toolkit detail",
      ),
  },
];

/* ── Transport ─────────────────────────────────────────────────────── */

const TRANSPORT_SCENARIOS = [
  {
    key: "request_timeout",
    name: "Request timed out",
    group: "Transport",
    source: "src/SERVICEs/api.shared.js:73 (withTimeout)",
    sink: "wraps any facade call that exceeds its deadline",
    note: "The 5000ms default deadline elapsed before the bridge replied.",
    expectToast: true,
    fire: () =>
      toast.reportError(
        new FrontendApiError(
          "request_timeout",
          "Request timed out after 5000ms",
        ),
      ),
  },
  {
    key: "sidecar_unreachable",
    name: "Flask sidecar unreachable",
    group: "Transport",
    source: "src/SERVICEs/api.shared.js:48 (toFrontendApiError)",
    sink: "fetch → TypeError(\"Failed to fetch\") wrapped with the caller's code",
    note: "What users see when the Python runtime is down: the raw fetch message survives.",
    expectToast: true,
    fire: () =>
      toast.reportError(
        new FrontendApiError(
          "unchain_status_failed",
          "Failed to fetch",
          new TypeError("Failed to fetch"),
        ),
      ),
  },
  {
    key: "invalid_json_response",
    name: "Malformed backend response",
    group: "Transport",
    source: "src/SERVICEs/api.shared.js:95 (safeJson)",
    sink: "response body failed JSON.parse",
    note: "Typically a proxy/error page answering instead of Flask.",
    expectToast: true,
    fire: () =>
      toast.reportError(
        new FrontendApiError(
          "invalid_json",
          "Response body is not valid JSON",
          null,
          { status: 500 },
        ),
      ),
  },
];

/* ── Hook semantics ────────────────────────────────────────────────── */

const HOOK_SCENARIOS = [
  {
    key: "abort_silent",
    name: "Aborted action stays silent",
    group: "Hook semantics",
    source: "src/BUILTIN_COMPONENTs/mini_react/use_async_action.js:89",
    sink: "useAsyncAction swallows AbortError — NO toast must appear",
    note: "Unmount/cancel mid-flight is not an error the user should see.",
    expectToast: false,
    via: "useAsyncAction",
    label: "aborted_action",
    makeError: abortError,
  },
  {
    key: "error_dedupe_by_code",
    name: "Same error twice dedupes",
    group: "Hook semantics",
    source: "src/SERVICEs/toast.js:29 (getErrorDedupeKey)",
    sink: "errors sharing a FrontendApiError code collapse into one card",
    note: "Fires the same coded error twice back-to-back; only one toast may show.",
    expectToast: true,
    fire: () => {
      const make = () =>
        new FrontendApiError(
          "unchain_model_catalog_failed",
          "Failed to query Unchain model catalog",
        );
      toast.reportError(make());
      toast.reportError(make());
    },
  },
];

const ERROR_SCENARIO_GROUPS = [
  { key: "chat", label: "Chat", scenarios: CHAT_SCENARIOS },
  { key: "toolkit", label: "Toolkit", scenarios: TOOLKIT_SCENARIOS },
  { key: "transport", label: "Transport", scenarios: TRANSPORT_SCENARIOS },
  { key: "hooks", label: "Hook semantics", scenarios: HOOK_SCENARIOS },
];

const ALL_ERROR_SCENARIOS = ERROR_SCENARIO_GROUPS.flatMap(
  (group) => group.scenarios,
);

export { ERROR_SCENARIO_GROUPS, ALL_ERROR_SCENARIOS };
