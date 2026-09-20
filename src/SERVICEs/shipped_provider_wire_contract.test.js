/**
 * BC-002 producer side — the wire shape a shipped provider puts on the request.
 *
 * Making DeepSeek/Kimi first class changes where their DEFINITION comes from,
 * not what travels. This suite pins the producer half of that claim and emits
 * the real producer artifact that the backend's strict consumer test
 * (unchain_runtime/server/tests/test_shipped_provider_wire_contract.py) reads
 * back, so the two sides are checked against one artifact rather than against
 * two hand-written fixtures that can drift apart.
 *
 * Admission: the producer is CLOSED by whitelist CONSTRUCTION — the payload is
 * built field by field, so provenance (origin/source/enabled), timestamps and
 * secrets are structurally unreachable rather than deleted afterwards. The
 * consumer reads the same way: it constructs its config from named fields and
 * never iterates the object, so a field the producer does not emit cannot
 * influence it.
 */
import fs from "fs";
import path from "path";

import {
  buildProviderInjectionPayload,
  normalizeCustomProvider,
  resolveShippedDefinition,
} from "./custom_provider_store";
import { listShippedSlugs } from "./shipped_provider_registry";

const ARTIFACT_DIR = path.resolve(
  __dirname,
  "../../docs/implementation/ticket-202-evidence",
);
const ARTIFACT = path.join(ARTIFACT_DIR, "shipped_provider_wire.json");

/* The exact key set buildProviderInjectionPayload may emit. A new key here is a
   wire change and must be a deliberate contract decision on both sides. */
const ALLOWED_WIRE_KEYS = [
  "auth",
  "base_url",
  "default_model",
  "display_name",
  "extra_headers",
  "id",
  "models",
  "protocol",
  "slug",
  "timeout_seconds",
];

const NEVER_ON_THE_WIRE = [
  "origin",
  "source",
  "enabled",
  "created_at",
  "updated_at",
  "api_key",
  "apiKey",
  "secret",
  "token",
  "notes",
  "description",
  "metadata",
];

describe("BC-002 — shipped provider wire shape (producer)", () => {
  test("Kimi models that support non-thinking mode receive the compatible tool default", () => {
    ["kimi", "kimi-cn"].forEach((slug) => {
      const payload = buildProviderInjectionPayload(resolveShippedDefinition(slug));
      payload.models.filter((model) => model.id !== "kimi-k2.7-code").forEach((model) => {
        expect(model.default_payload).toEqual({ thinking: { type: "disabled" } });
      });
    });
  });

  test("every shipped provider emits only allowed wire keys", () => {
    listShippedSlugs().forEach((slug) => {
      const payload = buildProviderInjectionPayload(
        resolveShippedDefinition(slug),
      );

      expect(payload).not.toBeNull();
      Object.keys(payload).forEach((key) => {
        expect(ALLOWED_WIRE_KEYS).toContain(key);
      });
      NEVER_ON_THE_WIRE.forEach((key) => {
        expect(payload).not.toHaveProperty(key);
      });
    });
  });

  /* The point of the ticket restated as a contract: resolving the definition
     from the app instead of from a stored copy must not alter one byte of what
     the backend receives. */
  test("an app-resolved definition and a stored copy produce identical wire bytes", () => {
    listShippedSlugs().forEach((slug) => {
      const shipped = resolveShippedDefinition(slug);

      // What the pre-#202 path stored and then sent: the same envelope run
      // through the normalizer and decorated with the private fields a stored
      // entry carries.
      const storedCopy = {
        ...normalizeCustomProvider({ provider: { ...shipped } }).provider,
        enabled: true,
        source: "preset",
        created_at: "2026-08-19T00:00:00.000Z",
        updated_at: "2026-08-19T00:00:00.000Z",
      };

      expect(JSON.stringify(buildProviderInjectionPayload(shipped))).toBe(
        JSON.stringify(buildProviderInjectionPayload(storedCopy)),
      );
    });
  });

  test("a stray field on the definition cannot reach the wire", () => {
    const def = {
      ...resolveShippedDefinition("deepseek"),
      smuggled: "nope",
      api_key: "sk-should-never-travel",
    };

    const payload = buildProviderInjectionPayload(def);

    expect(payload).not.toHaveProperty("smuggled");
    expect(payload).not.toHaveProperty("api_key");
    expect(JSON.stringify(payload)).not.toContain("sk-should-never-travel");
  });

  test("emits the producer artifact the backend contract test consumes", () => {
    const artifact = {
      note:
        "Real producer output: buildProviderInjectionPayload(resolveShippedDefinition(slug)). " +
        "Regenerate by running this suite. Consumed by " +
        "unchain_runtime/server/tests/test_shipped_provider_wire_contract.py.",
      ticket: "https://github.com/haoxiang-xu/PuPu/issues/202",
      contract: "BC-002",
      providers: listShippedSlugs().reduce((acc, slug) => {
        acc[slug] = buildProviderInjectionPayload(resolveShippedDefinition(slug));
        return acc;
      }, {}),
    };

    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    fs.writeFileSync(ARTIFACT, `${JSON.stringify(artifact, null, 2)}\n`);

    const written = JSON.parse(fs.readFileSync(ARTIFACT, "utf8"));
    expect(Object.keys(written.providers)).toEqual(listShippedSlugs());
  });
});
