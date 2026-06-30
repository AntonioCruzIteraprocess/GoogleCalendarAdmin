/**
 * Administración de triggers (genérico para etiquetado y tempo)
 */

const TRIGGER_TZ = "America/Mexico_City";

function getTriggerStatus() {
  return ScriptApp.getProjectTriggers().map(t => ({
    id:      t.getUniqueId(),
    handler: t.getHandlerFunction(),
    type:    t.getEventType().toString(),
    source:  t.getTriggerSource().toString()
  }));
}

/**
 * Crea trigger para una función específica eliminando el anterior del mismo handler.
 * @param {string} handlerName - nombre de la función
 * @param {string} frequency   - "5min" | "15min" | "30min" | "1hour" | "6hours" | "daily" | "daily:HH"
 */
function createTriggerFor(handlerName, frequency) {
  // Eliminar triggers anteriores del mismo handler
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === handlerName)
    .forEach(t => ScriptApp.deleteTrigger(t));

  const builder = ScriptApp.newTrigger(handlerName).timeBased();

  if (frequency.startsWith("daily:")) {
    const hour = parseInt(frequency.split(":")[1]) || 0;
    builder.everyDays(1).atHour(hour).inTimezone(TRIGGER_TZ).create();
  } else {
    switch (frequency) {
      case "5min":   builder.everyMinutes(5).create();  break;
      case "15min":  builder.everyMinutes(15).create(); break;
      case "30min":  builder.everyMinutes(30).create(); break;
      case "1hour":  builder.everyHours(1).create();    break;
      case "6hours": builder.everyHours(6).create();    break;
      case "daily":  builder.everyDays(1).atHour(8).inTimezone(TRIGGER_TZ).create(); break;
      default:
        return { success: false, error: "Frecuencia no válida: " + frequency };
    }
  }

  return { success: true, handler: handlerName, frequency };
}

// Etiquetado: rango configurable (daysBack/daysForward)
function createTriggerByType(frequency) {
  return createTriggerFor("labelCalendarEvents", frequency);
}

// Etiquetado: solo día anterior
function createLabelYesterdayTrigger(hour) {
  return createTriggerFor("labelYesterday", "daily:" + hour);
}

// Tempo: sync día anterior
function createTempoTrigger(frequency) {
  return createTriggerFor("tempoSyncYesterday", frequency);
}

function removeTriggerById(triggerId) {
  const trigger = ScriptApp.getProjectTriggers().find(t => t.getUniqueId() === triggerId);
  if (trigger) {
    ScriptApp.deleteTrigger(trigger);
    return { success: true };
  }
  return { success: false, error: "Trigger no encontrado" };
}

function removeAllTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  return { success: true };
}
