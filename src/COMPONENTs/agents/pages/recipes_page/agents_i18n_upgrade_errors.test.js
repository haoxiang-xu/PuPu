import { createLegacyUpgradeController } from "./legacy_upgrade/legacy_upgrade_controller";
import { agentProblemMessage } from "./agents_i18n";
const resource = { id: "raw", name: "raw name", edit_token: "edit-1", document: { nodes: [], edges: [] } };
const t = (key) => `T:${key}`;
test("a locally absent upgrade manifest keeps its exact refusal fields and never starts inventory", async () => {
  const services = { capabilities: jest.fn().mockResolvedValue({}), inspect: jest.fn() };
  const controller = createLegacyUpgradeController(services); await controller.open(resource);
  expect(controller.current().error).toEqual({ code: "capabilities_unreadable", path: [], message: "The host did not name its runtime." });
  expect(agentProblemMessage(controller.current().error, t)).toMatch(/^T:agents\./);
  expect(services.inspect).not.toHaveBeenCalled();
});
test("an upgrade service error with identical English remains opaque", async () => {
  const message = "The host did not name its runtime.";
  const controller = createLegacyUpgradeController({ capabilities: jest.fn().mockRejectedValue(new Error(message)) });
  await controller.open(resource); expect(agentProblemMessage(controller.current().error, t)).toBe(message);
});
