/**
 * Acceso al calendario
 */

function getCalendar(config) {
  const id = config.calendarId || "primary";
  return id === "primary"
    ? CalendarApp.getDefaultCalendar()
    : CalendarApp.getCalendarById(id);
}

function getEventsBetween(config, startDate, endDate) {
  const ids = config.calendarIds || [config.calendarId || "primary"];
  let allEvents = [];
  ids.forEach(id => {
    const cal = id === "primary" ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(id);
    if (cal) allEvents = allEvents.concat(cal.getEvents(startDate, endDate));
  });
  return allEvents;
}

function searchEvents(config, query, start, end) {
  const ids = config.calendarIds || [config.calendarId || "primary"];
  let allEvents = [];
  ids.forEach(id => {
    const cal = id === "primary" ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(id);
    if (cal) allEvents = allEvents.concat(cal.getEvents(start, end, { search: query }));
  });
  return allEvents;
}

/** Devuelve lista de calendarios propios del usuario */
function getAvailableCalendars() {
  return CalendarApp.getAllOwnedCalendars().map(cal => ({
    id: cal.getId(),
    name: cal.getName()
  }));
}

/**
 * Calendar Advanced Service helpers.
 * Requiere habilitar "Calendar" en Servicios del proyecto.
 * Usa Calendar API v3 que sí lee/escribe overrides del attendee.
 */

/** Leer descripción real del evento (incluye override del invitado) */
function getEventDescription(calendarId, eventId) {
  try {
    const event = Calendar.Events.get(calendarId, eventId);
    return event.description || "";
  } catch (e) {
    return null;
  }
}

/** Escribir descripción en el evento (como override del invitado si no es organizador) */
function setEventDescription(calendarId, eventId, description) {
  try {
    Calendar.Events.patch({ description: description }, calendarId, eventId);
    return true;
  } catch (e) {
    return false;
  }
}
