/**
 * Tempo API: crear, leer y borrar worklogs
 */

const TEMPO_API_BASE = "https://api.tempo.io/4";

function postTempoWorklog(eventData, classification) {
  const tc = getTempoConfig();
  const facturable = classification.facturable ? tc.attr.facturable_si : tc.attr.facturable_no;

  const payload = {
    issueId:         classification.issue_id,
    timeSpentSeconds: eventData.duration_seconds,
    startDate:       Utilities.formatDate(eventData.start, Session.getScriptTimeZone(), "yyyy-MM-dd"),
    startTime:       Utilities.formatDate(eventData.start, Session.getScriptTimeZone(), "HH:mm:ss"),
    description:     eventData.summary,
    authorAccountId: tc.tempo_account_id,
    attributes: [
      { key: tc.attr.actividad_key, value: classification.actividad },
      { key: tc.attr.facturable_key, value: facturable }
    ]
  };

  const response = UrlFetchApp.fetch(TEMPO_API_BASE + "/worklogs", {
    method: "post",
    contentType: "application/json",
    headers: { "Authorization": "Bearer " + tc.tempo_token, "Accept": "application/json" },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const code = response.getResponseCode();
  if (code !== 200 && code !== 201) {
    throw new Error("Tempo error " + code + ": " + response.getContentText().substring(0, 200));
  }
  return JSON.parse(response.getContentText());
}

function getTempoWorklogs(fromDate, toDate) {
  const tc = getTempoConfig();
  let results = [], offset = 0;
  const limit = 50;

  do {
    const url = `${TEMPO_API_BASE}/worklogs/user/${tc.tempo_account_id}` +
      `?from=${fromDate}&to=${toDate}&limit=${limit}&offset=${offset}`;

    const response = UrlFetchApp.fetch(url, {
      method: "get",
      headers: { "Authorization": "Bearer " + tc.tempo_token, "Accept": "application/json" },
      muteHttpExceptions: true
    });

    const code = response.getResponseCode();
    if (code !== 200) {
      throw new Error("Tempo error " + code + ": " + response.getContentText().substring(0, 200));
    }

    const data = JSON.parse(response.getContentText());
    results = results.concat(data.results || []);
    if (!data.metadata || !data.metadata.next) break;
    offset += limit;
  } while (true);

  return results;
}

function deleteTempoWorklog(tempoWorklogId) {
  const tc = getTempoConfig();
  const response = UrlFetchApp.fetch(`${TEMPO_API_BASE}/worklogs/${tempoWorklogId}`, {
    method: "delete",
    headers: { "Authorization": "Bearer " + tc.tempo_token, "Accept": "application/json" },
    muteHttpExceptions: true
  });
  const code = response.getResponseCode();
  if (code !== 200 && code !== 204) {
    throw new Error("Delete error " + code);
  }
}

/** Consulta worklogs cargados en un rango para mostrar en la UI */
function getTempoWorklogsForUI(fromDate, toDate) {
  const worklogs = getTempoWorklogs(fromDate, toDate);
  let totalSeconds = 0;

  const items = worklogs.map(wl => {
    totalSeconds += wl.timeSpentSeconds || 0;
    const h = Math.floor((wl.timeSpentSeconds || 0) / 3600);
    const m = Math.floor(((wl.timeSpentSeconds || 0) % 3600) / 60);
    return {
      id:          wl.tempoWorklogId,
      date:        wl.startDate,
      issueId:     wl.issue ? (wl.issue.id || null) : null,
      issue:       wl.issue ? (wl.issue.key || String(wl.issue.id) || "N/A") : "N/A",
      description: (wl.description || "").substring(0, 60),
      duration:    h + "h " + m + "m",
      seconds:     wl.timeSpentSeconds || 0
    };
  });

  // Enriquecer con nombres de épica y subtarea desde Jira
  const issueIds = [...new Set(items.map(i => i.issueId).filter(Boolean))];
  const issueDetails = issueIds.length ? fetchIssueDetailsById_(issueIds) : {};

  items.forEach(item => {
    const detail = issueDetails[String(item.issueId)];
    if (detail) {
      item.issue        = detail.key;
      item.issueSummary = detail.summary;
      item.epicName     = detail.epicName;
    } else {
      item.issueSummary = "";
      item.epicName     = "";
    }
    delete item.issueId;
  });

  const totalH = Math.floor(totalSeconds / 3600);
  const totalM = Math.floor((totalSeconds % 3600) / 60);

  return {
    count:         items.length,
    totalDuration: totalH + "h " + totalM + "m",
    items
  };
}

/** Fetch summary, key y parent (épica) de un lote de issue IDs desde Jira */
function fetchIssueDetailsById_(ids) {
  const tc = getTempoConfig();
  const token = Utilities.base64Encode(tc.jira_email + ":" + tc.jira_token);
  const details = {};
  const batchSize = 50;

  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const jql = "id in (" + batch.join(",") + ")";
    const response = UrlFetchApp.fetch(tc.jira_server + "/rest/api/3/search/jql", {
      method: "post",
      contentType: "application/json",
      headers: { "Authorization": "Basic " + token, "Accept": "application/json" },
      payload: JSON.stringify({ jql, maxResults: batchSize, fields: ["summary", "parent"] }),
      muteHttpExceptions: true
    });
    if (response.getResponseCode() === 200) {
      const data = JSON.parse(response.getContentText());
      (data.issues || []).forEach(issue => {
        details[issue.id] = {
          key:      issue.key,
          summary:  issue.fields.summary || "",
          epicName: issue.fields.parent
            ? (issue.fields.parent.fields.summary || issue.fields.parent.key)
            : ""
        };
      });
    }
  }
  return details;
}
