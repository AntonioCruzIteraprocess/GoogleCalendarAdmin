/**
 * Lectura de datos del Spreadsheet
 */

function getSheetData() {
  var config = getDashboardConfig();
  if (!config.spreadsheet_id) throw new Error("Configura el Spreadsheet ID");

  var ss = SpreadsheetApp.openById(config.spreadsheet_id);
  var sheet = ss.getSheetByName(config.sheet_name || "Reporte");
  if (!sheet) throw new Error("Hoja '" + config.sheet_name + "' no encontrada");

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return { headers: [], rows: [], total: 0 };

  var headers = data[0];
  var rows = data.slice(1).map(function(row) {
    var obj = {};
    headers.forEach(function(h, i) { obj[h] = row[i]; });
    return obj;
  });

  return { headers: headers, rows: rows, total: rows.length };
}

/** Obtiene resumen general para KPIs */
function getDashboardSummary() {
  var data = getSheetData();
  if (data.total === 0) return { total: 0, message: "Sin datos" };

  var rows = data.rows;
  var summary = {
    total: rows.length,
    headers: data.headers
  };

  return summary;
}
