// Dates in the department's time zone (config.timezone, Indian/Maldives).

// Today as YYYY-MM-DD, worked out here rather than asked of the database.
export const localToday = (tz) => new Date().toLocaleDateString('en-CA', { timeZone: tz });
