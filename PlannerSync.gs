/**
 * Planificador: Lógica principal de sync y simulación
 * Recibe dateFrom, dateTo, hourFrom, hourTo desde la UI
 */

function plannerSync(dateFrom, dateTo, hourFrom, hourTo) {
  var pc = getPlannerConfig();
  var range = buildPlannerRange(dateFrom, dateTo);
  var startHour = hourFrom !== undefined ? parseInt(hourFrom) : pc.work_start_hour;
  var endHour = hourTo !== undefined ? parseInt(hourTo) : pc.work_end_hour;
  var defaultStart = pc.work_start_hour;
  var defaultEnd = pc.work_end_hour;
  var isSingleDay = dateFrom === dateTo;

  var tasks = fetchPlannerTasks();
  if (!tasks.length) return { status: "empty", message: "No se encontraron tareas" };

  var totalMinutes = 0;
  var taskDetails = [];
  tasks.forEach(function(task) {
    var hours = lookupSpHours(pc.sp_to_hours, task.sp);
    totalMinutes += hours * 60;
    taskDetails.push({ key: task.key, summary: task.summary, sp: task.sp, hours: hours, dueDate: task.dueDate });
  });

  var calendar = getPlannerCalendar();
  var cleaned = cleanPlannerSprintEvents(calendar, range.start, range.end);

  var remainingMinutes = totalMinutes;
  var currentDay = new Date(range.start);
  var endDay = new Date(range.end);
  var guests = pc.guests || "";
  var isFirstDay = true;
  var totalDays = Math.round((endDay - currentDay) / 86400000) + 1;

  while (remainingMinutes > 0 && currentDay <= endDay) {
    if (plannerIsWorkDay(currentDay)) {
      var dayStart, dayEnd;
      if (isSingleDay) {
        dayStart = startHour;
        dayEnd = endHour;
      } else if (isFirstDay) {
        dayStart = startHour;
        dayEnd = defaultEnd;
      } else if (currentDay.getTime() === endDay.getTime() || (currentDay.getDate() === endDay.getDate() && currentDay.getMonth() === endDay.getMonth())) {
        dayStart = defaultStart;
        dayEnd = endHour;
      } else {
        dayStart = defaultStart;
        dayEnd = defaultEnd;
      }

      var freeSlots = getPlannerFreeSlotsCustom(calendar, currentDay, dayStart, dayEnd);

      for (var i = 0; i < freeSlots.length && remainingMinutes > 0; i++) {
        var slot = freeSlots[i];
        var slotMinutes = (slot.end - slot.start) / (1000 * 60);

        if (slotMinutes >= pc.min_block_minutes) {
          var blockMinutes = Math.min(slotMinutes, remainingMinutes);
          if (blockMinutes >= pc.min_block_minutes) {
            var eventStart = new Date(slot.start);
            var eventEnd = new Date(eventStart.getTime() + blockMinutes * 60 * 1000);

            var opts = { description: "ID: INMX-388\nTipo: Facturable\nActividad: Consultoria" };
            if (guests) opts.guests = guests;

            var event = calendar.createEvent("Actividades Provident", eventStart, eventEnd, opts);
            try { event.setColor(CalendarApp.EventColor[pc.event_color] || CalendarApp.EventColor.CYAN); } catch(e) {}
            remainingMinutes -= blockMinutes;
          }
        }
      }
      isFirstDay = false;
    }
    currentDay.setDate(currentDay.getDate() + 1);
  }

  if (remainingMinutes > 0 && pc.webhook_url) {
    plannerSendOverflowAlert(remainingMinutes, tasks.length, totalMinutes / 60, pc);
  }

  return {
    status: "done",
    tasks: tasks.length,
    totalHours: totalMinutes / 60,
    scheduledHours: (totalMinutes - remainingMinutes) / 60,
    overflowHours: remainingMinutes / 60,
    cleaned: cleaned,
    details: taskDetails,
    sprint: Utilities.formatDate(range.start, Session.getScriptTimeZone(), "dd/MM") + " - " + Utilities.formatDate(range.end, Session.getScriptTimeZone(), "dd/MM")
  };
}

function plannerSimulate(dateFrom, dateTo, hourFrom, hourTo) {
  var pc = getPlannerConfig();
  var range = buildPlannerRange(dateFrom, dateTo);
  var startHour = hourFrom !== undefined ? parseInt(hourFrom) : pc.work_start_hour;
  var endHour = hourTo !== undefined ? parseInt(hourTo) : pc.work_end_hour;
  var defaultStart = pc.work_start_hour;
  var defaultEnd = pc.work_end_hour;
  var isSingleDay = dateFrom === dateTo;

  var tasks = fetchPlannerTasks();
  if (!tasks.length) return { status: "empty", message: "No se encontraron tareas" };

  var totalMinutes = 0;
  var taskDetails = [];
  tasks.forEach(function(task) {
    var hours = lookupSpHours(pc.sp_to_hours, task.sp);
    totalMinutes += hours * 60;
    taskDetails.push({ key: task.key, summary: task.summary, sp: task.sp, hours: hours, dueDate: task.dueDate, priority: task.priority, status: task.status });
  });

  var calendar = getPlannerCalendar();
  var simulatedEvents = [];
  var schedule = [];

  var remainingMinutes = totalMinutes;
  var currentDay = new Date(range.start);
  var endDay = new Date(range.end);
  var isFirstDay = true;

  while (remainingMinutes > 0 && currentDay <= endDay) {
    if (plannerIsWorkDay(currentDay)) {
      var dayStart, dayEnd;
      if (isSingleDay) {
        dayStart = startHour;
        dayEnd = endHour;
      } else if (isFirstDay) {
        dayStart = startHour;
        dayEnd = defaultEnd;
      } else if (currentDay.getTime() === endDay.getTime() || (currentDay.getDate() === endDay.getDate() && currentDay.getMonth() === endDay.getMonth())) {
        dayStart = defaultStart;
        dayEnd = endHour;
      } else {
        dayStart = defaultStart;
        dayEnd = defaultEnd;
      }

      var freeSlots = getFreeSlotsWithSimulatedCustom(calendar, currentDay, simulatedEvents, dayStart, dayEnd);

      for (var i = 0; i < freeSlots.length && remainingMinutes > 0; i++) {
        var slot = freeSlots[i];
        var slotMinutes = (slot.end - slot.start) / (1000 * 60);

        if (slotMinutes >= pc.min_block_minutes) {
          var blockMinutes = Math.min(slotMinutes, remainingMinutes);
          if (blockMinutes >= pc.min_block_minutes) {
            var eventStart = new Date(slot.start);
            var eventEnd = new Date(eventStart.getTime() + blockMinutes * 60 * 1000);
            simulatedEvents.push({ start: eventStart, end: eventEnd });
            schedule.push({
              date: Utilities.formatDate(eventStart, Session.getScriptTimeZone(), "EEE dd/MM"),
              start: Utilities.formatDate(eventStart, Session.getScriptTimeZone(), "HH:mm"),
              end: Utilities.formatDate(eventEnd, Session.getScriptTimeZone(), "HH:mm"),
              minutes: blockMinutes
            });
            remainingMinutes -= blockMinutes;
          }
        }
      }
      isFirstDay = false;
    }
    currentDay.setDate(currentDay.getDate() + 1);
  }

  return {
    status: "done",
    tasks: tasks.length,
    totalHours: totalMinutes / 60,
    scheduledHours: (totalMinutes - remainingMinutes) / 60,
    overflowHours: remainingMinutes / 60,
    details: taskDetails,
    schedule: schedule,
    sprint: Utilities.formatDate(range.start, Session.getScriptTimeZone(), "dd/MM") + " - " + Utilities.formatDate(range.end, Session.getScriptTimeZone(), "dd/MM")
  };
}

function plannerCleanRange(dateFrom, dateTo) {
  var range = buildPlannerRange(dateFrom, dateTo);
  var calendar = getPlannerCalendar();
  var count = cleanPlannerSprintEvents(calendar, range.start, range.end);
  return { success: true, deleted: count, range: Utilities.formatDate(range.start, Session.getScriptTimeZone(), "dd/MM") + " - " + Utilities.formatDate(range.end, Session.getScriptTimeZone(), "dd/MM") };
}

function buildPlannerRange(dateFrom, dateTo) {
  if (dateFrom && dateTo) {
    return {
      start: new Date(dateFrom + "T00:00:00"),
      end: new Date(dateTo + "T23:59:59")
    };
  }
  return getPlannerSprintRange();
}

function plannerSendOverflowAlert(remainingMinutes, totalTasks, totalHours, pc) {
  var message = {
    text: "\u26a0\ufe0f *Alerta de Capacidad - Sprint*\n\nNo hay espacio suficiente en tu calendario.\n\u2022 Tareas: " + totalTasks + "\n\u2022 Horas totales: " + totalHours + "h\n\u2022 Horas sin espacio: " + (remainingMinutes / 60) + "h\n\nRevisa tu calendario y ajusta actividades o fechas en Jira."
  };

  UrlFetchApp.fetch(pc.webhook_url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    payload: JSON.stringify(message),
    muteHttpExceptions: true
  });
}

/** Busca horas por SP comparando numéricamente */
function lookupSpHours(spMap, sp) {
  if (!spMap) return 2;
  var spNum = parseFloat(sp);
  // Buscar match exacto por string
  if (spMap[String(sp)] !== undefined) return parseInt(spMap[String(sp)]);
  // Buscar comparando numéricamente
  var keys = Object.keys(spMap);
  for (var i = 0; i < keys.length; i++) {
    if (parseFloat(keys[i]) === spNum) return parseInt(spMap[keys[i]]);
  }
  return 2; // fallback
}
