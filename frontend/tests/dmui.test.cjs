const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("Select tolerates a cleared state snapshot during deferred teardown", () => {
  const source = readFileSync(
    path.join(__dirname, "../src/dmui.js"),
    "utf8",
  );
  const select_start = source.indexOf("export function Select(props = {})");
  const select_end = source.indexOf("export function Checkbox", select_start);
  const select_source = source.slice(select_start, select_end);

  assert.ok(select_start >= 0);
  assert.ok(select_end > select_start);
  assert.match(select_source, /state_\.destroy\?\.\(\)/);
  assert.doesNotMatch(
    select_source,
    /state\.(selectedOption|placeholder|open|disabled|search|loading|options|allowClear|value)/,
  );
  assert.match(select_source, /state\?\.selectedOption/);
  assert.match(select_source, /Boolean\(state\?\.open\)/);
});
