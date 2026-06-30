/**
 * Motor de reglas con lógica AND/OR anidada
 * 
 * Estructura:
 *   rule.conditionGroups = [
 *     { operator: "AND", conditions: [{type, value}, ...] },  ← Grupo 1
 *     { operator: "AND", conditions: [{type, value}, ...] }   ← Grupo 2
 *   ]
 *   Los grupos entre sí se evalúan con OR.
 *   Dentro de cada grupo se evalúa con el operator del grupo (AND u OR).
 * 
 * Backward compatible: si rule.conditions existe (formato viejo), funciona como un solo grupo AND.
 */

function findMatchingRule(event, rules) {
  const context = buildEventContext(event);

  return rules.find(rule => {
    if (!rule.enabled) return false;
    return evaluateRule(rule, context);
  });
}

function evaluateRule(rule, context) {
  // Backward compat: formato viejo (conditions plano = un grupo AND)
  if (rule.conditions && !rule.conditionGroups) {
    return rule.conditions.every(cond => evaluateCondition(cond, context));
  }

  const groups = rule.conditionGroups || [];
  if (groups.length === 0) return false;

  // Grupos entre sí se unen con OR
  return groups.some(group => {
    if (!group.conditions || group.conditions.length === 0) return false;
    const op = group.operator || "AND";
    if (op === "OR") {
      return group.conditions.some(cond => evaluateCondition(cond, context));
    }
    return group.conditions.every(cond => evaluateCondition(cond, context));
  });
}

function evaluateCondition(cond, ctx) {
  switch (cond.type) {
    case "domain":
      const domain = cond.value.toLowerCase().replace(/^@/, "");
      return ctx.emails.some(e => e.endsWith("@" + domain));
    case "emailContains":
      return ctx.emails.some(e => e.toLowerCase().includes(cond.value.toLowerCase()));
    case "titleContains":
      return ctx.title.includes(cond.value.toLowerCase());
    case "titleNotContains":
      return !ctx.title.includes(cond.value.toLowerCase());
    case "descriptionContains":
      return ctx.description.includes(cond.value.toLowerCase());
    case "isAllDay":
      return ctx.isAllDay === (cond.value === "true");
    case "minGuests":
      return ctx.guestCount >= parseInt(cond.value);
    case "creatorDomain":
      const cd = cond.value.toLowerCase().replace(/^@/, "");
      return ctx.creators.some(e => e.endsWith("@" + cd));
    default:
      return false;
  }
}

function buildEventContext(event) {
  return {
    emails: getEventEmails(event),
    creators: event.getCreators().map(e => e.toLowerCase()),
    title: event.getTitle().toLowerCase(),
    description: (event.getDescription() || "").toLowerCase(),
    isAllDay: event.isAllDayEvent(),
    guestCount: event.getGuestList().length
  };
}

function getEventEmails(event) {
  return [
    ...event.getGuestList().map(g => g.getEmail().toLowerCase()),
    ...event.getCreators().map(e => e.toLowerCase())
  ];
}
