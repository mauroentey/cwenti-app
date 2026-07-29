import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("release workflow never exports an empty signing path", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/release.yml", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(workflow, /CSC_LINK:.*\|\| ''/);
  assert.match(workflow, /if \[\[ -z "\$value" \]\]; then\s+return/);
  assert.match(workflow, /write_env CSC_LINK "\$MAC_CSC_LINK"/);
  assert.match(workflow, /write_env WIN_CSC_LINK "\$WINDOWS_CSC_LINK"/);
});
