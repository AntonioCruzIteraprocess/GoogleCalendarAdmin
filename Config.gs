/**
 * Almacenamiento de configuración via PropertiesService
 */

const MS_PER_DAY = 86400000;

const DEFAULT_CONFIG = {
  calendarId: "primary",
  calendarIds: [],
  webhookUrl: "",
  webhookEnabled: false,
  daysBack: 7,
  daysForward: 30,
  searchDaysBack: 90,
  searchDaysForward: 365,
  rules: [],
  requiredLabels: ["ID", "Tipo", "Actividad"],
  labelCatalog: [],
  projects: []
};

function getConfig() {
  const data = PropertiesService.getScriptProperties().getProperty("config");
  const saved = data ? JSON.parse(data) : {};
  return Object.assign({}, DEFAULT_CONFIG, saved);
}

function saveConfig(config) {
  PropertiesService.getScriptProperties().setProperty("config", JSON.stringify(config));
  return { success: true };
}
