/**
 * Extractor: fetch Jira → dedup → Spreadsheet
 * Campos dinámicos basados en configuración
 */

function extractorJiraFetch(jql, fieldIds) {
  var ec = getExtractorConfig();
  if (!ec.jira_server || !ec.jira_email || !ec.jira_token) {
    throw new Error("Configura las credenciales de Jira en Configuración → Reporte");
  }

  var jiraFields = fieldIds.filter(function(f) {
    return f !== "key" && f !== "id" && f !== "parent.key" && f !== "parent.summary";
  });

  var token = Utilities.base64Encode(ec.jira_email + ":" + ec.jira_token);
  var allIssues = [];
  var nextPageToken = null;

  do {
    var payload = { jql: jql, maxResults: 100, fields: jiraFields };
    if (nextPageToken) payload.nextPageToken = nextPageToken;

    var response = UrlFetchApp.fetch(ec.jira_server + "/rest/api/3/search/jql", {
      method: "post",
      contentType: "application/json",
      headers: { "Authorization": "Basic " + token, "Accept": "application/json" },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    var code = response.getResponseCode();
    if (code !== 200) throw new Error("Jira error " + code + ": " + response.getContentText().substring(0, 300));

    var data = JSON.parse(response.getContentText());
    allIssues = allIssues.concat(data.issues || []);
    nextPageToken = data.nextPageToken || null;
  } while (nextPageToken);

  return allIssues;
}

function getFieldValue(issue, fieldId) {
  var f = issue.fields;
  switch (fieldId) {
    case "key": return issue.key || "";
    case "id": return issue.id || "";
    case "summary": return f.summary || "";
    case "issuetype": return f.issuetype ? f.issuetype.name : "";
    case "status": return f.status ? f.status.name : "";
    case "priority": return f.priority ? f.priority.name : "";
    case "reporter": return f.reporter ? f.reporter.displayName : "";
    case "created": return f.created || "";
    case "updated": return f.updated || "";
    case "lastViewed": return f.lastViewed || "";
    case "resolutiondate": return f.resolutiondate || "";
    case "duedate": return f.duedate || "";
    case "labels": return (f.labels || []).join(", ");
    case "description": return extractExtDescription(f.description);
    case "comment": return extractExtComments(f.comment);
    case "parent": return f.parent ? f.parent.key + " - " + (f.parent.fields ? f.parent.fields.summary : "") : "";
    case "parent.key": return f.parent ? f.parent.key : "";
    case "parent.summary": return f.parent && f.parent.fields ? f.parent.fields.summary : "";
    default:
      var val = f[fieldId];
      if (val === null || val === undefined) return "";
      if (typeof val === "object") {
        if (val.name) return val.name;
        if (val.value) return val.value;
        if (val.displayName) return val.displayName;
        if (Array.isArray(val)) return val.map(function(v){ return typeof v === "object" ? (v.name || v.value || JSON.stringify(v)) : v; }).join(", ");
        return JSON.stringify(val);
      }
      return String(val);
  }
}

function extractJiraData(filterType, dateFrom, dateTo, extraJql) {
  var ec = getExtractorConfig();
  var fields = ec.fields && ec.fields.length > 0 ? ec.fields : DEFAULT_EXTRACTOR_FIELDS;

  var projectFilter = "project = " + ec.project_key;
  var dueDateFilter = 'duedate >= "' + dateFrom + '" AND duedate <= "' + dateTo + '"';
  var originalDueFilter = 'cf[10049] >= "' + dateFrom + '" AND cf[10049] <= "' + dateTo + '"';
  var jql;

  switch (filterType) {
    case "duedate": jql = projectFilter + " AND " + dueDateFilter; break;
    case "originalDueDate": jql = projectFilter + " AND " + originalDueFilter; break;
    case "any": jql = projectFilter + " AND (" + dueDateFilter + " OR " + originalDueFilter + ")"; break;
    case "both": jql = projectFilter + " AND " + dueDateFilter + " AND " + originalDueFilter; break;
    default: jql = projectFilter + " AND " + dueDateFilter;
  }

  // Agregar filtros extra del usuario
  if (extraJql) jql += " AND " + extraJql;
  jql += " ORDER BY duedate ASC";

  var fieldIds = fields.map(function(f){ return f.id; });
  var allIssues = extractorJiraFetch(jql, fieldIds);

  var rows = allIssues.map(function(issue) {
    var data = fieldIds.map(function(fid){ return getFieldValue(issue, fid); });
    return { key: issue.key, data: data };
  });

  var headers = fields.map(function(f){ return f.name; });
  return { total: rows.length, rows: rows, headers: headers, fields: fields };
}

function extractExtDescription(desc) {
  if (!desc) return "";
  if (typeof desc === "string") return desc.substring(0, 500);
  try {
    var text = "";
    if (desc.content) {
      desc.content.forEach(function(block) {
        if (block.content) {
          block.content.forEach(function(inline) { if (inline.text) text += inline.text; });
          text += "\n";
        }
      });
    }
    return text.substring(0, 500);
  } catch(e) { return ""; }
}

function extractExtComments(commentField) {
  if (!commentField || !commentField.comments) return "";
  return commentField.comments.map(function(c) {
    var body = "";
    if (c.body && c.body.content) {
      c.body.content.forEach(function(block) {
        if (block.content) block.content.forEach(function(inline) { if (inline.text) body += inline.text; });
      });
    }
    return (c.author ? c.author.displayName : "") + ": " + body;
  }).join(" | ").substring(0, 1000);
}

function saveToSpreadsheet(extractResult) {
  var ec = getExtractorConfig();
  if (!ec.spreadsheet_id) throw new Error("Configura el Spreadsheet ID");

  var ss = SpreadsheetApp.openById(ec.spreadsheet_id);
  var sheet = ss.getSheetByName(ec.sheet_name || "Reporte");
  if (!sheet) sheet = ss.insertSheet(ec.sheet_name || "Reporte");

  var writeMode = ec.write_mode || "upsert";
  var inserted = 0, updated = 0, skipped = 0;
  var loadDate = new Date().toLocaleString("es-MX", { timeZone: "America/Mexico_City" });

  // Agregar columna "Fecha de carga" al header si no existe
  var headersWithDate = extractResult.headers.concat(["Fecha de carga"]);

  if (writeMode === "clean") {
    sheet.clear();
    sheet.appendRow(headersWithDate);
    sheet.getRange(1, 1, 1, headersWithDate.length).setFontWeight("bold");
    extractResult.rows.forEach(function(row) { sheet.appendRow(row.data.concat([loadDate])); inserted++; });
  } else if (writeMode === "append") {
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(headersWithDate);
      sheet.getRange(1, 1, 1, headersWithDate.length).setFontWeight("bold");
    }
    extractResult.rows.forEach(function(row) { sheet.appendRow(row.data.concat([loadDate])); inserted++; });
  } else {
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(headersWithDate);
      sheet.getRange(1, 1, 1, headersWithDate.length).setFontWeight("bold");
    }

    var keyColIndex = -1;
    extractResult.fields.forEach(function(f, i) { if (f.id === "key") keyColIndex = i; });
    if (keyColIndex === -1) keyColIndex = 0;

    var existingKeys = {};
    if (sheet.getLastRow() > 1) {
      var keys = sheet.getRange(2, keyColIndex + 1, sheet.getLastRow() - 1, 1).getValues();
      keys.forEach(function(row, i) { existingKeys[row[0]] = i + 2; });
    }

    extractResult.rows.forEach(function(row) {
      if (existingKeys[row.key]) {
        if (writeMode === "upsert") {
          sheet.getRange(existingKeys[row.key], 1, 1, row.data.concat([loadDate]).length).setValues([row.data.concat([loadDate])]);
          updated++;
        } else {
          skipped++;
        }
      } else {
        sheet.appendRow(row.data.concat([loadDate]));
        inserted++;
      }
    });
  }

  return { inserted: inserted, updated: updated, skipped: skipped, total: extractResult.rows.length };
}

function runExtraction(filterType, dateFrom, dateTo, extraJql) {
  var result = extractJiraData(filterType, dateFrom, dateTo, extraJql);
  if (result.total === 0) return { status: "empty", message: "No se encontraron incidencias" };
  var saved = saveToSpreadsheet(result);
  return { status: "done", found: result.total, inserted: saved.inserted, updated: saved.updated, skipped: saved.skipped };
}

function previewExtraction(filterType, dateFrom, dateTo, extraJql) {
  var result = extractJiraData(filterType, dateFrom, dateTo, extraJql);
  if (result.total === 0) return { status: "empty", message: "No se encontraron incidencias" };
  var fields = result.fields;
  var preview = result.rows.map(function(r) {
    var obj = {};
    fields.forEach(function(f, i) { obj[f.id] = r.data[i]; });
    return obj;
  });
  return { status: "done", total: result.total, preview: preview, fields: fields };
}

/** Guarda un filtro para reutilizarlo */
function saveExtractorFilter(filterName, filterData) {
  var ec = getExtractorConfig();
  if (!ec.saved_filters) ec.saved_filters = [];
  var existing = ec.saved_filters.findIndex(function(f){ return f.name === filterName; });
  if (existing >= 0) ec.saved_filters[existing] = { name: filterName, data: filterData };
  else ec.saved_filters.push({ name: filterName, data: filterData });
  PropertiesService.getScriptProperties().setProperty("extractorConfig", JSON.stringify(ec));
  return { success: true };
}

/** Elimina un filtro guardado */
function deleteExtractorFilter(filterName) {
  var ec = getExtractorConfig();
  ec.saved_filters = (ec.saved_filters || []).filter(function(f){ return f.name !== filterName; });
  PropertiesService.getScriptProperties().setProperty("extractorConfig", JSON.stringify(ec));
  return { success: true };
}

/** Obtiene los filtros guardados */
function getExtractorFilters() {
  var ec = getExtractorConfig();
  return ec.saved_filters || [];
}
