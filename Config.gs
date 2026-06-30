/**
 * Almacenamiento de configuración via PropertiesService
 */

const DEFAULT_CONFIG = {
  calendarId: "primary",
  webhookUrl: "",
  daysBack: 7,
  daysForward: 30,
  searchDaysBack: 90,
  searchDaysForward: 365,
  rules: [],
  requiredLabels: ["ID", "Tipo", "Actividad"]
};

function getConfig() {
  const data = PropertiesService.getScriptProperties().getProperty("config");
  return data ? JSON.parse(data) : DEFAULT_CONFIG;
}

function saveConfig(config) {
  PropertiesService.getScriptProperties().setProperty("config", JSON.stringify(config));
  return { success: true };
}
