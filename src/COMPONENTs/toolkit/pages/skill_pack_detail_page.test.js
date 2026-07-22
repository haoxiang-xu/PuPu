import { act, render, screen, fireEvent, within } from "@testing-library/react";
import SkillPackDetailPage from "./skill_pack_detail_page";

jest.mock("../utils/skill_pack_store_install", () => ({
  __esModule: true,
  installStoreSkillPack: jest.fn(),
}));

jest.mock("../../../SERVICEs/toast", () => ({
  __esModule: true,
  toast: { success: jest.fn(), error: jest.fn() },
}));

jest.mock("../../../SERVICEs/toolkit_catalog_refresh", () => ({
  __esModule: true,
  emitToolkitCatalogRefresh: jest.fn(),
}));

const { installStoreSkillPack } = require("../utils/skill_pack_store_install");
const { emitToolkitCatalogRefresh } = require("../../../SERVICEs/toolkit_catalog_refresh");

const PACK = {
  id: "skillpack.test-pack",
  title: "Test Pack",
  titleZh: "测试包",
  blurb: "Five methodology commands.",
  source: {
    provider: "github",
    repo: "obra/superpowers",
    sha: "d884ae04edebef577e82ff7c4e143debd0bbec99",
    license: "MIT",
  },
  subset: ["skills/brainstorming", "skills/writing-plans"],
  manifest: [
    { path: "skills/brainstorming/SKILL.md", sha256: "b".repeat(64) },
    { path: "skills/writing-plans/SKILL.md", sha256: "c".repeat(64) },
  ],
  review: { recordId: "S5-test", reviewedAt: "2026-07-18", reviewers: ["x"] },
  commandPreviews: [
    { name: "brainstorming", description: "Explore before building", descriptionZh: "动手前先构思" },
    { name: "writing-plans", description: "Plans in bite-sized steps", descriptionZh: "分步计划" },
  ],
};

describe("SkillPackDetailPage — provenance-strip detail (option B)", () => {
  test("renders header, provenance strip, commands and about", () => {
    render(<SkillPackDetailPage pack={PACK} isDark={false} onBack={() => {}} />);

    expect(screen.getByText("Test Pack")).toBeInTheDocument();

    /* Provenance strip: pinned repo@shortsha, fingerprint gate, review+license */
    const strip = screen.getByTestId("skillpack-provenance");
    expect(strip.textContent).toContain("obra/superpowers");
    expect(strip.textContent).toContain("@ d884ae0");
    expect(strip.textContent).toContain("SHA-256 verified");
    expect(strip.textContent).toContain("2026-07-18");
    expect(strip.textContent).toContain("MIT");

    /* Commands render as /name rows with descriptions, count in the title */
    expect(screen.getByText("/brainstorming")).toBeInTheDocument();
    expect(screen.getByText("/writing-plans")).toBeInTheDocument();
    expect(screen.getByText("Explore before building")).toBeInTheDocument();
    expect(screen.getByText(/Commands · 2/i)).toBeInTheDocument();

    /* About carries the blurb (also in the header tagline — 2 instances) */
    expect(screen.getAllByText("Five methodology commands.").length).toBeGreaterThan(0);
  });

  test("falls back to subset basenames when commandPreviews is absent", () => {
    const { commandPreviews, ...bare } = PACK;
    render(<SkillPackDetailPage pack={bare} isDark={false} onBack={() => {}} />);

    expect(screen.getByText("/brainstorming")).toBeInTheDocument();
    expect(screen.getByText("/writing-plans")).toBeInTheDocument();
  });

  test("GET runs the install chain; success flips the action to Installed and emits refresh", async () => {
    installStoreSkillPack.mockResolvedValue({
      toolkitId: "skillpack.test-pack",
      toolkitName: "Test Pack",
      skills: [{ name: "brainstorming" }, { name: "writing-plans" }],
    });
    render(<SkillPackDetailPage pack={PACK} isDark={false} onBack={() => {}} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /get/i }));
    });

    expect(installStoreSkillPack).toHaveBeenCalledWith(PACK);
    expect(emitToolkitCatalogRefresh).toHaveBeenCalledWith({
      source: "skill_pack_store_install",
    });
    expect(screen.getByRole("button", { name: /installed/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /get/i })).not.toBeInTheDocument();
  });

  test("a coded failure keeps GET and shows the mapped error copy", async () => {
    const failure = new Error("integrity");
    failure.code = "integrity";
    installStoreSkillPack.mockRejectedValue(failure);
    render(<SkillPackDetailPage pack={PACK} isDark={false} onBack={() => {}} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /get/i }));
    });

    expect(screen.getByText(/reviewed fingerprint/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /get/i })).toBeInTheDocument();
  });

  test("back button calls onBack", () => {
    const onBack = jest.fn();
    render(<SkillPackDetailPage pack={PACK} isDark={false} onBack={onBack} />);

    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]);
    expect(onBack).toHaveBeenCalled();
  });
});
