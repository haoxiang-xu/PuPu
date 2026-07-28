import {
  listStoreSkillPacks,
  installStoreSkillPack,
} from "./skill_pack_store_install";
import api from "../../../SERVICEs/api";

jest.mock("../../../SERVICEs/api", () => ({
  __esModule: true,
  default: {
    unchain: {
      downloadSkillRepo: jest.fn(),
      scanSkillDir: jest.fn(),
      installSkillPack: jest.fn(),
    },
  },
}));

const VALID_SHA = "d884ae04edebef577e82ff7c4e143debd0bbec99";

const validPack = (overrides = {}) => ({
  id: "skillpack.test-pack",
  title: "Test Pack",
  blurb: "Some skills.",
  source: { provider: "github", repo: "obra/superpowers", sha: VALID_SHA, license: "MIT" },
  subset: ["skills/brainstorming"],
  manifest: [{ path: "skills/brainstorming/SKILL.md", sha256: "b".repeat(64) }],
  review: { recordId: "S5-test", reviewedAt: "2026-07-18", reviewers: ["x"] },
  ...overrides,
});

/* A minimal scan result whose one file passes every S3 semantic gate. */
const GOOD_SCAN = {
  ok: true,
  dirName: "pupu-skillpack-3f2a",
  files: [
    {
      relPath: "skills/brainstorming/SKILL.md",
      content: "---\nname: brainstorming\ndescription: Ideate before building.\n---\nBody.",
      folderFiles: ["SKILL.md"],
    },
  ],
};

describe("listStoreSkillPacks — fail-closed curation gate", () => {
  test("the shipped curation entry passes its own gate", () => {
    /* The real curation JSON ships superpowers-essentials — the gate must
       accept it, otherwise the store silently loses the pack. */
    const packs = listStoreSkillPacks();
    expect(packs.map((p) => p.id)).toContain("skillpack.superpowers-essentials");
  });
});

describe("installStoreSkillPack — orchestration", () => {
  beforeEach(() => {
    api.unchain.downloadSkillRepo.mockResolvedValue({ ok: true, dir: "/tmp/x" });
    api.unchain.scanSkillDir.mockResolvedValue(GOOD_SCAN);
    api.unchain.installSkillPack.mockResolvedValue({});
  });

  test("happy path: download → scan → build → install, with the pack identity FORCED to the entry id", async () => {
    const entry = validPack();
    const installed = await installStoreSkillPack(entry);

    expect(api.unchain.downloadSkillRepo).toHaveBeenCalledWith({
      repo: "obra/superpowers",
      sha: VALID_SHA,
      manifest: entry.manifest,
    });
    expect(api.unchain.scanSkillDir).toHaveBeenCalledWith("/tmp/x");

    const sent = api.unchain.installSkillPack.mock.calls[0][0];
    /* Adjudication 1: id IS the installed toolkitId — the temp dir's uuid
       name must never leak into identity via toSkillPackId. */
    expect(sent.toolkitId).toBe("skillpack.test-pack");
    expect(sent.toolkitName).toBe("Test Pack");
    expect(sent.skills).toHaveLength(1);
    expect(sent.skills[0].name).toBe("brainstorming");
    expect(installed.toolkitId).toBe("skillpack.test-pack");
  });

  test("a failed download surfaces its r1.2 code and never reaches scan/install", async () => {
    api.unchain.downloadSkillRepo.mockResolvedValue({ ok: false, error: "integrity" });

    await expect(installStoreSkillPack(validPack())).rejects.toMatchObject({
      code: "integrity",
    });
    expect(api.unchain.scanSkillDir).not.toHaveBeenCalled();
    expect(api.unchain.installSkillPack).not.toHaveBeenCalled();
  });

  test("a shapeless download failure falls back to the network code", async () => {
    api.unchain.downloadSkillRepo.mockResolvedValue(null);

    await expect(installStoreSkillPack(validPack())).rejects.toMatchObject({
      code: "network",
    });
  });

  test("a failed scan maps to fs", async () => {
    api.unchain.scanSkillDir.mockResolvedValue({ ok: false, files: [] });

    await expect(installStoreSkillPack(validPack())).rejects.toMatchObject({
      code: "fs",
    });
    expect(api.unchain.installSkillPack).not.toHaveBeenCalled();
  });

  test("content the S3 semantic gates fully reject maps to malformed", async () => {
    /* A scripts-bearing folder — S6a's byte gate passed, but the reviewed
       content violates the instruction-only rule: nothing installable. */
    api.unchain.scanSkillDir.mockResolvedValue({
      ok: true,
      dirName: "pupu-skillpack-9c1b",
      files: [
        {
          relPath: "skills/evil/SKILL.md",
          content: "---\nname: evil\ndescription: Nope.\n---\nBody.",
          folderFiles: ["SKILL.md", "scripts/run.sh"],
        },
      ],
    });

    await expect(installStoreSkillPack(validPack())).rejects.toMatchObject({
      code: "malformed",
    });
    expect(api.unchain.installSkillPack).not.toHaveBeenCalled();
  });
});
