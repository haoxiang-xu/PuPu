import { render } from "@testing-library/react";
import ShippedProviderMigrationBootSync from "./shipped_provider_migration_boot_sync";
import { migrateShippedProviderCopies } from "../../../SERVICEs/custom_provider_store";

jest.mock("../../../SERVICEs/custom_provider_store", () => ({
  __esModule: true,
  migrateShippedProviderCopies: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  // CRA's jest runs with resetMocks:true — (re)establish the impl each test.
  migrateShippedProviderCopies.mockReturnValue({ migrated: false, slugs: [] });
});

describe("ShippedProviderMigrationBootSync", () => {
  test("renders nothing and runs the cleanup once on mount", () => {
    const { container } = render(<ShippedProviderMigrationBootSync />);

    expect(container.firstChild).toBeNull();
    expect(migrateShippedProviderCopies).toHaveBeenCalledTimes(1);
  });

  test("a rejected persistence never throws out of the effect", () => {
    migrateShippedProviderCopies.mockReturnValue({
      migrated: true,
      slugs: ["deepseek"],
      persistence: Promise.reject(new Error("boom")),
    });

    expect(() => render(<ShippedProviderMigrationBootSync />)).not.toThrow();
  });

  /* Nothing here is load-bearing — the store's read path already ignores a
     legacy copy — so a throwing cleanup must not take the boot down with it. */
  test("a throwing cleanup is not a boot failure", () => {
    migrateShippedProviderCopies.mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    expect(() => render(<ShippedProviderMigrationBootSync />)).not.toThrow();
  });
});
