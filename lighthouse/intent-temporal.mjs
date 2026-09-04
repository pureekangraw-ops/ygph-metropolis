function requireDate(value, code) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError(code);
  return date;
}

function calendarDateInZone(instant, timeZone) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year:'numeric',
      month:'2-digit',
      day:'2-digit',
    }).formatToParts(instant);
  } catch {
    throw new TypeError('INTENT_TEMPORAL_TIMEZONE_INVALID');
  }

  const values = Object.fromEntries(
    parts.filter(part => part.type === 'year' || part.type === 'month' || part.type === 'day')
      .map(part => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftCalendarDate(isoDate, deltaDays) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) throw new TypeError('INTENT_TEMPORAL_CALENDAR_DATE_INVALID');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day + deltaDays));
  return date.toISOString().slice(0, 10);
}

function explicitDate(rawText) {
  const match = /วันที่\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/u.exec(rawText);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  const valid = candidate.getUTCFullYear() === year
    && candidate.getUTCMonth() === month - 1
    && candidate.getUTCDate() === day;
  if (!valid) {
    return { status:'RECOVERY_REQUIRED', rawText:match[0] };
  }

  return {
    status:'RESOLVED',
    rawText:match[0],
    businessDate:candidate.toISOString().slice(0, 10),
  };
}

function relativeDate(rawText, anchorDate) {
  const cases = [
    ['เมื่อวาน', -1],
    ['วันนี้', 0],
    ['พรุ่งนี้', 1],
  ];
  for (const [token, delta] of cases) {
    if (rawText.includes(token)) {
      return { status:'RESOLVED', rawText:token, businessDate:shiftCalendarDate(anchorDate, delta) };
    }
  }
  return null;
}

function makeDateTemporal({ rawText, businessDate, timeZone, receivedAt }) {
  return Object.freeze({
    rawText,
    kind:'DATE',
    businessDate,
    timeZone,
    anchorReceivedAt:receivedAt,
    clockTime:null,
    precision:'DATE_ONLY',
  });
}

export function resolveTemporal(rawText, options = {}) {
  if (typeof rawText !== 'string') throw new TypeError('INTENT_TEMPORAL_TEXT_REQUIRED');
  if (typeof options.receivedAt !== 'string') throw new TypeError('INTENT_TEMPORAL_RECEIVED_AT_REQUIRED');
  if (typeof options.timeZone !== 'string' || !options.timeZone.trim()) {
    throw new TypeError('INTENT_TEMPORAL_TIMEZONE_REQUIRED');
  }

  const receivedAt = requireDate(options.receivedAt, 'INTENT_TEMPORAL_RECEIVED_AT_INVALID');
  if (options.interpretedAt != null) requireDate(options.interpretedAt, 'INTENT_TEMPORAL_INTERPRETED_AT_INVALID');

  const anchorDate = calendarDateInZone(receivedAt, options.timeZone);
  const found = explicitDate(rawText) ?? relativeDate(rawText, anchorDate);
  if (!found) return Object.freeze({ status:'NO_TEMPORAL', temporal:null });
  if (found.status !== 'RESOLVED') {
    return Object.freeze({ status:found.status, temporal:null, rawText:found.rawText });
  }

  return Object.freeze({
    status:'RESOLVED',
    temporal:makeDateTemporal({
      rawText:found.rawText,
      businessDate:found.businessDate,
      timeZone:options.timeZone,
      receivedAt:options.receivedAt,
    }),
  });
}

export function evaluateTemporalRoute({ temporal, route, capabilities = {} } = {}) {
  if (!temporal) return Object.freeze({ status:'READY', route, temporal:null });
  if (capabilities.businessDate !== true) {
    return Object.freeze({
      status:'UNSUPPORTED',
      reason:'TEMPORAL_NOT_SUPPORTED',
      route,
      temporal,
    });
  }
  return Object.freeze({ status:'READY', route, temporal });
}

export function verifyTemporalReadback({ temporal, expected = {}, readback = {} } = {}) {
  if (!temporal?.businessDate) {
    return Object.freeze({ status:'VERIFY', reason:'TEMPORAL_EXPECTATION_MISSING' });
  }
  if (readback.businessDate !== temporal.businessDate) {
    return Object.freeze({
      status:'VERIFY',
      reason:'BUSINESS_DATE_MISMATCH',
      expectedBusinessDate:temporal.businessDate,
      observedBusinessDate:readback.businessDate ?? null,
    });
  }
  if (Object.hasOwn(expected, 'title') && readback.title !== expected.title) {
    return Object.freeze({ status:'VERIFY', reason:'TITLE_MISMATCH' });
  }
  if (Object.hasOwn(expected, 'amountSatang') && readback.amountSatang !== expected.amountSatang) {
    return Object.freeze({ status:'VERIFY', reason:'AMOUNT_MISMATCH' });
  }
  return Object.freeze({ status:'COMPLETE' });
}
