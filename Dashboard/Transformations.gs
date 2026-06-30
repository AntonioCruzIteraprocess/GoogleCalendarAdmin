/**
 * Transformaciones calculadas al vuelo
 */

function calcTipoActividad(row) {
  var tipo = (row["Tipo de Incidencia"] || "").trim();
  return tipo === "Epic" ? "Épica" : "Actividad";
}

/**
 * KPIs del Resumen Ejecutivo
 * Recibe filtros opcionales de fecha
 */
function getResumenEjecutivo(dateFrom, dateTo) {
  var data = getSheetData();
  if (data.total === 0) return { total: 0, kpis: {}, dateRange: null };

  var rows = data.rows;

  // Calcular rango min/max de fechas disponibles
  var allDates = [];
  rows.forEach(function(row) {
    var d1 = parseDateValue(row["Fecha de vencimiento"]);
    var d2 = parseDateValue(row["Original Due Date"]);
    if (d1) allDates.push(d1);
    if (d2) allDates.push(d2);
  });
  allDates.sort(function(a, b) { return a - b; });
  var minDate = allDates.length > 0 ? formatDateISO(allDates[0]) : "";
  var maxDate = allDates.length > 0 ? formatDateISO(allDates[allDates.length - 1]) : "";

  // Aplicar filtro de fechas
  var filterFrom = dateFrom ? new Date(dateFrom) : null;
  var filterTo = dateTo ? new Date(dateTo) : null;
  if (filterFrom) filterFrom.setHours(0, 0, 0, 0);
  if (filterTo) filterTo.setHours(23, 59, 59, 999);

  if (filterFrom || filterTo) {
    rows = rows.filter(function(row) {
      var d1 = parseDateValue(row["Fecha de vencimiento"]);
      var d2 = parseDateValue(row["Original Due Date"]);
      var inRange = false;
      if (d1) {
        var d1Time = d1.getTime();
        if ((!filterFrom || d1Time >= filterFrom.getTime()) && (!filterTo || d1Time <= filterTo.getTime())) inRange = true;
      }
      if (d2) {
        var d2Time = d2.getTime();
        if ((!filterFrom || d2Time >= filterFrom.getTime()) && (!filterTo || d2Time <= filterTo.getTime())) inRange = true;
      }
      return inRange;
    });
  }

  // KPI: Total Actividades + Suma SP + Cerradas + Pendientes + Épicas + Cumplimiento
  var totalActividades = 0;
  var sumaSP = 0;
  var tareasFinalizadas = 0;
  var tareasPendientes = 0;
  var epicasFinalizadas = 0;
  var enTiempo = 0;
  var detalleActividades = [];
  var detalleEpicas = [];
  var detallePendientes = [];
  var detalleEnTiempo = [];
  rows.forEach(function(row) {
    var tipoAct = calcTipoActividad(row);
    var sp = parseFloat(row["Story Points"]) || 0;
    var estado = (row["Estado"] || "").trim();
    var clave = row["Clave de incidencia"] || "";
    var resumen = row["Resumen"] || "";
    var dueDate = row["Fecha de vencimiento"] || "";
    var originalDue = row["Original Due Date"] || "";

    if (tipoAct === "Épica" && estado === "Finalizada") {
      epicasFinalizadas++;
      detalleEpicas.push({ clave: clave, resumen: resumen, estado: estado });
    }

    if (tipoAct === "Actividad" && sp > 0) {
      totalActividades++;
      sumaSP += sp;
      detalleActividades.push({ clave: clave, resumen: resumen, sp: sp, estado: estado, dueDate: dueDate, originalDue: originalDue });
      if (estado === "Finalizada") {
        tareasFinalizadas++;
        var dd = parseDateValue(dueDate);
        var od = parseDateValue(originalDue);
        if (dd && od && dd <= od) {
          enTiempo++;
          detalleEnTiempo.push({ clave: clave, resumen: resumen, sp: sp, dueDate: dueDate, originalDue: originalDue });
        }
      } else if (estado) {
        tareasPendientes++;
        detallePendientes.push({ clave: clave, resumen: resumen, sp: sp, estado: estado, dueDate: dueDate });
      }
    }
  });

  // KPI: SP Promedio Semana
  var semanasRango = calcSemanas(filterFrom || (allDates.length > 0 ? allDates[0] : new Date()), filterTo || (allDates.length > 0 ? allDates[allDates.length - 1] : new Date()));
  var spPromedioSemana = semanasRango > 0 ? Math.round((sumaSP / semanasRango) * 10) / 10 : 0;
  var pctCerradas = totalActividades > 0 ? Math.round((tareasFinalizadas / totalActividades) * 100) : 0;
  var pctCumplimiento = totalActividades > 0 ? Math.round((enTiempo / totalActividades) * 100) : 0;

  return {
    total: data.total,
    filtered: rows.length,
    kpis: {
      totalActividades: totalActividades,
      sumaSP: sumaSP,
      spPromedioSemana: spPromedioSemana,
      semanas: Math.round(semanasRango * 10) / 10,
      tareasFinalizadas: tareasFinalizadas,
      pctCerradas: pctCerradas,
      epicasFinalizadas: epicasFinalizadas,
      tareasPendientes: tareasPendientes,
      enTiempo: enTiempo,
      pctCumplimiento: pctCumplimiento
    },
    dateRange: {
      min: minDate,
      max: maxDate
    }
  };
}

/** Detalle de un KPI específico - se llama on-demand */
function getKpiDetail(kpiId, dateFrom, dateTo) {
  var data = getSheetData();
  if (data.total === 0) return [];

  var rows = data.rows;

  // Aplicar filtro de fechas
  var filterFrom = dateFrom ? new Date(dateFrom) : null;
  var filterTo = dateTo ? new Date(dateTo) : null;
  if (filterFrom) filterFrom.setHours(0, 0, 0, 0);
  if (filterTo) filterTo.setHours(23, 59, 59, 999);

  if (filterFrom || filterTo) {
    rows = rows.filter(function(row) {
      var d1 = parseDateValue(row["Fecha de vencimiento"]);
      var d2 = parseDateValue(row["Original Due Date"]);
      var inRange = false;
      if (d1) { if ((!filterFrom || d1.getTime() >= filterFrom.getTime()) && (!filterTo || d1.getTime() <= filterTo.getTime())) inRange = true; }
      if (d2) { if ((!filterFrom || d2.getTime() >= filterFrom.getTime()) && (!filterTo || d2.getTime() <= filterTo.getTime())) inRange = true; }
      return inRange;
    });
  }

  var result = [];
  rows.forEach(function(row) {
    var tipoAct = calcTipoActividad(row);
    var sp = parseFloat(row["Story Points"]) || 0;
    var estado = (row["Estado"] || "").trim();
    var item = {
      clave: row["Clave de incidencia"] || "",
      resumen: (row["Resumen"] || "").substring(0, 60),
      sp: sp,
      estado: estado,
      dueDate: formatDateValue(row["Fecha de vencimiento"]),
      originalDue: formatDateValue(row["Original Due Date"])
    };

    switch(kpiId) {
      case "totalActividades":
      case "spPromedio":
        if (tipoAct === "Actividad" && sp > 0) result.push(item);
        break;
      case "pctCerradas":
        if (tipoAct === "Actividad" && sp > 0 && estado === "Finalizada") result.push(item);
        break;
      case "epicasEntregadas":
        if (tipoAct === "\u00c9pica" && estado === "Finalizada") result.push(item);
        break;
      case "pendientes":
        if (tipoAct === "Actividad" && sp > 0 && estado !== "Finalizada" && estado) result.push(item);
        break;
      case "cumplimiento":
        if (tipoAct === "Actividad" && sp > 0 && estado === "Finalizada") {
          var dd = parseDateValue(row["Fecha de vencimiento"]);
          var od = parseDateValue(row["Original Due Date"]);
          if (dd && od && dd <= od) result.push(item);
        }
        break;
    }
  });

  return result.slice(0, 100);
}

function formatDateValue(val) {
  if (!val) return "-";
  if (val instanceof Date) return formatDateISO(val);
  return String(val).substring(0, 10);
}

/**
 * Calcula semanas de un rango: semanas completas + sobrantes * 0.2
 */
function calcSemanas(from, to) {
  var start = from instanceof Date ? from : new Date(from);
  var end = to instanceof Date ? to : new Date(to);
  var dias = Math.max(1, Math.round((end - start) / 86400000) + 1);
  var semanas = Math.floor(dias / 7);
  var sobran = dias % 7;
  return semanas + (sobran * 0.2);
}

function parseDateValue(val) {
  if (!val) return null;
  if (val instanceof Date) return val;
  var str = String(val).trim();
  if (!str) return null;
  var d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function formatDateISO(date) {
  var y = date.getFullYear();
  var m = String(date.getMonth() + 1).padStart(2, "0");
  var d = String(date.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + d;
}

/** Test: verificar que la data se lee correctamente */
function testDashboard() {
  var data = getSheetData();
  Logger.log("Total rows: " + data.total);
  Logger.log("Headers: " + data.headers.join(", "));
  if (data.rows.length > 0) {
    var row = data.rows[0];
    Logger.log("Primera fila:");
    Logger.log("  Tipo: " + row["Tipo de Incidencia"]);
    Logger.log("  Estado: " + row["Estado"]);
    Logger.log("  SP: " + row["Story Points"]);
    Logger.log("  Due Date: " + row["Fecha de vencimiento"]);
    Logger.log("  Original Due: " + row["Original Due Date"]);
  }
  var result = getResumenEjecutivo(null, null);
  Logger.log("\nKPIs (sin filtro):");
  Logger.log("  Total Actividades: " + result.kpis.totalActividades);
  Logger.log("  Suma SP: " + result.kpis.sumaSP);
  Logger.log("  SP Promedio: " + result.kpis.spPromedioSemana);
  Logger.log("  Finalizadas: " + result.kpis.tareasFinalizadas);
  Logger.log("  Date Range: " + result.dateRange.min + " a " + result.dateRange.max);

  // Test con filtro de fechas
  var resultFiltrado = getResumenEjecutivo("2026-04-22", "2026-06-04");
  Logger.log("\nKPIs (con filtro 2026-04-22 a 2026-06-04):");
  Logger.log("  Filtered rows: " + resultFiltrado.filtered);
  Logger.log("  Total Actividades: " + resultFiltrado.kpis.totalActividades);
  Logger.log("  Suma SP: " + resultFiltrado.kpis.sumaSP);
}
