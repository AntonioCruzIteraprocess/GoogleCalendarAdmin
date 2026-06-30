/**
 * Configuración de Tempo/Jira
 * Se almacena en PropertiesService junto con la config general
 */

function getTempoConfig() {
  const data = PropertiesService.getScriptProperties().getProperty("tempoConfig");
  return data ? JSON.parse(data) : {
    jira_server: "",
    jira_email: "",
    jira_token: "",
    tempo_token: "",
    tempo_account_id: "",
    notify_email: "",
    hora_inicio: 0,
    hora_fin: 24,
    mes_offset: 0,
    attr: {
      actividad_key: "_Actividad_",
      facturable_key: "_HorasFacturables_",
      facturable_si: "",
      facturable_no: ""
    }
  };
}

function saveTempoConfig(config) {
  PropertiesService.getScriptProperties().setProperty("tempoConfig", JSON.stringify(config));
  return { success: true };
}

function getActividades() {
  const data = PropertiesService.getScriptProperties().getProperty("actividades");
  return data ? JSON.parse(data) : DEFAULT_ACTIVIDADES;
}

function saveActividades(actividades) {
  PropertiesService.getScriptProperties().setProperty("actividades", JSON.stringify(actividades));
  return { success: true };
}

/** Obtener actividades desde Tempo API (work-attributes) */
function fetchActividadesFromTempo() {
  const tc = getTempoConfig();
  const response = UrlFetchApp.fetch("https://api.tempo.io/4/work-attributes", {
    method: "get",
    headers: { "Authorization": "Bearer " + tc.tempo_token, "Accept": "application/json" },
    muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) throw new Error("Tempo API error " + response.getResponseCode());

  const data = JSON.parse(response.getContentText());
  const actKey = tc.attr && tc.attr.actividad_key ? tc.attr.actividad_key : "_Actividad_";

  // Buscar el atributo de actividad
  const attrList = data.results || data;
  const actAttr = attrList.find(a => a.key === actKey);
  if (!actAttr) throw new Error("Atributo '" + actKey + "' no encontrado en Tempo");
  if (!actAttr.values || !actAttr.values.length) throw new Error("El atributo no tiene valores configurados");

  // Convertir a formato del catalogo: values es array de strings, names es {key: nombre}
  const actividades = {};
  actAttr.values.forEach(v => {
    actividades[v] = { nombre: actAttr.names[v] || v, codigo: v };
  });
  return actividades;
}

/** Sincronizar: obtiene de Tempo y guarda */
function syncActividadesFromTempo() {
  const actividades = fetchActividadesFromTempo();
  saveActividades(actividades);
  return actividades;
}

/** Obtener todos los work-attributes de Tempo para el catálogo de etiquetas */
function fetchTempoWorkAttributes() {
  const tc = getTempoConfig();
  const response = UrlFetchApp.fetch("https://api.tempo.io/4/work-attributes", {
    method: "get",
    headers: { "Authorization": "Bearer " + tc.tempo_token, "Accept": "application/json" },
    muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) throw new Error("Tempo API error " + response.getResponseCode());

  const data = JSON.parse(response.getContentText());
  const attrList = data.results || data;

  return attrList.map(attr => {
    const values = [];
    if (attr.type === "STATIC_LIST" && attr.values) {
      attr.values.forEach(v => {
        values.push({ value: v, name: (attr.names && attr.names[v]) || v });
      });
    }
    return {
      key: attr.key,
      name: attr.name,
      type: attr.type,
      required: attr.required || false,
      values: values
    };
  });
}

var DEFAULT_ACTIVIDADES = {
  "Admproyecto":                          { nombre: "Adm proyecto",      codigo: "ADMP" },
  "61091e83-27b3-42de-b88f-cc2716935dd1": { nombre: "Administrativa",    codigo: "ADMIN" },
  "Asuntopersonal":                       { nombre: "Asunto personal",   codigo: "APER" },
  "Autoestudio":                          { nombre: "Autoestudio",       codigo: "AUTO" },
  "Comercial":                            { nombre: "Comercial",         codigo: "COME" },
  "Comunidad":                            { nombre: "Comunidad",         codigo: "COMU" },
  "Consultoria":                          { nombre: "Consultoría",       codigo: "CONS" },
  "Curso-asistir":                        { nombre: "Curso - asistir",   codigo: "CASIS" },
  "Curso-dictar":                         { nombre: "Curso - dictar",    codigo: "CDICT" },
  "Dessoftware":                          { nombre: "Des software",      codigo: "DESA" },
  "5651cfba-b99b-4f5a-aab1-7232c69a25b2": { nombre: "Día compensatorio", codigo: "DCOMP" },
  "Diafestivo":                           { nombre: "Día festivo",       codigo: "FEST" },
  "Gestionhumana":                        { nombre: "Gestión humana",    codigo: "GH" },
  "Incapacidad":                          { nombre: "Incapacidad",       codigo: "INCA" },
  "Mercadontecnia":                       { nombre: "Mercadotecnia",     codigo: "MKT" },
  "Pre-ventatec":                         { nombre: "Pre-venta tec",     codigo: "PREV" },
  "Proveedor":                            { nombre: "Proveedor",         codigo: "PROV" },
  "Reportes":                             { nombre: "Reportes",          codigo: "REPO" },
  "Reunioncliente":                       { nombre: "Reunión cliente",   codigo: "RCLI" },
  "Reunioninterna":                       { nombre: "Reunión interna",   codigo: "RINT" },
  "Soportetecnico":                       { nombre: "Soporte técnico",   codigo: "SOPO" },
  "Telemarketing":                        { nombre: "Telemarketing",     codigo: "TMK" },
  "Transporte":                           { nombre: "Transporte",        codigo: "TRANS" },
  "Vacacion":                             { nombre: "Vacación",          codigo: "VACA" }
};
