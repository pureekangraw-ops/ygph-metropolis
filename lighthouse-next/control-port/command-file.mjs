const ALIASES = Object.freeze({
  "SYS-01": "system.health",
  "SYS-02": "system.appState",
  "SYS-03": "system.commandPack",
  "CB-01": "centreBoard.read",
  "CB-02": "centreBoard.initialize",
  "CB-03": "centreBoard.pin.create",
  "CB-04": "centreBoard.claim",
  "CB-05": "centreBoard.return",
  "CB-06": "centreBoard.recover",
  "BD-01": "board.read",
  "BD-02": "board.initialize",
  "BD-03": "pin.create",
  "BD-04": "board.claim",
  "BD-05": "board.return",
  "BD-06": "board.recover",
  "FI-01": "finance.balance",
  "FI-02": "finance.todayIn",
  "FI-03": "finance.todayOut",
  "FI-04": "finance.net",
  "FI-05": "finance.transactions",
  "FI-06": "finance.dailyGoal",
  "FI-07": "finance.income.create",
  "FI-08": "finance.expense.create",
  "FI-09": "finance.obligations",
  "FI-10": "finance.obligation.create",
  "FI-11": "finance.obligation.dueDate",
  "FI-12": "finance.obligation.payment",
  "FI-13": "finance.receivables",
  "FI-14": "finance.receivable.payment",
  "CAL-01": "calendar.records",
  "CAL-02": "calendar.status",
  "STO-01": "store.products",
  "STO-02": "store.product.create",
  "STO-03": "store.stock.add",
  "RIDE-01": "ride.summary",
  "SEC-01": "security.pin",
  "SEC-02": "security.recoveryCode",
  "SEC-03": "security.vault",
});

const MAX_COMMANDS = 25;

function clone(value) {
  if (value == null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(clone);
  const copy = {};
  for (const [key, child] of Object.entries(value)) copy[key] = clone(child);
  return copy;
}

function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}

function text(value, label) {
  const result = String(value ?? "").trim();
  if (!result) throw new Error(label + "_REQUIRED");
  return result;
}

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(label + "_INVALID");
  }
  return value;
}

export function resolveCapabilityCode(code) {
  const value = text(code, "CAPABILITY_CODE");
  const canonical = ALIASES[value] || value;
  if (!canonical.includes(".")) throw new Error("CAPABILITY_CODE_UNKNOWN:" + value);
  return canonical;
}

function normalizeCommand(command, index) {
  object(command, "COMMAND_" + index);
  const requestId = text(command.requestId, "REQUEST_ID_" + index);
  const code = text(command.code || command.capabilityId, "CAPABILITY_CODE_" + index);
  const capabilityId = resolveCapabilityCode(code);
  const payload = command.payload == null ? {} : object(command.payload, "PAYLOAD_" + index);
  return {
    requestId,
    code,
    capabilityId,
    payload: clone(payload),
  };
}

export function createCommandInputFile(input = {}) {
  object(input, "COMMAND_FILE");
  const commands = input.commands;
  if (!Array.isArray(commands) || commands.length < 1 || commands.length > MAX_COMMANDS) {
    throw new Error("COMMAND_FILE_COMMAND_COUNT_INVALID");
  }
  const normalized = commands.map((command, index) => normalizeCommand(command, index + 1));
  const requestIds = new Set(normalized.map(command => command.requestId));
  if (requestIds.size !== normalized.length) throw new Error("COMMAND_FILE_REQUEST_ID_DUPLICATE");
  return freeze({
    schema: "lighthouse-command-file-v1",
    fileId: text(input.fileId, "FILE_ID"),
    packageId: text(input.packageId, "PACKAGE_ID"),
    workId: text(input.workId, "WORK_ID"),
    source: text(input.source || "GO", "SOURCE"),
    target: text(input.target || "LIGHTHOUSE", "TARGET"),
    commands: normalized,
    createdAt: String(input.createdAt || new Date().toISOString()),
  });
}

export function createCommandOutputFile(input = {}) {
  object(input, "RESULT_FILE");
  if (!Array.isArray(input.results) || input.results.length > MAX_COMMANDS) {
    throw new Error("RESULT_FILE_RESULT_COUNT_INVALID");
  }
  const results = input.results.map((result, index) => {
    object(result, "RESULT_" + (index + 1));
    return {
      requestId: text(result.requestId, "RESULT_REQUEST_ID_" + (index + 1)),
      code: text(result.code || result.capabilityId, "RESULT_CODE_" + (index + 1)),
      capabilityId: resolveCapabilityCode(result.capabilityId || result.code),
      status: text(result.status, "RESULT_STATUS_" + (index + 1)),
      readback: clone(result.readback ?? null),
      reason: result.reason == null ? null : String(result.reason),
      evidence: clone(result.evidence ?? null),
    };
  });
  return freeze({
    schema: "lighthouse-result-file-v1",
    fileId: text(input.fileId, "FILE_ID"),
    inputFileId: text(input.inputFileId, "INPUT_FILE_ID"),
    packageId: text(input.packageId, "PACKAGE_ID"),
    workId: text(input.workId, "WORK_ID"),
    results,
    createdAt: String(input.createdAt || new Date().toISOString()),
  });
}

export function createBoardProjectionFromOutput(output = {}) {
  object(output, "RESULT_FILE");
  if (output.schema !== "lighthouse-result-file-v1") throw new Error("RESULT_FILE_SCHEMA_INVALID");
  return freeze({
    schema: "lighthouse-command-board-projection-v1",
    readOnly: true,
    packageId: text(output.packageId, "PACKAGE_ID"),
    workId: text(output.workId, "WORK_ID"),
    sourceFileId: text(output.fileId, "FILE_ID"),
    updatedAt: String(output.createdAt || new Date().toISOString()),
    items: output.results.map(result => ({
      requestId: result.requestId,
      code: result.code,
      capabilityId: result.capabilityId,
      status: result.status,
      reason: result.reason,
      readback: clone(result.readback),
    })),
  });
}

export { ALIASES };
