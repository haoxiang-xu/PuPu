import { filterToolkitsByCapabilities } from "./filter_toolkits_by_capabilities";

describe("filterToolkitsByCapabilities", () => {
  const catalog = [
    { id: "plain", capabilityRequirements: [] },
    { id: "computer", capabilityRequirements: ["computer_use"] },
    { id: "vision", capabilityRequirements: ["vision"] },
  ];

  test("keeps ordinary entries and every entry whose requirements are met", () => {
    expect(
      filterToolkitsByCapabilities(catalog, {
        vision: true,
        computer_use: { supported: true },
      }).map((entry) => entry.id),
    ).toEqual(["plain", "computer", "vision"]);
  });

  test("removes entries with missing or unsupported capabilities", () => {
    expect(
      filterToolkitsByCapabilities(catalog, {
        vision: false,
        computer_use: { supported: false },
      }).map((entry) => entry.id),
    ).toEqual(["plain"]);
  });

  test("fails closed on a malformed catalog", () => {
    expect(filterToolkitsByCapabilities(null, {})).toEqual([]);
  });
});
