/**
 * Dashboard Provident
 * Lee datos del Spreadsheet generado por el Extractor
 * y presenta visualizaciones e indicadores.
 */

function doGet() {
  return HtmlService.createTemplateFromFile("index")
    .evaluate()
    .setTitle("Dashboard Provident")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
