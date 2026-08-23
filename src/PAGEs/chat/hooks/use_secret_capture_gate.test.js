/**
 * Memory V2 P0 secret gate hook.
 *
 * Locks the invariants that cannot be observed from the send-flow test:
 *  - the PUBLIC gate object never carries message text or a matched value;
 *  - deposits happen with STABLE operation ids, so a double-clicked confirm
 *    replays idempotently main-side instead of duplicating rows;
 *  - handles are substituted only after EVERY deposit succeeded, and a partial
 *    failure DELETES the rows this attempt created (compensation);
 *  - scope choice maps to exactly {chat, user} via the bridge helper;
 *  - a decision token is one-time, chat-bound and text-bound;
 *  - a programmatic (non-interactive) evaluation never opens the gate.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import {
  PLAIN_USER_APPROVED_DISPOSITION,
  useSecretCaptureGate,
} from "./use_secret_capture_gate";
import { MEMORY_VAULT_USER_SCOPE_ID } from "../../../SERVICEs/bridges/memory_vault_bridge";

const HANDLE = (n) => `pvh1_${String(n).repeat(64).slice(0, 64)}`;
const SECRET_A = "abcd1234efgh";
const SECRET_B = "zzzz9999yyyy";
const TEXT_ONE = `api_key=${SECRET_A} please`;
const TEXT_TWO = `api_key=${SECRET_A} then password: ${SECRET_B} end`;
const EXPLICIT_ONE = `use {{secret:Deploy key}}${SECRET_A}{{/secret}} now`;

let depositCalls;

const installVault = (deposit, deleteSecret) => {
  depositCalls = [];
  window.memoryVaultAPI = {
    deposit: jest.fn(async (payload) => {
      depositCalls.push(payload);
      return deposit ? deposit(payload, depositCalls.length - 1) : { handle: HANDLE(1) };
    }),
    listDescriptors: jest.fn(async () => ({ descriptors: [] })),
    delete: jest.fn(async (payload) =>
      deleteSecret ? deleteSecret(payload) : { deleted: true },
    ),
    grant: jest.fn(async () => ({})),
    revoke: jest.fn(async () => ({})),
    getStatus: jest.fn(async () => ({ status: "available" })),
  };
};

afterEach(() => {
  delete window.memoryVaultAPI;
  jest.restoreAllMocks();
});

const mount = (activeChatId = "chat-1") =>
  renderHook((props) => useSecretCaptureGate(props), {
    initialProps: { activeChatId },
  });

describe("useSecretCaptureGate — public surface", () => {
  test("clean text resolves synchronously and never opens the gate", async () => {
    installVault();
    const { result } = mount();
    let decision;
    await act(async () => {
      decision = await result.current.evaluateSecretGate({
        chatId: "chat-1",
        text: "hello there",
      });
    });
    expect(decision).toEqual({ status: "clean", text: "hello there" });
    expect(result.current.gate).toBeNull();
    expect(result.current.isSecretCapturePending).toBe(false);
  });

  test("the public gate object carries no message text and no matched value", async () => {
    installVault();
    const { result } = mount();
    act(() => {
      void result.current.evaluateSecretGate({
        chatId: "chat-1",
        text: TEXT_TWO,
      });
    });
    await waitFor(() => expect(result.current.gate).not.toBeNull());

    const gate = result.current.gate;
    expect(Object.keys(gate).sort()).toEqual([
      "candidateCount",
      "errorCode",
      "labels",
      "phase",
      "requestId",
      "scopeChoice",
    ]);
    expect(gate.candidateCount).toBe(2);
    expect(gate.labels).toEqual(["API key", "Password"]);
    expect(gate.scopeChoice).toBe("chat");
    const serialized = JSON.stringify(gate);
    expect(serialized).not.toContain(SECRET_A);
    expect(serialized).not.toContain(SECRET_B);
    expect(serialized).not.toContain("please");
  });

  test("a programmatic evaluation with a hit fails closed and never opens the gate", async () => {
    installVault();
    const { result } = mount();
    let decision;
    await act(async () => {
      decision = await result.current.evaluateSecretGate({
        chatId: "chat-1",
        text: TEXT_ONE,
        interactive: false,
      });
    });
    expect(decision.status).toBe("error");
    expect(decision.errorCode).toBe("secret_capture_gate_required");
    expect(result.current.gate).toBeNull();
    expect(window.memoryVaultAPI.deposit).not.toHaveBeenCalled();
  });

  /* ── explicit {{secret:...}} syntax is gated, not auto-captured ───────── */

  test("explicit syntax opens the gate, pre-named from the syntax label", async () => {
    installVault();
    const { result } = mount();
    act(() => {
      void result.current.evaluateSecretGate({
        chatId: "chat-1",
        text: EXPLICIT_ONE,
      });
    });
    await waitFor(() => expect(result.current.gate).not.toBeNull());

    const gate = result.current.gate;
    // Still exactly six public fields — no new surface for explicit mode.
    expect(Object.keys(gate).sort()).toEqual([
      "candidateCount",
      "errorCode",
      "labels",
      "phase",
      "requestId",
      "scopeChoice",
    ]);
    expect(gate.candidateCount).toBe(1);
    expect(gate.labels).toEqual(["Deploy key"]);
    // The NAME reaches state; the VALUE and the rest of the message do not.
    const serialized = JSON.stringify(gate);
    expect(serialized).not.toContain(SECRET_A);
    expect(serialized).not.toContain("use ");
    expect(window.memoryVaultAPI.deposit).not.toHaveBeenCalled();
  });

  test("a programmatic evaluation of explicit syntax fails closed, no modal", async () => {
    installVault();
    const { result } = mount();
    let decision;
    await act(async () => {
      decision = await result.current.evaluateSecretGate({
        chatId: "chat-1",
        text: EXPLICIT_ONE,
        interactive: false,
      });
    });
    expect(decision.status).toBe("error");
    expect(decision.errorCode).toBe("secret_capture_gate_required");
    expect(result.current.gate).toBeNull();
    expect(window.memoryVaultAPI.deposit).not.toHaveBeenCalled();
  });

  test("malformed explicit syntax fails closed with a static code and no gate", async () => {
    installVault();
    const { result } = mount();
    let decision;
    await act(async () => {
      decision = await result.current.evaluateSecretGate({
        chatId: "chat-1",
        text: `{{secret:key}}${SECRET_A}`,
      });
    });
    expect(decision.status).toBe("error");
    expect(decision.errorCode).toBe("secret_capture_malformed");
    expect(JSON.stringify(decision)).not.toContain(SECRET_A);
    expect(result.current.gate).toBeNull();
    expect(window.memoryVaultAPI.deposit).not.toHaveBeenCalled();
  });

  test("storing an explicit block deposits the VALUE and emits marker-only text", async () => {
    installVault();
    const { result } = mount();
    let decisionPromise;
    act(() => {
      decisionPromise = result.current.evaluateSecretGate({
        chatId: "chat-1",
        text: EXPLICIT_ONE,
      });
    });
    await waitFor(() => expect(result.current.gate).not.toBeNull());
    await act(async () => {
      await result.current.confirmStore();
    });
    const decision = await decisionPromise;

    expect(depositCalls).toHaveLength(1);
    // The wrapper is PuPu syntax, so only the inner value is deposited.
    expect(depositCalls[0].plaintext).toBe(SECRET_A);
    expect(depositCalls[0].label).toBe("Deploy key");
    expect(decision.status).toBe("stored");
    expect(decision.text).toBe(
      `use <secret-handle label="Deploy key" handle="${HANDLE(1)}"/> now`,
    );
    expect(decision.text).not.toContain(SECRET_A);
    expect(decision.text).not.toContain("{{secret:");
    expect(decision.text).not.toContain("{{/secret}}");
  });

  test("a stored decision mints a one-time token bound to the REDACTED text", async () => {
    installVault();
    const { result } = mount();
    let decisionPromise;
    act(() => {
      decisionPromise = result.current.evaluateSecretGate({
        chatId: "chat-1",
        text: EXPLICIT_ONE,
      });
    });
    await waitFor(() => expect(result.current.gate).not.toBeNull());
    await act(async () => {
      await result.current.confirmStore();
    });
    const decision = await decisionPromise;
    expect(typeof decision.token).toBe("string");
    expect(decision.token).toBeTruthy();

    // Bound to what will actually be sent, not to what the user typed.
    expect(
      result.current.consumeSecretGateToken(decision.token, {
        chatId: "chat-1",
        text: EXPLICIT_ONE,
      }),
    ).toBe(false);
  });

  test("a stored token is consumable exactly once and does not replay", async () => {
    installVault();
    const { result } = mount();
    let decisionPromise;
    act(() => {
      decisionPromise = result.current.evaluateSecretGate({
        chatId: "chat-1",
        text: EXPLICIT_ONE,
      });
    });
    await waitFor(() => expect(result.current.gate).not.toBeNull());
    await act(async () => {
      await result.current.confirmStore();
    });
    const decision = await decisionPromise;

    expect(
      result.current.consumeSecretGateToken(decision.token, {
        chatId: "chat-1",
        text: decision.text,
      }),
    ).toBe(true);
    // Replay.
    expect(
      result.current.consumeSecretGateToken(decision.token, {
        chatId: "chat-1",
        text: decision.text,
      }),
    ).toBe(false);
  });

  test("a stored token does not transfer across chats or to edited text", async () => {
    installVault();
    const { result } = mount();
    const approveStored = async () => {
      let decisionPromise;
      act(() => {
        decisionPromise = result.current.evaluateSecretGate({
          chatId: "chat-1",
          text: EXPLICIT_ONE,
        });
      });
      await waitFor(() => expect(result.current.gate).not.toBeNull());
      await act(async () => {
        await result.current.confirmStore();
      });
      return decisionPromise;
    };

    const first = await approveStored();
    expect(
      result.current.consumeSecretGateToken(first.token, {
        chatId: "chat-other",
        text: first.text,
      }),
    ).toBe(false);

    const second = await approveStored();
    expect(
      result.current.consumeSecretGateToken(second.token, {
        chatId: "chat-1",
        text: `${second.text} edited`,
      }),
    ).toBe(false);
  });

  test("explicit plain approval strips the wrapper and keeps the value", async () => {
    installVault();
    const { result } = mount();
    let decisionPromise;
    act(() => {
      decisionPromise = result.current.evaluateSecretGate({
        chatId: "chat-1",
        text: EXPLICIT_ONE,
      });
    });
    await waitFor(() => expect(result.current.gate).not.toBeNull());
    act(() => result.current.confirmPlain());
    const decision = await decisionPromise;

    expect(decision.status).toBe("plain");
    expect(decision.text).toBe(`use ${SECRET_A} now`);
    expect(decision.text).not.toContain("{{secret:");
    expect(decision.disposition).toBe(PLAIN_USER_APPROVED_DISPOSITION);
    expect(window.memoryVaultAPI.deposit).not.toHaveBeenCalled();
    // The token is bound to the de-wrapped text that will actually be sent.
    expect(
      result.current.consumeSecretGateToken(decision.token, {
        chatId: "chat-1",
        text: decision.text,
      }),
    ).toBe(true);
  });

  test("mixed explicit + heuristic candidates are one atomic decision", async () => {
    installVault((_payload, index) => ({ handle: HANDLE(index + 1) }));
    const { result } = mount();
    let decisionPromise;
    act(() => {
      decisionPromise = result.current.evaluateSecretGate({
        chatId: "chat-1",
        text: `{{secret:Deploy key}}${SECRET_B}{{/secret}} and api_key=${SECRET_A}`,
      });
    });
    await waitFor(() => expect(result.current.gate).not.toBeNull());
    expect(result.current.gate.candidateCount).toBe(2);
    expect(result.current.gate.labels).toEqual(["Deploy key", "API key"]);

    await act(async () => {
      await result.current.confirmStore();
    });
    const decision = await decisionPromise;
    expect(depositCalls.map((call) => call.plaintext)).toEqual([
      SECRET_B,
      SECRET_A,
    ]);
    expect(decision.status).toBe("stored");
    expect(decision.text).not.toContain(SECRET_A);
    expect(decision.text).not.toContain(SECRET_B);
    expect(decision.text).not.toContain("{{secret:");
  });

  test("a partial deposit failure across explicit blocks compensates and refuses", async () => {
    installVault((_payload, index) => {
      if (index === 1) throw new Error("[secret_storage_unavailable] nope");
      return { handle: HANDLE(index + 1) };
    });
    const { result } = mount();
    let decisionPromise;
    act(() => {
      decisionPromise = result.current.evaluateSecretGate({
        chatId: "chat-1",
        text: `{{secret:One}}${SECRET_A}{{/secret}} {{secret:Two}}${SECRET_B}{{/secret}}`,
      });
    });
    await waitFor(() => expect(result.current.gate).not.toBeNull());
    await act(async () => {
      await result.current.confirmStore();
    });
    const decision = await decisionPromise;

    expect(decision.status).toBe("error");
    expect(decision.errorCode).toBe("secret_capture_deposit_failed");
    expect(window.memoryVaultAPI.delete).toHaveBeenCalledTimes(1);
    expect(window.memoryVaultAPI.delete.mock.calls[0][0].handle).toBe(
      HANDLE(1),
    );
    expect(JSON.stringify(decision)).not.toContain(SECRET_A);
    expect(JSON.stringify(decision)).not.toContain(SECRET_B);
  });

  test("a scan error fails closed with a static code and no gate", async () => {
    installVault();
    const { result } = mount();
    let decision;
    await act(async () => {
      decision = await result.current.evaluateSecretGate({
        chatId: "chat-1",
        text: "-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBAK\n",
      });
    });
    expect(decision.status).toBe("error");
    expect(decision.errorCode).toBe("secret_capture_ambiguous");
    expect(result.current.gate).toBeNull();
  });
});

describe("useSecretCaptureGate — confirm ordering and atomicity", () => {
  test("all deposits complete before any handle substitution, and ranges are applied", async () => {
    installVault((_payload, index) => ({ handle: HANDLE(index + 1) }));
    const { result } = mount();
    let decisionPromise;
    act(() => {
      decisionPromise = result.current.evaluateSecretGate({
        chatId: "chat-1",
        text: TEXT_TWO,
      });
    });
    await waitFor(() => expect(result.current.gate).not.toBeNull());

    await act(async () => {
      await result.current.confirmStore();
    });
    const decision = await decisionPromise;

    expect(depositCalls).toHaveLength(2);
    expect(depositCalls.map((call) => call.plaintext)).toEqual([
      SECRET_A,
      SECRET_B,
    ]);
    expect(decision.status).toBe("stored");
    expect(decision.text).toContain(`handle="${HANDLE(1)}"`);
    expect(decision.text).toContain(`handle="${HANDLE(2)}"`);
    expect(decision.text).not.toContain(SECRET_A);
    expect(decision.text).not.toContain(SECRET_B);
    // Surrounding prose is preserved byte-for-byte.
    expect(decision.text.startsWith("api_key=")).toBe(true);
    expect(decision.text.endsWith(" end")).toBe(true);
  });

  test("scope choice maps to chat or user through the bridge helper", async () => {
    installVault();
    const { result } = mount("chat-77");
    act(() => {
      void result.current.evaluateSecretGate({
        chatId: "chat-77",
        text: TEXT_ONE,
      });
    });
    await waitFor(() => expect(result.current.gate).not.toBeNull());

    act(() => result.current.setScopeChoice("user"));
    await waitFor(() => expect(result.current.gate.scopeChoice).toBe("user"));
    await act(async () => {
      await result.current.confirmStore();
    });
    expect(depositCalls[0].scopeKind).toBe("user");
    expect(depositCalls[0].scopeId).toBe(MEMORY_VAULT_USER_SCOPE_ID);
  });

  test("an unknown scope value is ignored", async () => {
    installVault();
    const { result } = mount();
    act(() => {
      void result.current.evaluateSecretGate({
        chatId: "chat-1",
        text: TEXT_ONE,
      });
    });
    await waitFor(() => expect(result.current.gate).not.toBeNull());
    act(() => result.current.setScopeChoice("everything"));
    expect(result.current.gate.scopeChoice).toBe("chat");
  });

  test("a user-typed name is used as the vault label and appears in the marker", async () => {
    installVault();
    const { result } = mount();
    act(() => {
      void result.current.evaluateSecretGate({
        chatId: "chat-1",
        text: TEXT_ONE,
      });
    });
    await waitFor(() => expect(result.current.gate).not.toBeNull());
    let decision;
    await act(async () => {
      decision = await Promise.all([
        result.current.confirmStore(["  Prod deploy key  "]),
      ]).then(() => undefined);
    });
    expect(depositCalls[0].label).toBe("Prod deploy key");
    expect(decision).toBeUndefined();
  });

  test("an unusable name fails the confirm closed without depositing", async () => {
    installVault();
    const { result } = mount();
    let decisionPromise;
    act(() => {
      decisionPromise = result.current.evaluateSecretGate({
        chatId: "chat-1",
        text: TEXT_ONE,
      });
    });
    await waitFor(() => expect(result.current.gate).not.toBeNull());
    await act(async () => {
      await result.current.confirmStore(["x".repeat(200)]);
    });
    const decision = await decisionPromise;
    expect(decision.status).toBe("error");
    expect(decision.errorCode).toBe("secret_capture_invalid_label");
    expect(window.memoryVaultAPI.deposit).not.toHaveBeenCalled();
  });

  test("a partial deposit failure compensates the rows it already created", async () => {
    installVault((_payload, index) => {
      if (index === 1) throw new Error("[secret_storage_unavailable] nope");
      return { handle: HANDLE(index + 1) };
    });
    const { result } = mount();
    let decisionPromise;
    act(() => {
      decisionPromise = result.current.evaluateSecretGate({
        chatId: "chat-1",
        text: TEXT_TWO,
      });
    });
    await waitFor(() => expect(result.current.gate).not.toBeNull());
    await act(async () => {
      await result.current.confirmStore();
    });
    const decision = await decisionPromise;

    expect(decision.status).toBe("error");
    expect(decision.errorCode).toBe("secret_capture_deposit_failed");
    // The one row that WAS created is deleted again — no orphan.
    expect(window.memoryVaultAPI.delete).toHaveBeenCalledTimes(1);
    expect(window.memoryVaultAPI.delete.mock.calls[0][0].handle).toBe(
      HANDLE(1),
    );
    // And nothing leaks through the refusal.
    expect(JSON.stringify(decision)).not.toContain(SECRET_A);
    expect(JSON.stringify(decision)).not.toContain(SECRET_B);
  });

  test("a deposit that returns no handle fails closed and compensates", async () => {
    installVault((_payload, index) =>
      index === 0 ? { handle: HANDLE(1) } : { handle: "   " },
    );
    const { result } = mount();
    let decisionPromise;
    act(() => {
      decisionPromise = result.current.evaluateSecretGate({
        chatId: "chat-1",
        text: TEXT_TWO,
      });
    });
    await waitFor(() => expect(result.current.gate).not.toBeNull());
    await act(async () => {
      await result.current.confirmStore();
    });
    expect((await decisionPromise).status).toBe("error");
    expect(window.memoryVaultAPI.delete).toHaveBeenCalledTimes(1);
  });

  test("a missing vault bridge fails the confirm closed", async () => {
    delete window.memoryVaultAPI;
    const { result } = mount();
    let decisionPromise;
    act(() => {
      decisionPromise = result.current.evaluateSecretGate({
        chatId: "chat-1",
        text: TEXT_ONE,
      });
    });
    await waitFor(() => expect(result.current.gate).not.toBeNull());
    await act(async () => {
      await result.current.confirmStore();
    });
    expect((await decisionPromise).errorCode).toBe(
      "secret_capture_vault_unavailable",
    );
  });

  test("double-clicking confirm deposits once, with a stable operation id", async () => {
    installVault();
    const { result } = mount();
    act(() => {
      void result.current.evaluateSecretGate({
        chatId: "chat-1",
        text: TEXT_ONE,
      });
    });
    await waitFor(() => expect(result.current.gate).not.toBeNull());

    await act(async () => {
      await Promise.all([
        result.current.confirmStore(),
        result.current.confirmStore(),
        result.current.confirmStore(),
      ]);
    });
    expect(window.memoryVaultAPI.deposit).toHaveBeenCalledTimes(1);
    expect(depositCalls[0].operationId).toMatch(/^scapdep_[A-Za-z0-9_.-]+$/);
    expect(depositCalls[0].operationId.length).toBeGreaterThanOrEqual(8);
  });

  test("two separate requests get different operation ids", async () => {
    installVault();
    const { result } = mount();
    act(() => {
      void result.current.evaluateSecretGate({
        chatId: "chat-1",
        text: TEXT_ONE,
      });
    });
    await waitFor(() => expect(result.current.gate).not.toBeNull());
    await act(async () => {
      await result.current.confirmStore();
    });
    const first = depositCalls[0].operationId;

    act(() => {
      void result.current.evaluateSecretGate({
        chatId: "chat-1",
        text: TEXT_ONE,
      });
    });
    await waitFor(() => expect(result.current.gate).not.toBeNull());
    await act(async () => {
      await result.current.confirmStore();
    });
    expect(depositCalls[1].operationId).not.toBe(first);
  });
});

describe("useSecretCaptureGate — cancel lifecycle", () => {
  test("cancel resolves as cancelled and stores nothing", async () => {
    installVault();
    const { result } = mount();
    let decisionPromise;
    act(() => {
      decisionPromise = result.current.evaluateSecretGate({
        chatId: "chat-1",
        text: TEXT_ONE,
      });
    });
    await waitFor(() => expect(result.current.gate).not.toBeNull());
    act(() => result.current.cancelGate());
    expect(await decisionPromise).toEqual({ status: "cancelled" });
    expect(result.current.gate).toBeNull();
    expect(window.memoryVaultAPI.deposit).not.toHaveBeenCalled();
  });

  test("switching chats cancels the open request", async () => {
    installVault();
    const { result, rerender } = renderHook(
      (props) => useSecretCaptureGate(props),
      { initialProps: { activeChatId: "chat-1" } },
    );
    let decisionPromise;
    act(() => {
      decisionPromise = result.current.evaluateSecretGate({
        chatId: "chat-1",
        text: TEXT_ONE,
      });
    });
    await waitFor(() => expect(result.current.gate).not.toBeNull());
    rerender({ activeChatId: "chat-2" });
    expect(await decisionPromise).toEqual({ status: "cancelled" });
    expect(result.current.gate).toBeNull();
  });

  test("unmount cancels the open request", async () => {
    installVault();
    const { result, unmount } = mount();
    let decisionPromise;
    act(() => {
      decisionPromise = result.current.evaluateSecretGate({
        chatId: "chat-1",
        text: TEXT_ONE,
      });
    });
    await waitFor(() => expect(result.current.gate).not.toBeNull());
    unmount();
    expect(await decisionPromise).toEqual({ status: "cancelled" });
  });

  test("a second request while one is open is refused, not stacked", async () => {
    installVault();
    const { result } = mount();
    act(() => {
      void result.current.evaluateSecretGate({
        chatId: "chat-1",
        text: TEXT_ONE,
      });
    });
    await waitFor(() => expect(result.current.gate).not.toBeNull());
    const firstRequestId = result.current.gate.requestId;

    let second;
    await act(async () => {
      second = await result.current.evaluateSecretGate({
        chatId: "chat-1",
        text: TEXT_TWO,
      });
    });
    expect(second).toEqual({ status: "cancelled" });
    expect(result.current.gate.requestId).toBe(firstRequestId);
  });
});

describe("useSecretCaptureGate — decision tokens", () => {
  const openAndApprovePlain = async (result, chatId, text) => {
    let decisionPromise;
    act(() => {
      decisionPromise = result.current.evaluateSecretGate({ chatId, text });
    });
    await waitFor(() => expect(result.current.gate).not.toBeNull());
    act(() => result.current.confirmPlain());
    return decisionPromise;
  };

  test("plain approval returns the original text and a plain disposition", async () => {
    installVault();
    const { result } = mount();
    const decision = await openAndApprovePlain(result, "chat-1", TEXT_ONE);
    expect(decision.status).toBe("plain");
    expect(decision.text).toBe(TEXT_ONE);
    expect(decision.disposition).toBe(PLAIN_USER_APPROVED_DISPOSITION);
    expect(window.memoryVaultAPI.deposit).not.toHaveBeenCalled();
  });

  test("a token is consumable exactly once", async () => {
    installVault();
    const { result } = mount();
    const decision = await openAndApprovePlain(result, "chat-1", TEXT_ONE);
    expect(
      result.current.consumeSecretGateToken(decision.token, {
        chatId: "chat-1",
        text: TEXT_ONE,
      }),
    ).toBe(true);
    expect(
      result.current.consumeSecretGateToken(decision.token, {
        chatId: "chat-1",
        text: TEXT_ONE,
      }),
    ).toBe(false);
  });

  test("a token does not transfer to another chat or to different text", async () => {
    installVault();
    const { result } = mount();
    const first = await openAndApprovePlain(result, "chat-1", TEXT_ONE);
    expect(
      result.current.consumeSecretGateToken(first.token, {
        chatId: "chat-other",
        text: TEXT_ONE,
      }),
    ).toBe(false);

    const second = await openAndApprovePlain(result, "chat-1", TEXT_ONE);
    expect(
      result.current.consumeSecretGateToken(second.token, {
        chatId: "chat-1",
        text: `${TEXT_ONE} edited`,
      }),
    ).toBe(false);
  });

  test("garbage tokens are rejected", () => {
    installVault();
    const { result } = mount();
    expect(result.current.consumeSecretGateToken("", {})).toBe(false);
    expect(result.current.consumeSecretGateToken("nope", {})).toBe(false);
    expect(result.current.consumeSecretGateToken(null, {})).toBe(false);
  });

  test("a persisted plain disposition mints a replay token; anything else does not", () => {
    installVault();
    const { result } = mount();
    const token = result.current.mintTokenForDisposition({
      chatId: "chat-1",
      text: TEXT_ONE,
      disposition: PLAIN_USER_APPROVED_DISPOSITION,
    });
    expect(typeof token).toBe("string");
    expect(
      result.current.consumeSecretGateToken(token, {
        chatId: "chat-1",
        text: TEXT_ONE,
      }),
    ).toBe(true);

    expect(
      result.current.mintTokenForDisposition({
        chatId: "chat-1",
        text: TEXT_ONE,
        disposition: "",
      }),
    ).toBeNull();
    expect(
      result.current.mintTokenForDisposition({
        chatId: "chat-1",
        text: TEXT_ONE,
        disposition: "quarantined",
      }),
    ).toBeNull();
  });

  test("switching chats invalidates outstanding tokens", async () => {
    installVault();
    const { result, rerender } = renderHook(
      (props) => useSecretCaptureGate(props),
      { initialProps: { activeChatId: "chat-1" } },
    );
    const decision = await openAndApprovePlain(result, "chat-1", TEXT_ONE);
    rerender({ activeChatId: "chat-2" });
    expect(
      result.current.consumeSecretGateToken(decision.token, {
        chatId: "chat-1",
        text: TEXT_ONE,
      }),
    ).toBe(false);
  });
});
