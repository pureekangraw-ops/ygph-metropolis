export const CALENDAR_CORE = Object.freeze({
  id: 'CALENDAR',
  manualRole: 'HOME',
  runtimeRoot: 'GREENFIELD_RUNTIME',
  truthDomain: 'CALENDAR',
  storageOwner: 'GREENFIELD_VAULT',
  runtimeAnchors: Object.freeze(['calendarReschedule', 'calendarStatus']),
  domainAnchors: Object.freeze([
    'CALENDAR_CREATE_RECORD',
    'CALENDAR_APPLY_PAYMENT',
    'CALENDAR_RESCHEDULE',
    'CALENDAR_SET_STATUS',
  ]),
  projectionAnchors: Object.freeze(['projectCalendarSummary']),
});
