"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const path = require("node:path");

const moduleUrl = pathToFileURL(path.resolve(
  __dirname,
  "../lighthouse-next/control-port/command-file.mjs",
)).href;

test("capability aliases resolve to canonical LIGHTHOUSE capabilities", async () => {
  const commandFile = await import(moduleUrl);
  assert.equal(commandFile.resolveCapabilityCode("FI-05"), "finance.transactions");
  assert.equal(commandFile.resolveCapabilityCode("SEC-01"), "security.pin");
  assert.equal(commandFile.resolveCapabilityCode("finance.transactions"), "finance.transactions");
  assert.throws(() => commandFile.resolveCapabilityCode("NOPE-99"), /CAPABILITY_CODE_UNKNOWN/);
});

test("one input file carries a bounded batch and preserves identity", async () => {
  const commandFile = await import(moduleUrl);
  const input = commandFile.createCommandInputFile({
    fileId: "LH-IN-001",
    packageId: "PKG-001",
    workId: "WORK-001",
    commands: [
      { requestId: "REQ-FI-05", code: "FI-05", payload: {} },
      { requestId: "REQ-CAL-01", code: "CAL-01", payload: {} },
    ],
  });
  assert.equal(input.schema, "lighthouse-command-file-v1");
  assert.equal(input.commands.length, 2);
  assert.equal(input.commands[0].code, "FI-05");
  assert.equal(input.commands[0].capabilityId, "finance.transactions");
  assert.equal(input.commands[1].capabilityId, "calendar.records");
  assert.equal(input.packageId, "PKG-001");
  assert.equal(input.workId, "WORK-001");
});

test("output file returns per-item results and a read-only board projection", async () => {
  const commandFile = await import(moduleUrl);
  const output = commandFile.createCommandOutputFile({
    fileId: "LH-OUT-001",
    inputFileId: "LH-IN-001",
    packageId: "PKG-001",
    workId: "WORK-001",
    results: [
      {
        requestId: "REQ-FI-05",
        code: "FI-05",
        capabilityId: "finance.transactions",
        status: "DONE",
        readback: { count: 1 },
      },
      {
        requestId: "REQ-SEC-01",
        code: "SEC-01",
        capabilityId: "security.pin",
        status: "BLOCKED",
        reason: "SECURITY_CAPABILITY_BLOCKED",
      },
    ],
  });
  assert.equal(output.schema, "lighthouse-result-file-v1");
  assert.equal(output.results[0].status, "DONE");
  assert.equal(output.results[1].status, "BLOCKED");
  const board = commandFile.createBoardProjectionFromOutput(output);
  assert.equal(board.readOnly, true);
  assert.equal(board.packageId, "PKG-001");
  assert.equal(board.workId, "WORK-001");
  assert.deepEqual(board.items.map(item => item.status), ["DONE", "BLOCKED"]);
  assert.equal(board.items[0].code, "FI-05");
});
