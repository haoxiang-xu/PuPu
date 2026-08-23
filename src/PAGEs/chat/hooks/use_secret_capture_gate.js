/**
 * use_secret_capture_gate — Memory V2 P0 renderer secret gate.
 *
 * Sits in front of EVERY outgoing chat text (compose, queue, FYI/interject,
 * edit, resend). When the scanner finds a credential the send stops and the
 * user decides: store each one in the encrypted vault and send handle markers
 * instead, or explicitly send the plaintext anyway, or cancel.
 *
 * ── Explicit syntax is gated too ──────────────────────────────────────────
 * `{{secret:label}}value{{/secret}}` is NOT a fast path around this hook. It
 * is scanned by the same scanOutgoingSecretText, shown in the same modal
 * (pre-named from the syntax label), deposited by the same all-or-nothing
 * confirmStore, and proven by the same one-time token. An earlier revision
 * let explicit syntax skip the gate and deposit late inside runTurnRequest —
 * after markChatStarted / draft claim / render runtime had already fired, and
 * with no compensation when the second of two deposits failed. Both decisions
 * (explicit, heuristic) now settle here, before the first side effect.
 *
 * ── The one rule this module exists to enforce ────────────────────────────
 * Plaintext lives ONLY in a private ref (pendingRef) and in local closures.
 * It is never placed in React state, never in a prop, never in an error
 * message, never logged, never persisted. The public gate object exposes
 * exactly six fields — requestId, phase, candidateCount, labels, scopeChoice,
 * errorCode — and every one of them is either an ordinal, a count, a value
 * from a closed enum, a STATIC label from secret_capture's frozen label
 * tables, or (explicit candidates only) the NAME the user typed between
 * `{{secret:` and `}}`. A name is structurally outside the value span and
 * already ships in the marker and the vault descriptor, so it can carry no
 * byte of the credential. Nothing here is derived from matched value text.
 *
 * ── Fail-closed positions ─────────────────────────────────────────────────
 *  - scan error (ambiguous / too many candidates)  -> refuse, static code
 *  - programmatic (non-interactive) send with hits -> refuse, never prompts
 *  - vault bridge unavailable                      -> refuse
 *  - any deposit rejection                         -> compensate, refuse
 *  - range reconstruction mismatch                 -> refuse
 * "Refuse" always means: nothing deposited that survives, nothing sent,
 * nothing written, composer untouched.
 *
 * ── Atomicity ─────────────────────────────────────────────────────────────
 * Handles are substituted only after EVERY deposit has succeeded. If deposit
 * k fails, the already-created handles 0..k-1 are deleted (compensation)
 * before the refusal is reported, so a failed confirm leaves no orphan rows.
 *
 * ── Replay protection ─────────────────────────────────────────────────────
 * A successful decision mints a one-time token bound to (chatId, exact text,
 * kind). use_chat_stream's final guard consumes it exactly once. Tokens live
 * in a ref and are never persisted, so a reload cannot replay an approval.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  SECRET_CAPTURE_MESSAGES,
  applySecretHandleRanges,
  applySecretPlainRanges,
  extractSecretCandidateValues,
  normalizeSecretLabel,
  scanOutgoingSecretText,
} from "./secret_capture";
import {
  isMemoryVaultBridgeAvailable,
  memoryVaultBridge,
  resolveMemoryVaultScope,
} from "../../../SERVICEs/bridges/memory_vault_bridge";

export const SECRET_GATE_PHASES = Object.freeze({
  REVIEW: "review",
  STORING: "storing",
  ERROR: "error",
});

export const SECRET_GATE_DECISIONS = Object.freeze({
  CLEAN: "clean",
  STORED: "stored",
  PLAIN: "plain",
  CANCELLED: "cancelled",
  ERROR: "error",
});

export const SECRET_GATE_TOKEN_KINDS = Object.freeze({
  STORED: "stored",
  PLAIN: "plain",
});

/* Persisted marker allowed on a queued/FYI outbox item. It is the ONLY value
   that lets a later programmatic relay of that exact item skip the modal. */
export const PLAIN_USER_APPROVED_DISPOSITION = "plain_user_approved";

const randomId = (prefix) => {
  const cryptoObj =
    typeof window !== "undefined" && window.crypto ? window.crypto : null;
  if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    cryptoObj.getRandomValues(bytes);
    return `${prefix}${Array.from(bytes, (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("")}`;
  }
  return `${prefix}${Date.now().toString(16)}${Math.random()
    .toString(16)
    .slice(2)}`;
};

/* Vault operationId charset is [A-Za-z0-9_.-]{8,128}. */
const createDepositOperationId = () => randomId("scapdep_").slice(0, 128);
const createDeleteOperationId = () => randomId("scapdel_").slice(0, 128);
const createRequestId = () => randomId("scapreq_");
const createGateToken = () => randomId("scaptok_");

const staticErrorResult = (errorCode) => ({
  status: SECRET_GATE_DECISIONS.ERROR,
  errorCode,
  message:
    SECRET_CAPTURE_MESSAGES[errorCode] ||
    SECRET_CAPTURE_MESSAGES.secret_capture_gate_required,
});

export const useSecretCaptureGate = ({ activeChatId } = {}) => {
  /* PUBLIC. Rendered by secret_capture_modal. Six non-secret fields only. */
  const [gate, setGate] = useState(null);

  /* PRIVATE. Holds plaintext. Never rendered, never returned, never logged. */
  const pendingRef = useRef(null);
  const tokensRef = useRef(new Map());
  const mountedRef = useRef(true);

  const wipePending = useCallback(() => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (!pending) return null;
    /* Overwrite before dropping the reference so the strings are not left
       reachable through a retained closure while GC catches up. */
    pending.text = "";
    if (Array.isArray(pending.values)) {
      for (let index = 0; index < pending.values.length; index += 1) {
        pending.values[index] = "";
      }
      pending.values.length = 0;
    }
    return pending;
  }, []);

  /* Settle the outstanding request exactly once. Any second call is a no-op,
     which is what makes double-click / ESC-after-confirm harmless. */
  const settle = useCallback(
    (result) => {
      const pending = pendingRef.current;
      if (!pending || pending.settled) return false;
      pending.settled = true;
      const resolve = pending.resolve;
      wipePending();
      setGate(null);
      if (typeof resolve === "function") resolve(result);
      return true;
    },
    [wipePending],
  );

  /* Unmount and chat switch both abandon an open request: cancel semantics,
     nothing stored, nothing sent. Tokens are dropped too — an approval never
     outlives the conversation it was granted in. */
  useEffect(() => {
    mountedRef.current = true;
    const tokens = tokensRef.current;
    return () => {
      mountedRef.current = false;
      settle({ status: SECRET_GATE_DECISIONS.CANCELLED });
      tokens.clear();
    };
  }, [settle]);

  useEffect(() => {
    settle({ status: SECRET_GATE_DECISIONS.CANCELLED });
    tokensRef.current.clear();
    // Re-running on every activeChatId change is the point of this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChatId]);

  const mintToken = useCallback((kind, chatId, text) => {
    const token = createGateToken();
    tokensRef.current.set(token, { kind, chatId, text });
    return token;
  }, []);

  /**
   * Consume a gate token. Returns true exactly once per token, and only when
   * the chat and the EXACT text still match what was approved. A stale or
   * edited text fails here, which is the last line before the wire.
   */
  const consumeSecretGateToken = useCallback((token, { chatId, text } = {}) => {
    if (typeof token !== "string" || !token) return false;
    const record = tokensRef.current.get(token);
    if (!record) return false;
    tokensRef.current.delete(token);
    return record.chatId === chatId && record.text === text;
  }, []);

  /**
   * Bridge a PERSISTED plain_user_approved disposition (on a queued/FYI outbox
   * item) into an in-session one-time token, so relaying that exact item does
   * not re-prompt. Any other disposition returns null -> the relay fails
   * closed, which is what must happen for pre-gate legacy entries.
   */
  const mintTokenForDisposition = useCallback(
    ({ chatId, text, disposition }) => {
      if (disposition !== PLAIN_USER_APPROVED_DISPOSITION) return null;
      if (typeof text !== "string" || !text) return null;
      return mintToken(SECRET_GATE_TOKEN_KINDS.PLAIN, chatId, text);
    },
    [mintToken],
  );

  /**
   * The gate itself.
   *
   * evaluateSecretGate({ chatId, text, interactive }) resolves to one of:
   *   { status: "clean",     text }                  send unchanged
   *   { status: "stored",    text, token }           send the handle text
   *   { status: "plain",     text, token }           user chose plaintext
   *   { status: "cancelled" }                        do nothing at all
   *   { status: "error", errorCode, message }        refuse, show static text
   *
   * `interactive: false` (queue relay, durable resume, any programmatic send)
   * never opens the modal — a hit is an immediate fail-closed refusal.
   */
  const evaluateSecretGate = useCallback(
    ({ chatId, text, interactive = true } = {}) => {
      const source = typeof text === "string" ? text : "";
      /* ONE scanner for both explicit syntax and heuristic hits. Do not swap
         in a heuristic-only scan here — that is precisely the bypass this
         module was rewritten to close. */
      const scan = scanOutgoingSecretText(source);
      if (!scan.ok) {
        return Promise.resolve(staticErrorResult(scan.code));
      }
      if (scan.candidates.length === 0) {
        return Promise.resolve({
          status: SECRET_GATE_DECISIONS.CLEAN,
          text: source,
        });
      }
      if (!interactive) {
        return Promise.resolve(
          staticErrorResult("secret_capture_gate_required"),
        );
      }
      if (!mountedRef.current) {
        return Promise.resolve({ status: SECRET_GATE_DECISIONS.CANCELLED });
      }

      /* A second interactive request while one is open cancels the newcomer
         rather than stacking modals or replacing the pending plaintext. */
      if (pendingRef.current && !pendingRef.current.settled) {
        return Promise.resolve({ status: SECRET_GATE_DECISIONS.CANCELLED });
      }

      const requestId = createRequestId();
      const candidates = scan.candidates;
      return new Promise((resolve) => {
        pendingRef.current = {
          requestId,
          chatId,
          text: source,
          candidates,
          values: extractSecretCandidateValues(source, candidates),
          /* Stable per candidate for the lifetime of this request: the vault
             replays an identical (operationId, params) pair and returns the
             SAME handle, so a double-clicked confirm cannot create duplicate
             rows or half-apply. */
          operationIds: candidates.map(() => createDepositOperationId()),
          resolve,
          settled: false,
          inFlight: false,
        };
        setGate({
          requestId,
          phase: SECRET_GATE_PHASES.REVIEW,
          candidateCount: candidates.length,
          labels: candidates.map((candidate) => candidate.label),
          scopeChoice: "chat",
          errorCode: "",
        });
      });
    },
    [],
  );

  const setScopeChoice = useCallback((scopeChoice) => {
    if (scopeChoice !== "chat" && scopeChoice !== "user") return;
    setGate((current) =>
      current && current.phase === SECRET_GATE_PHASES.REVIEW
        ? { ...current, scopeChoice }
        : current,
    );
  }, []);

  const cancelGate = useCallback(() => {
    settle({ status: SECRET_GATE_DECISIONS.CANCELLED });
  }, [settle]);

  const failGate = useCallback(
    (errorCode) => {
      const pending = pendingRef.current;
      if (!pending || pending.settled) return;
      settle(staticErrorResult(errorCode));
    },
    [settle],
  );

  /**
   * Store every candidate, then substitute handles by range. All-or-nothing:
   * a failure anywhere deletes whatever this attempt created and sends
   * nothing.
   */
  const confirmStore = useCallback(async (labelOverrides) => {
    const pending = pendingRef.current;
    if (!pending || pending.settled || pending.inFlight) return;
    /* Double-click guard #1: in-flight latch (synchronous, before any await).
       Guard #2 is the stable operationId set, which makes a deposit that DOES
       slip through idempotent main-side rather than duplicating. */
    pending.inFlight = true;

    /* Names the user typed in the modal. A name is not secret material, but a
       malformed one must not reach the vault, so it is normalized with the
       vault's own rules and an unusable name fails the confirm closed. */
    const overrides = Array.isArray(labelOverrides) ? labelOverrides : [];
    const labels = [];
    for (let index = 0; index < pending.candidates.length; index += 1) {
      const fallback = pending.candidates[index].label;
      const raw =
        typeof overrides[index] === "string" && overrides[index].trim()
          ? overrides[index]
          : fallback;
      const normalized = normalizeSecretLabel(raw);
      if (!normalized) {
        pending.inFlight = false;
        failGate("secret_capture_invalid_label");
        return;
      }
      labels.push(normalized);
    }

    const scopeChoice = gate?.scopeChoice === "user" ? "user" : "chat";
    const scope = resolveMemoryVaultScope(scopeChoice, pending.chatId);
    if (!scope) {
      pending.inFlight = false;
      failGate("secret_capture_deposit_failed");
      return;
    }
    if (!isMemoryVaultBridgeAvailable()) {
      pending.inFlight = false;
      failGate("secret_capture_vault_unavailable");
      return;
    }

    setGate((current) =>
      current && current.requestId === pending.requestId
        ? { ...current, phase: SECRET_GATE_PHASES.STORING, errorCode: "" }
        : current,
    );

    const created = [];
    /* Compensation: undo this attempt's rows, best-effort. A delete that
       itself fails cannot be surfaced with any detail — the refusal message
       stays static either way. */
    const compensate = async () => {
      for (const handle of created) {
        try {
          await memoryVaultBridge.deleteSecret({
            operationId: createDeleteOperationId(),
            handle,
          });
        } catch (_error) {
          /* Nothing actionable and nothing safe to report. */
        }
      }
    };

    for (let index = 0; index < pending.candidates.length; index += 1) {
      if (pending.settled) {
        await compensate();
        return;
      }
      let result = null;
      try {
        result = await memoryVaultBridge.deposit({
          operationId: pending.operationIds[index],
          scopeKind: scope.scopeKind,
          scopeId: scope.scopeId,
          label: labels[index],
          plaintext: pending.values[index],
        });
      } catch (_error) {
        /* error.message crossed IPC and may echo input — never surface it. */
        await compensate();
        if (pendingRef.current === pending) pending.inFlight = false;
        failGate("secret_capture_deposit_failed");
        return;
      }
      const handle =
        typeof result?.handle === "string" && result.handle.trim()
          ? result.handle.trim()
          : "";
      if (!handle) {
        await compensate();
        if (pendingRef.current === pending) pending.inFlight = false;
        failGate("secret_capture_deposit_failed");
        return;
      }
      created.push(handle);
    }

    /* Every deposit succeeded — only now may the text change. */
    const redacted = applySecretHandleRanges(
      pending.text,
      pending.candidates.map((candidate, index) => ({
        ...candidate,
        label: labels[index],
      })),
      created,
    );
    if (typeof redacted !== "string" || !redacted) {
      await compensate();
      if (pendingRef.current === pending) pending.inFlight = false;
      failGate("secret_capture_deposit_failed");
      return;
    }
    if (pending.settled || pendingRef.current !== pending) {
      /* Cancelled or superseded while deposits were in flight. */
      await compensate();
      return;
    }

    const token = mintToken(
      SECRET_GATE_TOKEN_KINDS.STORED,
      pending.chatId,
      redacted,
    );
    settle({
      status: SECRET_GATE_DECISIONS.STORED,
      text: redacted,
      token,
    });
  }, [failGate, gate, mintToken, settle]);

  /**
   * Explicit plaintext send. Only ever reachable from a real user click on the
   * dedicated button — there is no automatic, timed, or keyboard path to it.
   * (evaluateSecretGate refuses non-interactive callers before a request can
   * ever exist, so no background relay can reach this function.)
   *
   * The outgoing text keeps every value but loses every {{secret:...}}
   * wrapper: the user approved sending the CREDENTIAL, not PuPu's capture
   * syntax, and leaving the wrapper in would ship a marker-shaped string the
   * model would have to interpret. Heuristic-only messages are unchanged.
   */
  const confirmPlain = useCallback(() => {
    const pending = pendingRef.current;
    if (!pending || pending.settled || pending.inFlight) return;
    const plain = applySecretPlainRanges(pending.text, pending.candidates);
    if (typeof plain !== "string" || !plain) {
      failGate("secret_capture_ambiguous");
      return;
    }
    const token = mintToken(
      SECRET_GATE_TOKEN_KINDS.PLAIN,
      pending.chatId,
      plain,
    );
    settle({
      status: SECRET_GATE_DECISIONS.PLAIN,
      text: plain,
      token,
      disposition: PLAIN_USER_APPROVED_DISPOSITION,
    });
  }, [failGate, mintToken, settle]);

  return {
    gate,
    isSecretCapturePending: gate !== null,
    evaluateSecretGate,
    consumeSecretGateToken,
    mintTokenForDisposition,
    setScopeChoice,
    confirmStore,
    confirmPlain,
    cancelGate,
  };
};

export default useSecretCaptureGate;
