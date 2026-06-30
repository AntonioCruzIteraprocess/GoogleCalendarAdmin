/**
 * Procesamiento de eventos: aplica etiquetas o envia alertas
 */

function processEvents(events, config) {
  let updated = 0;
  let unmatched = 0;
  const unmatchedEvents = [];
  const allEvents = [];
  const requiredLabels = config.requiredLabels || ["ID", "Actividad", "Horas Facturables"];

  events.forEach(event => {
    const description = event.getDescription() || "";
    const descClean = description.replace(/<br\s*\/?>/gi, "\n").replace(/<\/?(div|p|span|a|ul|li|ol|table|tr|td|th|font|b|i|u|em|strong|h[1-6])[^>]*>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/\n{3,}/g, "\n\n").trim();
    const baseInfo = {
      id: event.getId(),
      title: event.getTitle(),
      date: event.getStartTime().toLocaleString(),
      startTime: event.getStartTime().toISOString(),
      guests: event.getGuestList().map(g => g.getEmail()).join(", ") || "Ninguno",
      description: descClean,
      isAllDay: event.isAllDayEvent(),
      rsvp: getRsvpStatus_(event)
    };

    // Primero: proceso automatico de reglas
    const rule = findMatchingRule(event, config.rules);
    if (rule) {
      const result = applyLabels(event, rule.labels);
      if (result === "readonly") {
        baseInfo.status = "readonly";
        baseInfo.ruleName = rule.name;
      } else {
        updated++;
        baseInfo.status = "labeled";
        baseInfo.ruleName = rule.name;
      }
      allEvents.push(baseInfo);
      return;
    }

    // Segundo: verificar si le faltan etiquetas obligatorias
    const missingRequired = requiredLabels.filter(
      key => !descClean.match(new RegExp(key + ":\\s*", "i"))
    );

    if (missingRequired.length > 0) {
      unmatched++;
      baseInfo.status = "missing";
      baseInfo.missing = missingRequired.join(", ");
      unmatchedEvents.push(baseInfo);
      allEvents.push(baseInfo);
      sendWebhookAlert(event, config);
    } else {
      baseInfo.status = "complete";
      baseInfo.labels = extractLabels_(descClean, requiredLabels);
      allEvents.push(baseInfo);
    }
  });

  return { total: events.length, updated, unmatched, unmatchedEvents, allEvents };
}

/** Aplica etiquetas de una regla a un evento por ID */
function applyRuleToEvent(eventId, ruleIndex, startTime) {
  const config = getConfig();
  const rule = config.rules[ruleIndex];
  if (!rule) return { success: false, error: "Regla no encontrada (index: " + ruleIndex + ")" };

  const ids = config.calendarIds || [config.calendarId || "primary"];
  let event = null;

  for (let i = 0; i < ids.length && !event; i++) {
    const cal = ids[i] === "primary" ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(ids[i]);
    if (cal) event = cal.getEventById(eventId);
  }

  if (!event && startTime) {
    const searchDate = new Date(startTime);
    const dayStart = new Date(searchDate); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(searchDate); dayEnd.setHours(23, 59, 59, 999);
    for (let i = 0; i < ids.length && !event; i++) {
      const cal = ids[i] === "primary" ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(ids[i]);
      if (!cal) continue;
      event = cal.getEvents(dayStart, dayEnd).find(e => e.getId() === eventId);
    }
  }

  if (!event) return { success: false, error: "Evento no encontrado. ID: " + eventId };

  const result = applyLabels(event, rule.labels);
  if (result === "readonly") {
    return { success: false, error: "No se pudo escribir: evento de solo lectura (invitacion externa)" };
  }
  if (!result) {
    return { success: true, title: event.getTitle(), rule: rule.name, note: "Ya tenia todas las etiquetas" };
  }
  return { success: true, title: event.getTitle(), rule: rule.name };
}

function applyLabels(event, labels) {
  const description = event.getDescription() || "";
  let desc = description;
  let updated = false;
  const isHtml = /<[a-z][\s\S]*>/i.test(desc);
  const lineBreak = isHtml ? "<br>" : "\n";

  labels.forEach(l => {
    const regex = new RegExp(l.key + ":\\s*[^\n<]*", "i");
    const existsInDesc = desc.match(regex);

    if (existsInDesc) {
      const oldMatch = existsInDesc[0];
      const newVal = l.key + ": " + l.value;
      if (oldMatch.trim() !== newVal.trim()) {
        desc = desc.replace(oldMatch, newVal);
        updated = true;
      }
    } else {
      desc = l.key + ": " + l.value + lineBreak + desc;
      updated = true;
    }
  });

  if (updated) {
    try {
      event.setDescription(desc);
    } catch (e) {
      return "readonly";
    }
  }
  return updated;
}

function getRsvpStatus_(event) {
  var myStatus = event.getMyStatus();
  if (!myStatus) return "owner";
  switch (myStatus) {
    case CalendarApp.GuestStatus.YES: return "accepted";
    case CalendarApp.GuestStatus.NO: return "declined";
    case CalendarApp.GuestStatus.MAYBE: return "maybe";
    case CalendarApp.GuestStatus.INVITED: return "pending";
    default: return "owner";
  }
}

function extractLabels_(text, keys) {
  var result = [];
  keys.forEach(function(key) {
    var m = text.match(new RegExp(key + ":\\s*(.+)", "i"));
    if (m) result.push(key + ": " + m[1].trim().split("\n")[0]);
  });
  return result.join(", ");
}

/** Re-etiquetar una lista de eventos aplicando sus reglas correspondientes */
function relabelEvents(eventList) {
  const config = getConfig();
  const ids = config.calendarIds || [config.calendarId || "primary"];
  let updated = 0, errors = 0;

  eventList.forEach(item => {
    let event = null;
    for (let i = 0; i < ids.length && !event; i++) {
      const cal = ids[i] === "primary" ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(ids[i]);
      if (cal) event = cal.getEventById(item.id);
    }
    if (!event && item.startTime) {
      const d = new Date(item.startTime);
      const dayStart = new Date(d); dayStart.setHours(0,0,0,0);
      const dayEnd = new Date(d); dayEnd.setHours(23,59,59,999);
      for (let i = 0; i < ids.length && !event; i++) {
        const cal = ids[i] === "primary" ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(ids[i]);
        if (!cal) continue;
        event = cal.getEvents(dayStart, dayEnd).find(e => e.getId() === item.id);
      }
    }
    if (!event) { errors++; return; }

    const rule = findMatchingRule(event, config.rules);
    if (rule) {
      const result = applyLabels(event, rule.labels);
      if (result !== "readonly") updated++;
      else errors++;
    } else { errors++; }
  });

  return { updated: updated, errors: errors };
}
