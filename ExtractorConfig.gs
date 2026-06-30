/**
 * Configuración del Extractor / Reporte Provident
 */

function getExtractorConfig() {
  const data = PropertiesService.getScriptProperties().getProperty("extractorConfig");
  return data ? JSON.parse(data) : {
    jira_server: "",
    jira_email: "",
    jira_token: "",
    project_key: "",
    spreadsheet_id: "",
    sheet_name: "Reporte",
    fields: [],
    write_mode: "upsert",
    saved_filters: []
  };
}

function saveExtractorConfig(config) {
  PropertiesService.getScriptProperties().setProperty("extractorConfig", JSON.stringify(config));
  return { success: true };
}

/** Obtiene todos los campos disponibles en Jira */
function getJiraFields() {
  var ec = getExtractorConfig();
  if (!ec.jira_server || !ec.jira_email || !ec.jira_token) {
    throw new Error("Configura las credenciales de Jira primero");
  }
  var token = Utilities.base64Encode(ec.jira_email + ":" + ec.jira_token);
  var response = UrlFetchApp.fetch(ec.jira_server + "/rest/api/3/field", {
    method: "get",
    headers: { "Authorization": "Basic " + token, "Accept": "application/json" },
    muteHttpExceptions: true
  });
  var code = response.getResponseCode();
  if (code !== 200) throw new Error("Jira error " + code + ": " + response.getContentText().substring(0, 200));

  var fields = JSON.parse(response.getContentText());
  return fields.map(function(f) {
    return { id: f.id, name: f.name, custom: f.custom || false };
  }).sort(function(a, b) { return a.name.localeCompare(b.name); });
}

var DEFAULT_EXTRACTOR_FIELDS = [
  { id: "summary", name: "Resumen" },
  { id: "key", name: "Clave de incidencia" },
  { id: "id", name: "ID de la incidencia" },
  { id: "issuetype", name: "Tipo de Incidencia" },
  { id: "status", name: "Estado" },
  { id: "priority", name: "Prioridad" },
  { id: "reporter", name: "Informador" },
  { id: "created", name: "Creada" },
  { id: "updated", name: "Actualizada" },
  { id: "lastViewed", name: "Vista por \u00daltima Vez" },
  { id: "resolutiondate", name: "Resuelta" },
  { id: "duedate", name: "Fecha de vencimiento" },
  { id: "labels", name: "Etiquetas" },
  { id: "description", name: "Descripci\u00f3n" },
  { id: "customfield_10033", name: "Complexity" },
  { id: "customfield_10049", name: "Original Due Date" },
  { id: "customfield_10015", name: "Start date" },
  { id: "customfield_10030", name: "Story Points" },
  { id: "comment", name: "Comentario" },
  { id: "parent", name: "Principal" },
  { id: "parent.key", name: "Clave principal" },
  { id: "parent.summary", name: "Parent summary" }
];
