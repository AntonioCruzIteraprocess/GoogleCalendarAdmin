/**
 * Acceso al calendario y utilidades compartidas
 */

/** Obtiene un objeto Calendar por ID (helper central, evita duplicar lógica) */
function getCalendarById_(id) {
  return id === "primary"
    ? CalendarApp.getDefaultCalendar()
    : CalendarApp.getCalendarById(id);
}

/** Obtiene el calendario principal de la config */
function getCalendar(config) {
  return getCalendarById_(config.calendarId || "primary");
}

/** Obtiene eventos en un rango sobre todos los calendarios configurados */
function getEventsBetween(config, startDate, endDate) {
  const ids = config.calendarIds && config.calendarIds.length
    ? config.calendarIds
    : [config.calendarId || "primary"];

  return ids.reduce((all, id) => {
    const cal = getCalendarById_(id);
    return cal ? all.concat(cal.getEvents(startDate, endDate)) : all;
  }, []);
}

/** Busca eventos por texto en un rango */
function searchEvents(config, query, start, end) {
  const ids = config.calendarIds && config.calendarIds.length
    ? config.calendarIds
    : [config.calendarId || "primary"];

  return ids.reduce((all, id) => {
    const cal = getCalendarById_(id);
    return cal ? all.concat(cal.getEvents(start, end, { search: query })) : all;
  }, []);
}

/** Devuelve lista de calendarios propios del usuario */
function getAvailableCalendars() {
  return CalendarApp.getAllOwnedCalendars().map(cal => ({
    id: cal.getId(),
    name: cal.getName()
  }));
}

/**
 * Elimina tags HTML y decodifica entidades. Función utilitaria compartida.
 * @param {string} html
 * @returns {string}
 */
function stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(div|p|span|a|ul|li|ol|table|tr|td|th|font|b|i|u|em|strong|h[1-6])[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Calendar Advanced Service helpers.
 * Requiere habilitar "Calendar" en Servicios del proyecto.
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
