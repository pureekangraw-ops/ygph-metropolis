from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'missing anchor in {path}: {old[:80]!r}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')

# Domain validator + owner command.
replace_once(
    'greenfield/domain-operations.mjs',
    "function provenance(command, at) {",
    """function safeIsoDate(value) {
  const input = requiredText(value, 'INVALID_DUE_DATE');
  const match = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(input);
  if (!match) throw new Error('INVALID_DUE_DATE');
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[3])) throw new Error('INVALID_DUE_DATE');
  return input;
}

function provenance(command, at) {"""
)
replace_once(
    'greenfield/domain-operations.mjs',
    "  runtime.register('CALENDAR', 'CALENDAR_SET_STATUS', ({ domainState, payload, command }) => {",
    """  runtime.register('CALENDAR', 'CALENDAR_RESCHEDULE', ({ domainState, payload, command }) => {
    const id = requiredText(payload.recordId, 'INVALID_RECORD_ID');
    const entry = domainState.records[id];
    if (!entry) throw new Error(`DOMAIN_RECORD_NOT_FOUND:${id}`);
    if (entry.record.status === 'COMPLETED' || entry.record.status === 'CANCELLED') throw new Error(`CALENDAR_RECORD_CLOSED:${id}/${entry.record.status}`);
    const dueDate = safeIsoDate(payload.dueDate);
    if (entry.record.dueDate === dueDate) throw new Error(`CALENDAR_DUE_DATE_UNCHANGED:${id}/${dueDate}`);
    const at = now();
    updateEntry(domainState, id, command, at, record => {
      record.dueDate = dueDate;
      record.updatedAt = at;
    });
  });

  runtime.register('CALENDAR', 'CALENDAR_SET_STATUS', ({ domainState, payload, command }) => {"""
)

# One-command CALENDAR workflow.
replace_once(
    'greenfield/business-workflows.mjs',
    "export function buildCalendarStatusWorkflow({ workflowId, queueId, status }) {",
    """export function buildCalendarRescheduleWorkflow({ workflowId, queueId, dueDate }) {
  workflowId = text(workflowId, 'INVALID_WORKFLOW_ID');
  queueId = text(queueId, 'INVALID_QUEUE_ID');
  const due = isoDate(dueDate);
  return { workflowId, commands: [command(workflowId, 1, 'CALENDAR', 'CALENDAR_RESCHEDULE', { recordId: queueId, dueDate: due }, `CALENDAR:${queueId}:RESCHEDULE:${due}`)] };
}

export function buildCalendarStatusWorkflow({ workflowId, queueId, status }) {"""
)

# Runtime facade.
replace_once(
    'greenfield/runtime.mjs',
    "  buildExpenseWorkflow,\n  buildCalendarStatusWorkflow,",
    "  buildExpenseWorkflow,\n  buildCalendarRescheduleWorkflow,\n  buildCalendarStatusWorkflow,"
)
replace_once(
    'greenfield/runtime.mjs',
    "    expense: input => executePlan(buildExpenseWorkflow(input)),\n    calendarStatus: input => executePlan(buildCalendarStatusWorkflow(input)),",
    "    expense: input => executePlan(buildExpenseWorkflow(input)),\n    calendarReschedule: input => executePlan(buildCalendarRescheduleWorkflow(input)),\n    calendarStatus: input => executePlan(buildCalendarStatusWorkflow(input)),"
)
