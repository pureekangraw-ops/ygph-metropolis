const BANGKOK_TIME_ZONE = 'Asia/Bangkok';

export function formatThaiBangkokDate(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: BANGKOK_TIME_ZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(value);
}
