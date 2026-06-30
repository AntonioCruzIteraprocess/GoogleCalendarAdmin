/**
 * Jira API: buscar sub-issues y resolver fechas
 */

var _subIssuesCache = {};

function resetJiraCache() { _subIssuesCache = {}; }

function getSubIssues(parentKey) {
  if (_subIssuesCache[parentKey]) return _subIssuesCache[parentKey];

  const tc = getTempoConfig();
  const token = Utilities.base64Encode(tc.jira_email + ":" + tc.jira_token);
  let results = [], nextPageToken = null;

  do {
    const payload = { jql: "parent = " + parentKey + " ORDER BY created ASC", maxResults: 100, fields: ["summary"] };
    if (nextPageToken) payload.nextPageToken = nextPageToken;

    const response = UrlFetchApp.fetch(tc.jira_server + "/rest/api/3/search/jql", {
      method: "post",
      contentType: "application/json",
      headers: { "Authorization": "Basic " + token, "Accept": "application/json" },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    const code = response.getResponseCode();
    if (code !== 200) throw new Error("Jira API error " + code + ": " + response.getContentText().substring(0, 200));

    const data = JSON.parse(response.getContentText());
    results = results.concat(data.issues || []);
    nextPageToken = data.nextPageToken || null;
  } while (nextPageToken);

  _subIssuesCache[parentKey] = results;
  return results;
}

var MESES_MAP = {
  "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
  "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
  "ene": 1, "abr": 4, "ago": 8, "dic": 12
};

function parseWeekRangeFromTitle(title, refYear) {
  const m = title.match(/(\w+)\s+(\d+)\s+al\s+(\d+)(?:\s+(\w+))?/i);
  if (!m) return null;

  const mesInicio = MESES_MAP[m[1].toLowerCase().substring(0, 3)];
  const diaInicio = parseInt(m[2]);
  const diaFin = parseInt(m[3]);
  let mesFin = MESES_MAP[(m[4] ? m[4] : m[1]).toLowerCase().substring(0, 3)];
  if (!mesInicio || !mesFin) return null;

  // Si no hay mes fin explícito y diaFin < diaInicio, el fin es el mes siguiente
  if (!m[4] && diaFin < diaInicio) {
    mesFin = mesInicio + 1;
    if (mesFin > 12) mesFin = 1;
  }

  const yearFin = (mesFin < mesInicio) ? refYear + 1 : refYear;
  return [new Date(refYear, mesInicio - 1, diaInicio), new Date(yearFin, mesFin - 1, diaFin)];
}

function findIssueForDate(subIssues, eventDate) {
  const refYear = eventDate.getFullYear();
  const evDay = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());

  for (let i = 0; i < subIssues.length; i++) {
    const rango = parseWeekRangeFromTitle(subIssues[i].fields.summary, refYear);
    if (!rango) continue;
    const s = new Date(rango[0].getFullYear(), rango[0].getMonth(), rango[0].getDate());
    const e = new Date(rango[1].getFullYear(), rango[1].getMonth(), rango[1].getDate());
    if (evDay >= s && evDay <= e) return subIssues[i];
  }
  return null;
}
