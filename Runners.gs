/**
 * Funciones ejecutables: desde interfaz, triggers o manualmente
 */

function runByDateRange(startDate, endDate) {
  const config = getConfig();
  const start = new Date(startDate + "T00:00:00");
  const end   = new Date(endDate   + "T23:59:59");
  const events = getEventsBetween(config, start, end);

  if (!config.rules || config.rules.length === 0) {
    return { total: events.length, updated: 0, unmatched: events.length, noRules: true };
  }

  return processEvents(events, config);
}

function runByEventSearch(query) {
  const config = getConfig();
  const now   = new Date();
  const start = new Date(now.getTime() - (config.searchDaysBack    || 90)  * MS_PER_DAY);
  const end   = new Date(now.getTime() + (config.searchDaysForward || 365) * MS_PER_DAY);
  const events = searchEvents(config, query, start, end);

  if (!config.rules || config.rules.length === 0) {
    return { total: events.length, updated: 0, unmatched: events.length, noRules: true };
  }

  return processEvents(events, config);
}

function labelCalendarEvents() {
  const config = getConfig();
  const now   = new Date();
  const start = new Date(now.getTime() - (config.daysBack    || 7)  * MS_PER_DAY);
  const end   = new Date(now.getTime() + (config.daysForward || 30) * MS_PER_DAY);
  const events = getEventsBetween(config, start, end);
  processEvents(events, config);
}

/** Etiqueta solo el día anterior (para trigger a día vencido) */
function labelYesterday() {
  const config = getConfig();
  const ayer   = new Date(Date.now() - MS_PER_DAY);
  const start  = new Date(ayer); start.setHours(0, 0, 0, 0);
  const end    = new Date(ayer); end.setHours(23, 59, 59, 999);
  const events = getEventsBetween(config, start, end);
  processEvents(events, config);
}
