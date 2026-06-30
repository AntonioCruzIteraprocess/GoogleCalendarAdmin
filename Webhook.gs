/**
 * Notificaciones via webhook (Google Chat)
 */

function sendWebhookAlert(event, config) {
  if (!config.webhookEnabled || !config.webhookUrl) return;

  const guests = event.getGuestList().map(g => g.getEmail()).join(", ");
  const payload = {
    text: `⚠️ *Evento sin etiquetas*\n\n` +
      `📌 *Título:* ${event.getTitle()}\n` +
      `📅 *Fecha:* ${event.getStartTime().toLocaleString()}\n` +
      `👥 *Invitados:* ${guests || "Ninguno"}\n` +
      `📝 *Descripción:* ${(event.getDescription() || "Vacía").substring(0, 200)}\n` +
      `🔗 *ID:* ${event.getId() || "N/A"}\n\n` +
      `_Este evento no coincide con ninguna regla configurada._`
  };

  UrlFetchApp.fetch(config.webhookUrl, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload)
  });
}
