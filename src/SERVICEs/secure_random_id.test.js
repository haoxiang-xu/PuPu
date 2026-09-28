import { secureRandomId } from "./secure_random_id";
import { generateId, ensureUniqueNodeId } from "./chat_storage/chat_storage_constants";
import { createTurnMutationOperationId } from "./turn_mutation_outbox";

afterEach(() => jest.restoreAllMocks());

test("durable identities use all 128 bits supplied by Web Crypto", () => {
  const entropy = jest.spyOn(globalThis.crypto, "getRandomValues")
    .mockImplementation((bytes) => {
      bytes.set(Array.from({ length: 16 }, (_, index) => index));
      return bytes;
    });
  const random = jest.spyOn(Math, "random").mockImplementation(() => {
    throw new Error("Predictable entropy must not be used");
  });
  const suffix = "000102030405060708090a0b0c0d0e0f";
  expect(secureRandomId()).toBe(suffix);
  expect(generateId("chat")).toMatch(new RegExp(`^chat-\\d+-${suffix}$`));
  expect(createTurnMutationOperationId("chat-a"))
    .toMatch(new RegExp(`^turn-chat-a-\\d+-${suffix}$`));
  expect(ensureUniqueNodeId({ occupied: {} }, "occupied", "chn"))
    .toBe(`chn-${suffix}`);
  expect(entropy).toHaveBeenCalledTimes(4);
  expect(random).not.toHaveBeenCalled();
});

test("crypto failure cannot silently generate a predictable durable identity", () => {
  jest.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(() => {
    throw new Error("Entropy unavailable");
  });
  expect(() => generateId("chat")).toThrow("Entropy unavailable");
  expect(() => createTurnMutationOperationId("chat-a")).toThrow("Entropy unavailable");
  // Existing identities remain intact and do not require fresh entropy.
  expect(ensureUniqueNodeId({}, "legacy-id", "chn")).toBe("legacy-id");
});
