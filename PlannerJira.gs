/**
 * Planificador: Jira API - fetch de tareas
 */

function plannerJiraFetch(endpoint, method, payload) {
  const pc = getPlannerConfig();
  const options = {
    method: method || "GET",
    headers: {
      "Authorization": "Basic " + Utilities.base64Encode(pc.jira_email + ":" + pc.jira_token),
      "Content-Type": "application/json"
    },
    muteHttpExceptions: true
  };
  if (payload) options.payload = JSON.stringify(payload);
  return UrlFetchApp.fetch(pc.jira_server + endpoint, options);
}

function fetchPlannerTasks() {
  const pc = getPlannerConfig();
  const jql = 'project = ' + pc.project_key + ' AND type IN (Task, Sub-task) AND assignee = currentUser() AND status NOT IN (Done, Cancelled, Backlog, Stopped) AND "Story Points[Number]" > 0 ORDER BY "cf[10049]" ASC, parent ASC, created DESC';

  const payload = {
    jql: jql,
    fields: ["summary", "duedate", "customfield_10030", "customfield_10049", "customfield_10014", "parent", "priority", "status"]
  };

  const response = plannerJiraFetch("/rest/api/3/search/jql", "POST", payload);
  if (response.getResponseCode() !== 200) {
    throw new Error("Jira error " + response.getResponseCode() + ": " + response.getContentText().substring(0, 200));
  }

  const data = JSON.parse(response.getContentText());
  return data.issues.map(function(issue) {
    return {
      key: issue.key,
      summary: issue.fields.summary,
      dueDate: issue.fields.duedate,
      sp: issue.fields.customfield_10030 || 1,
      originalDueDate: issue.fields.customfield_10049,
      parentKey: issue.fields.customfield_10014 || issue.key,
      parentSummary: issue.fields.parent ? issue.fields.parent.fields.summary : "",
      priority: issue.fields.priority ? issue.fields.priority.name : "",
      status: issue.fields.status ? issue.fields.status.name : ""
    };
  });
}
