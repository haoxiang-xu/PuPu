import { resetAllSettingsSafely } from "./reset_settings_coordinator";
import { resetSettings } from "../../../SERVICEs/settings_repository";
import {
  beginDefaultToolkitSettingsReset,
  endDefaultToolkitSettingsReset,
  resetDefaultToolkitMirrorForSettingsReset,
} from "../../../SERVICEs/default_toolkit_store";
import {
  beginToolkitAutoApproveSettingsReset,
  endToolkitAutoApproveSettingsReset,
  resetToolkitAutoApproveMirrorForSettingsReset,
} from "../../../SERVICEs/toolkit_auto_approve_store";
import {
  beginComputerUsePreferencesSettingsReset,
  endComputerUsePreferencesSettingsReset,
  resetComputerUsePreferencesMirrorForSettingsReset,
} from "../../../SERVICEs/computer_use_preferences_sql";
import { disableComputerUse } from "../computer_use/enable_controller";

jest.mock("../../../SERVICEs/settings_repository", () => ({
  resetSettings: jest.fn(),
}));
jest.mock("../../../SERVICEs/default_toolkit_store", () => ({
  beginDefaultToolkitSettingsReset: jest.fn(),
  endDefaultToolkitSettingsReset: jest.fn(),
  resetDefaultToolkitMirrorForSettingsReset: jest.fn(),
}));
jest.mock("../../../SERVICEs/toolkit_auto_approve_store", () => ({
  beginToolkitAutoApproveSettingsReset: jest.fn(),
  endToolkitAutoApproveSettingsReset: jest.fn(),
  resetToolkitAutoApproveMirrorForSettingsReset: jest.fn(),
}));
jest.mock("../../../SERVICEs/computer_use_preferences_sql", () => ({
  beginComputerUsePreferencesSettingsReset: jest.fn(),
  endComputerUsePreferencesSettingsReset: jest.fn(),
  resetComputerUsePreferencesMirrorForSettingsReset: jest.fn(),
}));
jest.mock("../computer_use/enable_controller", () => ({
  disableComputerUse: jest.fn(),
}));

const deferred = () => {
  let resolve;
  const promise = new Promise((next) => {
    resolve = next;
  });
  return { promise, resolve };
};

describe("resetAllSettingsSafely", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    disableComputerUse.mockResolvedValue({
      pushed: true,
      ok: true,
      enabled: false,
    });
    beginDefaultToolkitSettingsReset.mockResolvedValue();
    beginToolkitAutoApproveSettingsReset.mockResolvedValue();
    beginComputerUsePreferencesSettingsReset.mockResolvedValue();
    resetSettings.mockImplementation(async ({ beforeReset } = {}) => {
      if (beforeReset) await beforeReset();
      return { ok: true, mode: "sql" };
    });
  });

  test("confirms sidecar OFF, drains all barriers, resets, then reopens writes", async () => {
    const pendingDefault = deferred();
    beginDefaultToolkitSettingsReset.mockReturnValue(pendingDefault.promise);

    const resetPromise = resetAllSettingsSafely();
    expect(resetSettings).toHaveBeenCalledTimes(1);
    expect(disableComputerUse).toHaveBeenCalledTimes(1);
    for (
      let turn = 0;
      turn < 5 && beginDefaultToolkitSettingsReset.mock.calls.length === 0;
      turn += 1
    ) {
      await Promise.resolve();
    }
    expect(beginDefaultToolkitSettingsReset).toHaveBeenCalledTimes(1);
    expect(beginToolkitAutoApproveSettingsReset).toHaveBeenCalledTimes(1);
    expect(beginComputerUsePreferencesSettingsReset).toHaveBeenCalledTimes(1);
    expect(
      disableComputerUse.mock.invocationCallOrder[0],
    ).toBeLessThan(beginDefaultToolkitSettingsReset.mock.invocationCallOrder[0]);

    pendingDefault.resolve();
    await expect(resetPromise).resolves.toEqual({ ok: true, mode: "sql" });
    expect(resetSettings).toHaveBeenCalledTimes(1);
    expect(resetDefaultToolkitMirrorForSettingsReset).toHaveBeenCalledTimes(1);
    expect(resetToolkitAutoApproveMirrorForSettingsReset).toHaveBeenCalledTimes(
      1,
    );
    expect(
      resetComputerUsePreferencesMirrorForSettingsReset,
    ).toHaveBeenCalledTimes(1);
    expect(endDefaultToolkitSettingsReset).toHaveBeenCalledTimes(1);
    expect(endToolkitAutoApproveSettingsReset).toHaveBeenCalledTimes(1);
    expect(endComputerUsePreferencesSettingsReset).toHaveBeenCalledTimes(1);
  });

  test("does not clear authorization when sidecar OFF is not confirmed", async () => {
    disableComputerUse.mockResolvedValue({
      pushed: false,
      ok: false,
      enabled: true,
    });

    await expect(resetAllSettingsSafely()).rejects.toMatchObject({
      code: "computer_use_disable_not_confirmed",
    });
    expect(beginDefaultToolkitSettingsReset).not.toHaveBeenCalled();
    expect(resetSettings).toHaveBeenCalledTimes(1);
    expect(resetDefaultToolkitMirrorForSettingsReset).not.toHaveBeenCalled();
    expect(endDefaultToolkitSettingsReset).not.toHaveBeenCalled();
    expect(endToolkitAutoApproveSettingsReset).not.toHaveBeenCalled();
    expect(endComputerUsePreferencesSettingsReset).not.toHaveBeenCalled();
  });

  test("a reset failure reopens all barriers without clearing mirrors", async () => {
    resetSettings.mockImplementation(async ({ beforeReset } = {}) => {
      if (beforeReset) await beforeReset();
      throw new Error("[settings_storage_unavailable] gone");
    });

    await expect(resetAllSettingsSafely()).rejects.toThrow(
      /settings_storage_unavailable/,
    );
    expect(resetDefaultToolkitMirrorForSettingsReset).not.toHaveBeenCalled();
    expect(resetToolkitAutoApproveMirrorForSettingsReset).not.toHaveBeenCalled();
    expect(
      resetComputerUsePreferencesMirrorForSettingsReset,
    ).not.toHaveBeenCalled();
    expect(endDefaultToolkitSettingsReset).toHaveBeenCalledTimes(1);
    expect(endToolkitAutoApproveSettingsReset).toHaveBeenCalledTimes(1);
    expect(endComputerUsePreferencesSettingsReset).toHaveBeenCalledTimes(1);
  });

  test("concurrent callers share one reset and cannot reopen each other's barriers", async () => {
    const pendingReset = deferred();
    resetSettings.mockImplementation(async ({ beforeReset } = {}) => {
      if (beforeReset) await beforeReset();
      return pendingReset.promise;
    });

    const first = resetAllSettingsSafely();
    const second = resetAllSettingsSafely();
    expect(second).toBe(first);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(disableComputerUse).toHaveBeenCalledTimes(1);
    expect(beginDefaultToolkitSettingsReset).toHaveBeenCalledTimes(1);
    expect(resetSettings).toHaveBeenCalledTimes(1);
    expect(endDefaultToolkitSettingsReset).not.toHaveBeenCalled();

    pendingReset.resolve({ ok: true });
    await expect(first).resolves.toEqual({ ok: true });
    expect(endDefaultToolkitSettingsReset).toHaveBeenCalledTimes(1);
    expect(endToolkitAutoApproveSettingsReset).toHaveBeenCalledTimes(1);
    expect(endComputerUsePreferencesSettingsReset).toHaveBeenCalledTimes(1);
  });
});
