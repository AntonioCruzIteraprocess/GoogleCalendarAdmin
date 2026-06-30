/**
 * Configuración del Planificador Jira → Calendar
 */

function getPlannerConfig() {
  const data = PropertiesService.getScriptProperties().getProperty("plannerConfig");
  return data ? JSON.parse(data) : {
    jira_server: "",
    jira_email: "",
    jira_token: "",
    project_key: "",
    calendar_name: "primary",
    calendar_id: "",
    event_color: "CYAN",
    guests: "",
    work_start_hour: 9,
    work_end_hour: 18,
    min_block_minutes: 30,
    sp_to_hours: { "1": 2, "2": 4, "3": 16, "5": 32, "8": 40, "13": 80 },
    webhook_url: ""
  };
}

function savePlannerConfig(config) {
  PropertiesService.getScriptProperties().setProperty("plannerConfig", JSON.stringify(config));
  return { success: true };
}
