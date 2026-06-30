/**
 * Planificador: Calendar - slots libres y creación de eventos
 */

function getPlannerCalendar() {
  const pc = getPlannerConfig();
  if (pc.calendar_name === "primary") {
    return CalendarApp.getCalendarById(pc.calendar_id || CalendarApp.getDefaultCalendar().getId());
  }
  const calendars = CalendarApp.getCalendarsByName(pc.calendar_name);
  if (calendars.length > 0) return calendars[0];
  return CalendarApp.createCalendar(pc.calendar_name);
}

function getPlannerFreeSlots(calendar, date) {
  const pc = getPlannerConfig();
  const dayStart = new Date(date);
  dayStart.setHours(pc.work_start_hour, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(pc.work_end_hour, 0, 0, 0);

  const primaryCal = CalendarApp.getCalendarById(pc.calendar_id || CalendarApp.getDefaultCalendar().getId());
  const myEvents = primaryCal.getEvents(dayStart, dayEnd);
  let allEvents = myEvents;

  if (calendar.getId() !== primaryCal.getId()) {
    allEvents = allEvents.concat(calendar.getEvents(dayStart, dayEnd));
  }

  const events = allEvents
    .filter(function(e) { return !e.isAllDayEvent() && e.getMyStatus() !== CalendarApp.GuestStatus.NO && e.getMyStatus() !== CalendarApp.GuestStatus.MAYBE; })
    .sort(function(a, b) { return a.getStartTime() - b.getStartTime(); });

  const freeSlots = [];
  var cursor = dayStart.getTime();

  events.forEach(function(event) {
    var evStart = event.getStartTime().getTime();
    var evEnd = event.getEndTime().getTime();
    if (evStart > cursor) {
      freeSlots.push({ start: new Date(cursor), end: new Date(evStart) });
    }
    cursor = Math.max(cursor, evEnd);
  });

  if (cursor < dayEnd.getTime()) {
    freeSlots.push({ start: new Date(cursor), end: dayEnd });
  }

  return freeSlots;
}

function getFreeSlotsWithSimulated(calendar, date, simulatedEvents) {
  const pc = getPlannerConfig();
  const dayStart = new Date(date);
  dayStart.setHours(pc.work_start_hour, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(pc.work_end_hour, 0, 0, 0);

  const primaryCal = CalendarApp.getCalendarById(pc.calendar_id || CalendarApp.getDefaultCalendar().getId());
  const myEvents = primaryCal.getEvents(dayStart, dayEnd);
  let allCalEvents = myEvents;
  if (calendar.getId() !== primaryCal.getId()) {
    allCalEvents = allCalEvents.concat(calendar.getEvents(dayStart, dayEnd));
  }

  const realEvents = allCalEvents
    .filter(function(e) { return !e.isAllDayEvent() && e.getMyStatus() !== CalendarApp.GuestStatus.NO && e.getMyStatus() !== CalendarApp.GuestStatus.MAYBE; })
    .map(function(e) { return { start: e.getStartTime().getTime(), end: e.getEndTime().getTime() }; });

  const daySimulated = simulatedEvents
    .filter(function(e) { return e.start >= dayStart && e.start < dayEnd; })
    .map(function(e) { return { start: e.start.getTime(), end: e.end.getTime() }; });

  const allEvents = realEvents.concat(daySimulated);
  allEvents.sort(function(a, b) { return a.start - b.start; });

  const freeSlots = [];
  var cursor = dayStart.getTime();

  allEvents.forEach(function(event) {
    if (event.start > cursor) {
      freeSlots.push({ start: new Date(cursor), end: new Date(event.start) });
    }
    cursor = Math.max(cursor, event.end);
  });

  if (cursor < dayEnd.getTime()) {
    freeSlots.push({ start: new Date(cursor), end: dayEnd });
  }

  return freeSlots;
}

function cleanPlannerSprintEvents(calendar, sprintStart, sprintEnd) {
  const events = calendar.getEvents(sprintStart, sprintEnd);
  let count = 0;
  events.forEach(function(e) {
    if (e.getTitle() === "Actividades Provident") { e.deleteEvent(); count++; }
  });
  return count;
}

function getPlannerFreeSlotsCustom(calendar, date, workStart, workEnd) {
  var pc = getPlannerConfig();
  var dayStart = new Date(date); dayStart.setHours(workStart, 0, 0, 0);
  var dayEnd = new Date(date); dayEnd.setHours(workEnd, 0, 0, 0);

  var primaryCal = CalendarApp.getCalendarById(pc.calendar_id || CalendarApp.getDefaultCalendar().getId());
  var myEvents = primaryCal.getEvents(dayStart, dayEnd);
  var allEvents = myEvents;
  if (calendar.getId() !== primaryCal.getId()) {
    allEvents = allEvents.concat(calendar.getEvents(dayStart, dayEnd));
  }

  var events = allEvents
    .filter(function(e) { return !e.isAllDayEvent() && e.getMyStatus() !== CalendarApp.GuestStatus.NO && e.getMyStatus() !== CalendarApp.GuestStatus.MAYBE; })
    .sort(function(a, b) { return a.getStartTime() - b.getStartTime(); });

  var freeSlots = [];
  var cursor = dayStart.getTime();
  events.forEach(function(event) {
    var evStart = event.getStartTime().getTime();
    var evEnd = event.getEndTime().getTime();
    if (evStart > cursor) freeSlots.push({ start: new Date(cursor), end: new Date(evStart) });
    cursor = Math.max(cursor, evEnd);
  });
  if (cursor < dayEnd.getTime()) freeSlots.push({ start: new Date(cursor), end: dayEnd });
  return freeSlots;
}

function getFreeSlotsWithSimulatedCustom(calendar, date, simulatedEvents, workStart, workEnd) {
  var pc = getPlannerConfig();
  var dayStart = new Date(date); dayStart.setHours(workStart, 0, 0, 0);
  var dayEnd = new Date(date); dayEnd.setHours(workEnd, 0, 0, 0);

  var primaryCal = CalendarApp.getCalendarById(pc.calendar_id || CalendarApp.getDefaultCalendar().getId());
  var myEvents = primaryCal.getEvents(dayStart, dayEnd);
  var allCalEvents = myEvents;
  if (calendar.getId() !== primaryCal.getId()) {
    allCalEvents = allCalEvents.concat(calendar.getEvents(dayStart, dayEnd));
  }

  var realEvents = allCalEvents
    .filter(function(e) { return !e.isAllDayEvent() && e.getMyStatus() !== CalendarApp.GuestStatus.NO && e.getMyStatus() !== CalendarApp.GuestStatus.MAYBE; })
    .map(function(e) { return { start: e.getStartTime().getTime(), end: e.getEndTime().getTime() }; });

  var daySimulated = simulatedEvents
    .filter(function(e) { return e.start >= dayStart && e.start < dayEnd; })
    .map(function(e) { return { start: e.start.getTime(), end: e.end.getTime() }; });

  var allEvents = realEvents.concat(daySimulated);
  allEvents.sort(function(a, b) { return a.start - b.start; });

  var freeSlots = [];
  var cursor = dayStart.getTime();
  allEvents.forEach(function(event) {
    if (event.start > cursor) freeSlots.push({ start: new Date(cursor), end: new Date(event.start) });
    cursor = Math.max(cursor, event.end);
  });
  if (cursor < dayEnd.getTime()) freeSlots.push({ start: new Date(cursor), end: dayEnd });
  return freeSlots;
}

function plannerIsWorkDay(date) {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

function getPlannerSprintRange() {
  const today = new Date();
  const dayOfWeek = today.getDay();
  var friday = new Date(today);
  const daysSinceFriday = (dayOfWeek - 5 + 7) % 7;
  friday.setDate(today.getDate() - daysSinceFriday);
  friday.setHours(0, 0, 0, 0);
  var thursday = new Date(friday);
  thursday.setDate(friday.getDate() + 6);
  thursday.setHours(23, 59, 59, 0);
  return { start: friday, end: thursday };
}
