/**
 * Ticket #291 (BC-005): a `409 skill_inventory_stale` refusal from the sidecar
 * must refresh the renderer's skill inventory and surface an actionable toast
 * (resend), never silently resolve `/name` against another source.
 */
jest.mock("../../../SERVICEs/plugin_skill_sync", () => ({
  resyncSkillInventory: jest.fn(() => Promise.resolve()),
}));
jest.mock("../../../SERVICEs/toast", () => ({
  toast: { error: jest.fn(), success: jest.fn(), info: jest.fn(), warning: jest.fn() },
}));

import { resyncSkillInventory } from "../../../SERVICEs/plugin_skill_sync";
import { toast } from "../../../SERVICEs/toast";
import { handleSkillInventoryStaleError } from "./use_chat_stream";

describe("handleSkillInventoryStaleError", () => {
  beforeEach(() => {
    resyncSkillInventory.mockClear();
    toast.error.mockClear();
  });

  test("refreshes the inventory and toasts a resend hint for the stale code", () => {
    const t = (key) => `T:${key}`;
    const handled = handleSkillInventoryStaleError(
      { code: "skill_inventory_stale", message: "refresh and resend" },
      t,
    );

    expect(handled).toBe(true);
    expect(resyncSkillInventory).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith("T:chat.skill_inventory_stale.title", {
      description: "T:chat.skill_inventory_stale.description",
      dedupeKey: "skill_inventory_stale",
    });
  });

  test("ignores every other error and never touches the inventory", () => {
    expect(handleSkillInventoryStaleError({ code: "stream_error" }, (k) => k)).toBe(false);
    expect(handleSkillInventoryStaleError(null, (k) => k)).toBe(false);
    expect(handleSkillInventoryStaleError({ message: "no code" }, undefined)).toBe(false);
    expect(resyncSkillInventory).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });
});
