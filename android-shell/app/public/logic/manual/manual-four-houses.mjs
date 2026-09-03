import { createManualFourHouses as createDonorManual } from './manual-four-houses-impl.mjs';

const VERIFIED_MUTATION_STATUSES = new Set(['COMMITTED', 'RECOVERED', 'VERIFIED']);

function defaultTodayProvider() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function guardedRuntime(runtime) {
  if (!runtime || typeof runtime.readState !== 'function' || typeof runtime.executeMultiGroupCommands !== 'function') {
    throw new TypeError('MANUAL_RUNTIME_REQUIRED');
  }
  return new Proxy(runtime, {
    get(target, property, receiver) {
      if (property !== 'executeMultiGroupCommands') return Reflect.get(target, property, receiver);
      return async (...args) => {
        const result = await target.executeMultiGroupCommands(...args);
        if (!VERIFIED_MUTATION_STATUSES.has(result?.status)) {
          throw new Error(`MANUAL_MUTATION_NOT_VERIFIED:${result?.status ?? 'UNKNOWN'}`);
        }
        return result;
      };
    },
  });
}

export function createManualFourHouses(runtime, { todayProvider = defaultTodayProvider } = {}) {
  if (typeof todayProvider !== 'function') throw new TypeError('MANUAL_TODAY_PROVIDER_REQUIRED');
  const safeRuntime = guardedRuntime(runtime);
  const delegate = () => createDonorManual(safeRuntime, { today: String(todayProvider()) });
  const stable = delegate();

  return new Proxy(stable, {
    get(target, property, receiver) {
      if (property === 'calendarToday' || property === 'calendarUpcoming' || property === 'calendarOverdue') {
        return (...args) => delegate()[property](...args);
      }
      return Reflect.get(target, property, receiver);
    },
  });
}
