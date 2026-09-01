import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";


const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WORKFLOW = fs.readFileSync(
  path.join(ROOT, ".github/workflows/_shared-release-playwright.yml"),
  "utf8",
);


test("Windows native probe evidence is independently strict-validated", () => {
  assert.match(
    WORKFLOW,
    /verify-windows-vault-supervisor-native-evidence\.py/,
  );
  assert.match(
    WORKFLOW,
    /VAULT_SUPERVISOR_NATIVE_EVIDENCE_PATH/,
  );
  assert.doesNotMatch(
    WORKFLOW,
    /json\.load\(open\(os\.environ\["VAULT_SUPERVISOR_NATIVE_EVIDENCE_PATH"\]/,
  );
});
