import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ImportSkillsPage from "./import_skills_page";

jest.mock("../../../BUILTIN_COMPONENTs/mini_react/use_translation", () => ({
  __esModule: true,
  useTranslation: () => ({
    t: (key, vars) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
    locale: "en",
    setLocale: () => {},
  }),
}));

jest.mock("../../../BUILTIN_COMPONENTs/input/button", () => ({
  __esModule: true,
  default: ({ label, onClick, disabled }) => (
    <button disabled={disabled} onClick={onClick}>
      {label}
    </button>
  ),
}));

const mockShowOpenDialog = jest.fn();
jest.mock("../../../SERVICEs/bridges/unchain_bridge", () => ({
  __esModule: true,
  runtimeBridge: { showOpenDialog: (...a) => mockShowOpenDialog(...a) },
}));

const mockScanSkillDir = jest.fn();
const mockInstallSkillPack = jest.fn();
jest.mock("../../../SERVICEs/api", () => ({
  __esModule: true,
  default: {
    unchain: {
      scanSkillDir: (...a) => mockScanSkillDir(...a),
      installSkillPack: (...a) => mockInstallSkillPack(...a),
    },
  },
}));

const mockGetCommand = jest.fn();
jest.mock("../../../SERVICEs/command_registry", () => ({
  __esModule: true,
  getCommand: (...a) => mockGetCommand(...a),
}));

const mockEmitRefresh = jest.fn();
jest.mock("../../../SERVICEs/toolkit_catalog_refresh", () => ({
  __esModule: true,
  emitToolkitCatalogRefresh: (...a) => mockEmitRefresh(...a),
}));

const mockToastSuccess = jest.fn();
jest.mock("../../../SERVICEs/toast", () => ({
  __esModule: true,
  toast: { success: (...a) => mockToastSuccess(...a) },
}));

const skillFile = (name, description) => `---
name: ${name}
description: ${description}
---
# ${name}
body`;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("ImportSkillsPage", () => {
  test("scans, previews importable + conflicts, and installs the pure-skill pack", async () => {
    mockShowOpenDialog.mockResolvedValue({ filePaths: ["/x/superpowers"], canceled: false });
    mockScanSkillDir.mockResolvedValue({
      ok: true,
      dirName: "superpowers",
      files: [
        { relPath: "plan/SKILL.md", content: skillFile("plan", "Plan a task"), folderFiles: [] },
        { relPath: "brainstorming/SKILL.md", content: skillFile("brainstorming", "Explore"), folderFiles: [] },
      ],
    });
    // /plan already exists -> must be surfaced as a conflict, not swallowed
    mockGetCommand.mockImplementation((cmd) => (cmd === "/plan" ? { name: "/plan" } : null));
    mockInstallSkillPack.mockResolvedValue({ toolkit: { toolkitId: "skillpack.superpowers" } });
    const onDone = jest.fn();

    render(<ImportSkillsPage isDark={false} onDone={onDone} />);

    fireEvent.click(screen.getByRole("button", { name: "toolkit.import_skills_pick" }));

    await screen.findByText(/import_skills_importable:.*"count":2/);
    expect(screen.getByText(/import_skills_conflicts:.*\/plan/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /import_skills_install/ }));

    await waitFor(() => expect(mockInstallSkillPack).toHaveBeenCalledTimes(1));
    const arg = mockInstallSkillPack.mock.calls[0][0];
    expect(arg.toolkitId).toBe("skillpack.superpowers");
    expect(arg.skills).toHaveLength(2);
    expect(arg.skills.every((s) => s.phase === "composer" && Array.isArray(s.tools))).toBe(true);
    expect(mockEmitRefresh).toHaveBeenCalled();
    expect(mockToastSuccess).toHaveBeenCalled();
    expect(onDone).toHaveBeenCalled();
  });

  test("does nothing when the folder picker is cancelled", async () => {
    mockShowOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
    render(<ImportSkillsPage isDark={false} onDone={jest.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "toolkit.import_skills_pick" }));
    await waitFor(() => expect(mockShowOpenDialog).toHaveBeenCalled());
    expect(mockScanSkillDir).not.toHaveBeenCalled();
  });
});
