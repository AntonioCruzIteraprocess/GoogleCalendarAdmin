/**
 * DEBUG: Ejecutar manualmente desde Apps Script
 * - debugRun:     ver eventos sin modificar nada
 * - debugProcess: ejecutar el etiquetado real en el rango de prueba
 */

function debugRun() {
  const config = getConfig();
  Logger.log("=== CONFIG ===");
  Logger.log("Calendar ID: " + (config.calendarId || "primary"));
  Logger.log("Rules: " + (config.rules ? config.rules.length : 0));
  Logger.log("Webhook: " + (config.webhookUrl ? "✓" : "✗"));
  Logger.log(JSON.stringify(config, null, 2));

  // Rango dinámico: ayer y hoy
  const end   = new Date(); end.setHours(23, 59, 59, 999);
  const start = new Date(Date.now() - MS_PER_DAY); start.setHours(0, 0, 0, 0);

  Logger.log("\n=== EVENTOS ===");
  Logger.log("Desde: " + start);
  Logger.log("Hasta: " + end);

  const calendar = getCalendar(config);
  Logger.log("Calendario: " + calendar.getName());

  const events = calendar.getEvents(start, end);
  Logger.log("Encontrados: " + events.length);

  events.forEach((event, i) => {
    Logger.log(`\n--- Evento ${i + 1} ---`);
    Logger.log("Título: "    + event.getTitle());
    Logger.log("Inicio: "    + event.getStartTime());
    Logger.log("Creadores: " + event.getCreators().join(", "));
    Logger.log("Invitados: " + event.getGuestList().map(g => g.getEmail()).join(", "));
    Logger.log("Descripción: " + (event.getDescription() || "(vacía)").substring(0, 100));
  });
}

/** Ejecuta el proceso real sobre el rango dinámico (ayer → hoy) */
function debugProcess() {
  const ayer = new Date(Date.now() - MS_PER_DAY);
  const hoy  = new Date();
  const from = Utilities.formatDate(ayer, Session.getScriptTimeZone(), "yyyy-MM-dd");
  const to   = Utilities.formatDate(hoy,  Session.getScriptTimeZone(), "yyyy-MM-dd");

  const result = runByDateRange(from, to);
  Logger.log("=== RESULTADO ===");
  Logger.log("Total: "              + result.total);
  Logger.log("Etiquetados: "        + result.updated);
  Logger.log("Sin regla (webhook): " + result.unmatched);
  if (result.noRules) Logger.log("⚠️ NO HAY REGLAS GUARDADAS");
}
