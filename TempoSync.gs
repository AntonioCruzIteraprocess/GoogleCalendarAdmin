/**
 * Tempo Sync: lógica principal de sincronización Calendar → Tempo
 */

function tempoSyncDay(dateStr) {
  resetJiraCache();
  const tc = getTempoConfig();
  const config = getConfig();

  const fecha = new Date(dateStr + "T00:00:00");
  const dow = fecha.getDay();
  if (dow === 0 || dow === 6) return { status: "skipped", reason: "Fin de semana" };

  // Borrar worklogs del día
  const existentes = getTempoWorklogs(dateStr, dateStr);
  let borrados = 0;
  existentes.forEach(wl => {
    try { deleteTempoWorklog(wl.tempoWorklogId); borrados++; } catch (e) { }
  });

  // Obtener eventos
  const dayStart = new Date(fecha); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(fecha); dayEnd.setHours(23, 59, 59, 999);

  const ids = config.calendarIds || [config.calendarId || "primary"];
  let events = [];
  ids.forEach(id => {
    const cal = id === "primary" ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(id);
    if (cal) events = events.concat(cal.getEvents(dayStart, dayEnd));
  });

  const actividades = getActividades();
  const indice = buildActividadIndex(actividades);

  let uploaded = 0;
  const errores = [];

  events.forEach(event => {
    const parsed = parseCalendarEvent(event, tc);
    if (!parsed) return;

    const meta = parseEventDescription(event.getDescription(), event);
    if (!meta) {
      const reqLabels = config.requiredLabels || ["ID", "Actividad", "Horas Facturables"];
      errores.push({ titulo: parsed.summary, razon: "Faltan campos (" + reqLabels.join(", ") + ")" });
      return;
    }

    const actividadClave = resolveActividad(meta.actividad, indice);
    if (!actividadClave) {
      errores.push({ titulo: parsed.summary, razon: "Actividad no reconocida: \"" + meta.actividad + "\"" });
      return;
    }

    const subIssues = getSubIssues(meta.id);
    const subIssue = findIssueForDate(subIssues, parsed.date);
    if (!subIssue) {
      errores.push({ titulo: parsed.summary, razon: "Sin sub-issue en " + meta.id + " para " + dateStr });
      return;
    }

    try {
      postTempoWorklog(parsed, {
        issue_id: parseInt(subIssue.id),
        issue_key: subIssue.key,
        facturable: meta.facturable,
        actividad: actividadClave
      });
      uploaded++;
    } catch (e) {
      errores.push({ titulo: parsed.summary, razon: "Error Tempo: " + e.message });
    }
  });

  // Notificar errores
  if (errores.length && tc.notify_email) {
    sendTempoErrorEmail(fecha, errores, tc);
  }

  return {
    status: "done",
    date: dateStr,
    deleted: borrados,
    events: events.length,
    uploaded: uploaded,
    errors: errores
  };
}


/** Preview: devuelve eventos del rango con estado (duplicado/encimado/pendiente/error) */
function tempoPreviewRange(fromDate, toDate) {
  resetJiraCache();
  const tc = getTempoConfig();
  const config = getConfig();
  const actividades = getActividades();
  const indice = buildActividadIndex(actividades);

  // Worklogs ya cargados en el rango
  const existingWl = getTempoWorklogs(fromDate, toDate);
  // Mapa exacto: "date|HH:mm|desc60" -> worklogId
  const exactMap = {};
  // Lista de rangos por fecha para detectar encimamiento
  const wlRanges = {}; // date -> [{start:mins, end:mins, id}]
  existingWl.forEach(wl => {
    const time = (wl.startTime || "").substring(0, 5);
    const k = (wl.startDate || "") + "|" + time + "|" + (wl.description || "").substring(0, 60);
    exactMap[k] = wl.tempoWorklogId;
    // Rango en minutos
    const d = wl.startDate || "";
    if (!wlRanges[d]) wlRanges[d] = [];
    const parts = time.split(":");
    const startMins = parseInt(parts[0] || 0) * 60 + parseInt(parts[1] || 0);
    const endMins = startMins + Math.round((wl.timeSpentSeconds || 0) / 60);
    wlRanges[d].push({ start: startMins, end: endMins, id: wl.tempoWorklogId });
  });

  const start = new Date(fromDate + "T00:00:00");
  const end = new Date(toDate + "T23:59:59");
  const ids = config.calendarIds || [config.calendarId || "primary"];
  const items = [];

  const cursor = new Date(start);
  while (cursor <= end) {
    if (cursor.getDay() !== 0 && cursor.getDay() !== 6) {
      const dayStart = new Date(cursor); dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(cursor); dayEnd.setHours(23, 59, 59, 999);
      const dateStr = Utilities.formatDate(cursor, "America/Mexico_City", "yyyy-MM-dd");

      let events = [];
      ids.forEach(id => {
        const cal = id === "primary" ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(id);
        if (cal) events = events.concat(cal.getEvents(dayStart, dayEnd));
      });

      events.forEach(event => {
        const parsed = parseCalendarEvent(event, tc);
        if (!parsed) return;

        const item = { date: dateStr, summary: parsed.summary, duration: parsed.duration_hm, durationSeconds: parsed.duration_seconds, start: Utilities.formatDate(parsed.start, "America/Mexico_City", "HH:mm") };

        const meta = parseEventDescription(event.getDescription(), event);
        if (!meta) { item.status = "error"; item.error = "Faltan campos (" + (config.requiredLabels || []).join(", ") + ")"; items.push(item); return; }

        const actividadClave = resolveActividad(meta.actividad, indice);
        if (!actividadClave) { item.status = "error"; item.error = "Actividad no reconocida: " + meta.actividad; items.push(item); return; }

        const subIssues = getSubIssues(meta.id);
        const subIssue = findIssueForDate(subIssues, parsed.date);
        if (!subIssue) { item.status = "error"; item.error = "Sin sub-issue en " + meta.id + " para " + dateStr; items.push(item); return; }

        item.issueKey = subIssue.key;
        item.issueSummary = subIssue.fields.summary || "";
        item.epicKey = meta.id;
        item.facturable = meta.facturable;
        item.actividad = actividadClave;
        item.issueId = parseInt(subIssue.id);

        // Detectar estado: duplicado, encimado o pendiente
        const matchKey = dateStr + "|" + item.start + "|" + parsed.summary.substring(0, 60);
        if (exactMap[matchKey]) {
          item.status = "duplicate";
          item.worklogId = exactMap[matchKey];
        } else {
          // Verificar encimamiento
          const evParts = item.start.split(":");
          const evStartMins = parseInt(evParts[0]) * 60 + parseInt(evParts[1]);
          const evEndMins = evStartMins + Math.round(item.durationSeconds / 60);
          const dayRanges = wlRanges[dateStr] || [];
          const overlaps = dayRanges.some(r => evStartMins < r.end && evEndMins > r.start);
          item.status = overlaps ? "overlap" : "pending";
        }
        items.push(item);
      });
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  // Enriquecer epic names
  const epicKeys = [...new Set(items.map(i => i.epicKey).filter(Boolean))];
  const epicNames = epicKeys.length ? fetchEpicNames_(epicKeys) : {};
  items.forEach(i => { if (i.epicKey) i.epicName = epicNames[i.epicKey] || i.epicKey; });

  return items;
}

/** Borrar todo el rango y recargar desde calendario */
function tempoDeleteAndReload(fromDate, toDate) {
  const delResult = tempoDeleteRange(fromDate, toDate);
  const items = tempoPreviewRange(fromDate, toDate);
  const loadable = items.filter(i => i.status === "pending" || i.status === "overlap");
  const uploadResult = tempoUploadAll(loadable);
  return { deleted: delResult.deleted, uploaded: uploadResult.uploaded, errors: uploadResult.errors };
}

/** Cargar un solo worklog desde datos del preview */
function tempoUploadSingle(item) {
  const tc = getTempoConfig();
  const startDate = new Date(item.date + "T" + item.start + ":00");
  const eventData = { summary: item.summary, start: startDate, duration_seconds: item.durationSeconds };
  postTempoWorklog(eventData, { issue_id: item.issueId, issue_key: item.issueKey, facturable: item.facturable, actividad: item.actividad });
  return { status: "ok" };
}

/** Re-cargar: borra worklog existente y lo vuelve a crear */
function tempoReloadSingle(item) {
  if (item.worklogId) deleteTempoWorklog(item.worklogId);
  return tempoUploadSingle(item);
}

/** Cargar todos los pendientes de un preview */
function tempoUploadAll(items) {
  let ok = 0, errors = [];
  items.forEach((item, i) => {
    try { tempoUploadSingle(item); ok++; } catch (e) { errors.push(i + ": " + e.message); }
  });
  return { uploaded: ok, errors: errors };
}

/** Re-cargar todos los que ya estaban cargados */
function tempoReloadAll(items) {
  let ok = 0, errors = [];
  items.forEach((item, i) => {
    try { tempoReloadSingle(item); ok++; } catch (e) { errors.push(i + ": " + e.message); }
  });
  return { uploaded: ok, errors: errors };
}

/** Borrar worklogs en un rango de fechas */
function tempoDeleteRange(fromDate, toDate) {
  const worklogs = getTempoWorklogs(fromDate, toDate);
  let deleted = 0;
  worklogs.forEach(wl => {
    try { deleteTempoWorklog(wl.tempoWorklogId); deleted++; } catch (e) { }
  });
  return { total: worklogs.length, deleted: deleted };
}

/** Borrar un solo worklog por ID */
function tempoDeleteSingle(worklogId) {
  deleteTempoWorklog(worklogId);
  return { status: "ok" };
}

/** Obtener nombres de épicas por key */
function fetchEpicNames_(keys) {
  const tc = getTempoConfig();
  const token = Utilities.base64Encode(tc.jira_email + ":" + tc.jira_token);
  const names = {};
  const jql = "key in (" + keys.join(",") + ")";
  const response = UrlFetchApp.fetch(tc.jira_server + "/rest/api/3/search/jql", {
    method: "post", contentType: "application/json",
    headers: { "Authorization": "Basic " + token, "Accept": "application/json" },
    payload: JSON.stringify({ jql: jql, maxResults: 50, fields: ["summary"] }),
    muteHttpExceptions: true
  });
  if (response.getResponseCode() === 200) {
    JSON.parse(response.getContentText()).issues.forEach(i => { names[i.key] = i.fields.summary; });
  }
  return names;
}

// Trigger diario para Tempo
function tempoSyncYesterday() {
  const ayer = new Date();
  ayer.setDate(ayer.getDate() - 1);
  const dateStr = Utilities.formatDate(ayer, "America/Mexico_City", "yyyy-MM-dd");
  tempoSyncDay(dateStr);
}

// ─── HELPERS ─────────────────────────────────────────────────

function parseCalendarEvent(event, tc) {
  const summary = event.getTitle().trim();
  if (!summary || event.isAllDayEvent()) return null;

  try {
    const eventType = event.getEventType();
    if (eventType === CalendarApp.EventType.OUT_OF_OFFICE || eventType === CalendarApp.EventType.FOCUS_TIME) return null;
  } catch (e) {
    if (summary.toLowerCase().includes("out of office")) return null;
  }

  const myStatus = event.getMyStatus();
  if (myStatus === CalendarApp.GuestStatus.NO || myStatus === CalendarApp.GuestStatus.MAYBE) return null;

  const startDt = event.getStartTime();
  const endDt = event.getEndTime();
  if (startDt.getDay() === 0 || startDt.getDay() === 6) return null;

  const limInf = new Date(startDt); limInf.setHours(tc.hora_inicio || 0, 0, 0, 0);
  const limSup = new Date(startDt); limSup.setHours(tc.hora_fin || 24, 0, 0, 0);
  const inicio = startDt < limInf ? limInf : startDt;
  const fin = endDt > limSup ? limSup : endDt;

  const duration = Math.round((fin - inicio) / 1000);
  if (duration <= 0) return null;

  return {
    summary: summary,
    start: inicio,
    date: inicio,
    duration_seconds: duration,
    duration_hm: formatDurationHM(duration)
  };
}

function parseEventDescription(descripcion, event) {
  if (!descripcion && event) descripcion = event.getDescription() || "";
  if (!descripcion) return null;
  const texto = descripcion.replace(/<br\s*\/?>/gi, "\n").replace(/<\/?(div|p|span|a|ul|li|ol)[^>]*>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").trim();

  // Leer campos del catálogo dinámicamente
  const config = getConfig();
  const catalog = (config.labelCatalog || []).filter(c => c.show);

  // Buscar cada campo obligatorio en la descripción
  const fields = {};
  const requiredLabels = config.requiredLabels || ["ID", "Actividad", "Horas Facturables"];
  let allFound = true;

  requiredLabels.forEach(key => {
    const match = texto.match(new RegExp(key + ":\\s*(.+)", "i"));
    if (match) {
      fields[key] = match[1].trim().split("\n")[0].trim();
    } else {
      allFound = false;
    }
  });

  if (!allFound) return null;

  // Resolver ID (issue key)
  const idField = fields["ID"] || "";
  const idMatch = idField.match(/([A-Z]+-\d+)/i);
  if (!idMatch) return null;

  // Resolver facturable: buscar el campo de Horas Facturables del catálogo
  const tc = getTempoConfig();
  const factKey = (tc.attr && tc.attr.facturable_key) || "_HorasFacturables_";
  const factCatalog = catalog.find(c => c.tempoKey === factKey);
  const factLabel = factCatalog ? (factCatalog.label || factCatalog.key) : "Horas Facturables";
  const factValue = fields[factLabel] || "";
  // Mapear valor legible a UUID: buscar en catValues
  let facturable = false;
  if (factCatalog && factCatalog.values) {
    const factMatch = factCatalog.values.find(v => normalizarTexto(v.name) === normalizarTexto(factValue) || v.value === factValue);
    if (factMatch) facturable = (factMatch.value === tc.attr.facturable_si);
  } else {
    facturable = normalizarTexto(factValue) === "si" || normalizarTexto(factValue) === "facturable";
  }

  // Resolver actividad
  const actKey = (tc.attr && tc.attr.actividad_key) || "_Actividad_";
  const actCatalog = catalog.find(c => c.tempoKey === actKey);
  const actLabel = actCatalog ? (actCatalog.label || actCatalog.key) : "Actividad";
  const actValue = fields[actLabel] || "";

  return {
    id: idMatch[1].toUpperCase(),
    facturable: facturable,
    actividad: actValue,
    fields: fields
  };
}

function buildActividadIndex(actividades) {
  const idx = {};
  for (const clave in actividades) {
    const a = actividades[clave];
    idx[normalizarTexto(clave)] = clave;
    idx[normalizarTexto(a.nombre)] = clave;
    idx[normalizarTexto(a.codigo)] = clave;
  }
  return idx;
}

function resolveActividad(texto, indice) {
  return indice[normalizarTexto(texto)] || null;
}

function normalizarTexto(str) {
  return (str || "").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s\-_]+/g, "")
    .trim();
}

function formatDurationHM(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h && m) return h + "h " + m + "m";
  if (h) return h + "h";
  return m + "m";
}

function sendTempoErrorEmail(fecha, errores, tc) {
  const dateStr = Utilities.formatDate(fecha, "America/Mexico_City", "dd/MM/yyyy");
  const subject = "⚠️ Tempo Sync — " + errores.length + " error(es) (" + dateStr + ")";
  let body = "Eventos no cargados el " + dateStr + ":\n\n";
  errores.forEach((e, i) => { body += (i + 1) + ". " + e.titulo + "\n   → " + e.razon + "\n\n"; });

  try { MailApp.sendEmail(tc.notify_email, subject, body); } catch (e) { }
}
