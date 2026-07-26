import { render } from "@testing-library/react";
import ProviderSecretMigrationBootSync from "./provider_secret_migration_boot_sync";
import { maybeMigrateProviderSecrets } from "../../../SERVICEs/provider_secret_migration";

jest.mock("../../../SERVICEs/provider_secret_migration", () => ({
  __esModule: true,
  maybeMigrateProviderSecrets: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  // CRA's jest runs with resetMocks:true — (re)establish the impl each test.
  maybeMigrateProviderSecrets.mockResolvedValue(undefined);
});

describe("ProviderSecretMigrationBootSync", () => {
  test("renders nothing and fires the migration once on mount", () => {
    const { container } = render(<ProviderSecretMigrationBootSync />);
    expect(container.firstChild).toBeNull();
    expect(maybeMigrateProviderSecrets).toHaveBeenCalledTimes(1);
  });

  test("a rejected migration never throws out of the effect", () => {
    maybeMigrateProviderSecrets.mockReturnValue(
      Promise.reject(new Error("boom")),
    );
    expect(() => render(<ProviderSecretMigrationBootSync />)).not.toThrow();
  });
});
