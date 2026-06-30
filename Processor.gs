/**
 * Procesamiento de eventos: aplica etiquetas o envía alertas
 */

function processEvents(events, config) {
  let updated = 0;
  let unmatched = 0;
  const unmatchedEvents = [];
  const allEvents = [];
  const requiredLabels = config.requiredLabels || ["ID", "Actividad", "Horas Facturables"];

  // Pre-compilar regex de etiquetas para no recrearlas por cada evento
  const labelRegexes = requiredLabels.map(key => ({
    key,
    regex: new RegExp(key + ":\\s*", "i")
  }));

  events.forEach(event => {
    const descClean = stripHtml(event.getDescription());
    const baseInfo = {
      id:          event.getId(),
      title:       event.getTitle(),
      date:        event.getStartTime().toLocaleString(),
      startTime:   event.getStartTime().toISOString(),
      guests:      event.getGuestList().map(g => g.getEmail()).join(", ") || "Ninguno",
      description: descClean,
      isAllDay:    event.isAllDayEvent(),
      rsvp:        getRsvpStatus_(event)
    };

    // Proceso automático de reglas
    const rule = findMatchingRule(event, config.rules);
    if (rule) {
      const result = applyLabels(event, rule.labels);
      baseInfo.status = result === "readonly" ? "readonly" : "labeled";
      baseInfo.ruleName = rule.name;
      if (result !== "readonly") updated++;
      allEvents.push(baseInfo);
      return;
    }

    // Verificar etiquetas obligatorias usando regex pre-compilados
    const missingRequired = labelRegexes
      .filter(({ regex }) => !descClean.match(regex))
      .map(({ key }) => key);

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

  const ids = config.calendarIds && config.calendarIds.length
    ? config.calendarIds
    : [config.calendarId || "primary"];

  let event = null;

  for (let i = 0; i < ids.length && !event; i++) {
    const cal = getCalendarById_(ids[i]);
    if (cal) event = cal.getEventById(eventId);
  }

  if (!event && startTime) {
    event = findEventByIdInDay_(ids, eventId, new Date(startTime));
  }

  if (!event) return { success: false, error: "Evento no encontrado. ID: " + eventId };

  const result = applyLabels(event, rule.labels);
  if (result === "readonly") {
    return { success: false, error: "No se pudo escribir: evento de solo lectura (invitación externa)" };
  }
  return {
    success: true,
    title: event.getTitle(),
    rule: rule.name,
    note: result ? undefined : "Ya tenía todas las etiquetas"
  };
}

function applyLabels(event, labels) {
  let desc = event.getDescription() || "";
  let updated = false;
  const isHtml = /<[a-z][\s\S]*>/i.test(desc);
  const lineBreak = isHtml ? "<br>" : "\n";

  labels.forEach(l => {
    const regex = new RegExp(l.key + ":\\s*[^\n<]*", "i");
    const match = desc.match(regex);
    const newVal = l.key + ": " + l.value;

    if (match) {
      if (match[0].trim() !== newVal.trim()) {
        desc = desc.replace(match[0], newVal);
        updated = true;
      }
    } else {
      desc = newVal + lineBreak + desc;
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

/** Re-etiquetar una lista de eventos aplicando sus reglas correspondientes */
function relabelEvents(eventList) {
  const config = getConfig();
  const ids = config.calendarIds && config.calendarIds.length
    ? config.calendarIds
    : [config.calendarId || "primary"];
  let updated = 0, errors = 0;

  eventList.forEach(item => {
    let event = findEventById_(ids, item.id);
    if (!event && item.startTime) {
      event = findEventByIdInDay_(ids, item.id, new Date(item.startTime));
    }
    if (!event) { errors++; return; }

    const rule = findMatchingRule(event, config.rules);
    if (rule) {
      const result = applyLabels(event, rule.labels);
      result !== "readonly" ? updated++ : errors++;
    } else {
      errors++;
    }
  });

  return { updated, errors };
}

// ─── HELPERS PRIVADOS ────────────────────────────────────────

function getRsvpStatus_(event) {
  const myStatus = event.getMyStatus();
  if (!myStatus) return "owner";
  switch (myStatus) {
    case CalendarApp.GuestStatus.YES:     return "accepted";
    case CalendarApp.GuestStatus.NO:      return "declined";
    case CalendarApp.GuestStatus.MAYBE:   return "maybe";
    case CalendarApp.GuestStatus.INVITED: return "pending";
    default: return "owner";
  }
}

function extractLabels_(text, keys) {
  return keys
    .map(key => {
      const m = text.match(new RegExp(key + ":\\s*(.+)", "i"));
      return m ? key + ": " + m[1].trim().split("\n")[0] : null;
    })
    .filter(Boolean)
    .join(", ");
}

/** Busca evento por ID en todos los calendarios */
function findEventById_(ids, eventId) {
  for (const id of ids) {
    const cal = getCalendarById_(id);
    if (!cal) continue;
    const ev = cal.getEventById(eventId);
    if (ev) return ev;
  }
  return null;
}

/** Busca evento por ID buscando en el día completo de una fecha */
function findEventByIdInDay_(ids, eventId, date) {
  const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0);
  const dayEnd   = new Date(date); dayEnd.setHours(23, 59, 59, 999);
  for (const id of ids) {
    const cal = getCalendarById_(id);
    if (!cal) continue;
    const ev = cal.getEvents(dayStart, dayEnd).find(e => e.getId() === eventId);
    if (ev) return ev;
  }
  return null;
}
