import {
  isComputerUseLocalBetaPersisted,
  writeComputerUseLocalBeta,
} from "./computer_use_local_beta_store";

const STORAGE_KEY = "computer_use_local_beta_enabled";

beforeEach(() => {
  window.localStorage.clear();
});

describe("computer_use_local_beta_store", () => {
  test("persists an explicit, versioned beta choice", () => {
    const record = writeComputerUseLocalBeta(true);
    expect(record).toMatchObject({ version: 1, enabled: true });
    expect(isComputerUseLocalBetaPersisted()).toBe(true);

    writeComputerUseLocalBeta(false);
    expect(isComputerUseLocalBetaPersisted()).toBe(false);
  });

  test("fails closed for absent, malformed, or stale records", () => {
    expect(isComputerUseLocalBetaPersisted()).toBe(false);
    window.localStorage.setItem(STORAGE_KEY, "{broken");
    expect(isComputerUseLocalBetaPersisted()).toBe(false);
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 2, enabled: true }),
    );
    expect(isComputerUseLocalBetaPersisted()).toBe(false);
  });
});
