/**
 * Configuración del Dashboard
 */

function getDashboardConfig() {
  var data = PropertiesService.getScriptProperties().getProperty("dashboardConfig");
  return data ? JSON.parse(data) : {
    spreadsheet_id: "",
    sheet_name: "Reporte"
  };
}

function saveDashboardConfig(config) {
  PropertiesService.getScriptProperties().setProperty("dashboardConfig", JSON.stringify(config));
  return { success: true };
}
