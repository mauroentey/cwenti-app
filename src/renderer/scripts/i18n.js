export const messages = Object.freeze({
  library: { en: "Library", es: "Biblioteca" },
  settings: { en: "Settings", es: "Configuración" },
  "nav.collapse": { en: "Collapse navigation", es: "Colapsar navegación" },
  "nav.expand": { en: "Expand navigation", es: "Expandir navegación" },
  "nav.primary": { en: "Primary navigation", es: "Navegación principal" },
  "account.label": { en: "Account", es: "Cuenta" },
  "account.signIn": { en: "Sign in", es: "Iniciar sesión" },
  "account.signOut": { en: "Sign out", es: "Salir" },
  "codex.connecting": { en: "Connecting", es: "Conectando" },
  "codex.signedOut": { en: "Signed out", es: "Sin sesión" },
  "codex.unavailable": { en: "Codex unavailable", es: "Sin Codex" },
  "refresh.label": { en: "Refresh information", es: "Actualizar información" },
  "status.available": { en: "Available", es: "Disponible" },
  "status.installed": { en: "Installed", es: "Instalada" },
  "status.updateAvailable": { en: "Update available", es: "Actualización disponible" },
  "status.migrationRequired": { en: "Ready to migrate", es: "Preparada para migración" },
  "action.update": { en: "Update", es: "Actualizar" },
  "action.open": { en: "Open", es: "Abrir" },
  "action.locate": { en: "Locate", es: "Localizar" },
  "action.install": { en: "Install", es: "Instalar" },
  "action.uninstall": { en: "Uninstall", es: "Desinstalar" },
  "app.logo": { en: "{name} logo", es: "Logo de {name}" },
  "app.connected": { en: "{name} connected to Cwenti.", es: "{name} conectada con Cwenti." },
  "app.installed": { en: "Application installed.", es: "Aplicación instalada." },
  "app.uninstallConfirm": {
    en: "Uninstall {name}? Projects and history will be preserved.",
    es: "¿Desinstalar {name}? Los proyectos y el historial se conservarán.",
  },
  "app.uninstalled": {
    en: "Application uninstalled; projects were preserved.",
    es: "Aplicación desinstalada; los proyectos se conservaron.",
  },
  "activity.empty": { en: "No activity", es: "Sin actividad" },
  "date.unspecified": { en: "Not specified", es: "No indicada" },
  "license.unselected": { en: "Not selected", es: "Sin seleccionar" },
  "license.personal": { en: "Personal use", es: "Uso personal" },
  "license.trial": { en: "Active trial", es: "Prueba activa" },
  "license.trialExpired": { en: "Trial ended", es: "Prueba finalizada" },
  "license.commercial": { en: "Commercial license", es: "Licencia comercial" },
  "license.commercialExpired": { en: "License expired", es: "Licencia vencida" },
  "license.invalid": { en: "Invalid license", es: "Licencia inválida" },
  "license.change": { en: "Change", es: "Cambiar" },
  "license.import": { en: "Import", es: "Importar" },
  "license.remove": { en: "Remove license", es: "Remover licencia" },
  "license.status": { en: "Status", es: "Estado" },
  "license.expires": { en: "Expires {date}", es: "Vence {date}" },
  "license.terms": { en: "Terms", es: "Condiciones" },
  "license.termsSummary": {
    en: "Free for personal use. The commercial trial lasts 30 days.",
    es: "Uso personal gratuito. La prueba comercial dura 30 días.",
  },
  "settings.language": { en: "Language", es: "Idioma" },
  "settings.languageAria": { en: "Interface language", es: "Idioma de la interfaz" },
  "settings.theme": { en: "Theme", es: "Tema" },
  "settings.themeAria": { en: "Visual theme", es: "Tema visual" },
  "theme.system": { en: "System", es: "Sistema" },
  "theme.light": { en: "Light", es: "Claro" },
  "theme.dark": { en: "Dark", es: "Oscuro" },
  "settings.autoUpdates": { en: "Automatic updates", es: "Actualizaciones automáticas" },
  "settings.autoUpdatesAria": {
    en: "Automatically check for updates",
    es: "Comprobar actualizaciones automáticamente",
  },
  "codex.stop": { en: "Stop App Server", es: "Detener App Server" },
  "codex.start": { en: "Start App Server", es: "Iniciar App Server" },
  "codex.stopped": { en: "Codex App Server stopped.", es: "Codex App Server detenido." },
  "codex.started": { en: "Codex App Server started.", es: "Codex App Server iniciado." },
  "updates.download": { en: "Download update", es: "Descargar actualización" },
  "updates.restart": { en: "Restart and install", es: "Reiniciar e instalar" },
  "updates.check": { en: "Check for updates", es: "Comprobar actualizaciones" },
  "updates.restartConfirm": {
    en: "Restart now to install the update?",
    es: "¿Reiniciar ahora para instalar la actualización?",
  },
  "updates.downloadStarted": { en: "Download started.", es: "Descarga iniciada." },
  "updates.checkComplete": { en: "Update check complete.", es: "Comprobación completada." },
  "tools.title": { en: "Tools", es: "Herramientas" },
  "tools.logs": { en: "Logs", es: "Logs" },
  "tools.diagnostics": { en: "Diagnostics", es: "Diagnóstico" },
  "tools.diagnosticsExported": { en: "Diagnostics exported.", es: "Diagnóstico exportado." },
  "tools.exportData": { en: "Export data", es: "Exportar datos" },
  "tools.exportComplete": { en: "Export complete.", es: "Exportación completada." },
  "tools.installFolder": { en: "Install app from folder", es: "Instalar app desde carpeta" },
  "tools.localInstalled": { en: "Local application installed.", es: "Aplicación local instalada." },
  "privacy.data": { en: "Data", es: "Datos" },
  "privacy.dataDescription": { en: "Stored on this device.", es: "Guardados en este equipo." },
  "privacy.ai": { en: "AI", es: "IA" },
  "privacy.aiDescription": { en: "Codex can connect to OpenAI.", es: "Codex puede conectarse con OpenAI." },
  "privacy.telemetry": { en: "Telemetry", es: "Telemetría" },
  "privacy.telemetryDescription": {
    en: "Cwenti does not send its own telemetry.",
    es: "Cwenti no envía telemetría propia.",
  },
  "privacy.disabled": { en: "Disabled", es: "Desactivada" },
  "about.version": { en: "Version 0.1.0", es: "Versión 0.1.0" },
  "settings.general": { en: "General", es: "General" },
  "settings.license": { en: "License", es: "Licencia" },
  "settings.activity": { en: "Activity", es: "Actividad" },
  "settings.privacy": { en: "Privacy", es: "Privacidad" },
  "settings.about": { en: "About", es: "Acerca de" },
  "settings.sections": { en: "Settings sections", es: "Secciones de configuración" },
  "view.loadError": { en: "This view could not be loaded", es: "No se pudo cargar esta vista" },
  "onboarding.title": { en: "Choose how you will use Cwenti", es: "Elige tu tipo de uso" },
  "onboarding.localOnly": { en: "Saved only on this device.", es: "Se guarda solo en este equipo." },
  "onboarding.mode": { en: "Usage type", es: "Modalidad de uso" },
  "onboarding.personal": { en: "Personal", es: "Personal" },
  "onboarding.trial": { en: "Trial · 30 days", es: "Prueba · 30 días" },
  "onboarding.license": { en: "License", es: "Licencia" },
  "onboarding.later": { en: "Not now, explore Cwenti", es: "Ahora no, explorar Cwenti" },
  "personal.free": {
    en: "Free for personal and non-commercial use.",
    es: "Gratis para uso personal y no comercial.",
  },
  "personal.declaration": {
    en: "I confirm that the information provided is correct and this use is not commercial.",
    es: "Declaro que la información proporcionada es correcta y que este uso no es comercial.",
  },
  "personal.activate": { en: "Activate personal use", es: "Activar uso personal" },
  "trial.summary": { en: "30 days. One trial per organization.", es: "30 días. Una prueba por organización." },
  "trial.organization": { en: "Organization", es: "Organización" },
  "trial.email": { en: "Work email", es: "Correo corporativo" },
  "trial.country": { en: "Country", es: "País" },
  "trial.prior": {
    en: "I confirm that the organization has not used this trial before.",
    es: "Confirmo que la organización no ha utilizado previamente esta prueba.",
  },
  "trial.declaration": {
    en: "I confirm that the information provided is correct.",
    es: "Declaro que la información proporcionada es correcta.",
  },
  "trial.start": { en: "Start trial", es: "Iniciar prueba" },
  "license.selectFile": { en: "Select your .license.json file.", es: "Selecciona tu archivo .license.json." },
  "license.select": { en: "Select license", es: "Seleccionar licencia" },
  "license.activated": { en: "Commercial license activated.", es: "Licencia comercial activada." },
  "permissions.title": { en: "Application permissions", es: "Permisos de la aplicación" },
  "permissions.files": { en: "Files", es: "Archivos" },
  "permissions.commands": { en: "Commands", es: "Comandos" },
  "permissions.network": { en: "Network", es: "Red" },
  "permissions.links": { en: "External links", es: "Enlaces externos" },
  "permissions.accept": { en: "I accept these permissions.", es: "Acepto estos permisos." },
  "permissions.cancel": { en: "Cancel", es: "Cancelar" },
  "permissions.open": { en: "Accept and open", es: "Aceptar y abrir" },
  "auth.logoutConfirm": {
    en: "Sign out of Codex on this device?",
    es: "¿Cerrar la sesión de Codex en este equipo?",
  },
  "auth.signedOut": { en: "Signed out.", es: "Sesión cerrada." },
  "auth.completeInBrowser": {
    en: "Complete sign-in in your browser.",
    es: "Complete el inicio de sesión en su navegador.",
  },
  "refresh.complete": { en: "Information updated.", es: "Información actualizada." },
  "category.education": { en: "Education", es: "Educación" },
  "category.finance": { en: "Finance", es: "Finanzas" },
  "category.communication": { en: "Communication", es: "Comunicación" },
  "error.default": {
    en: "The operation could not be completed.",
    es: "No se pudo completar la operación.",
  },
});

const valueKeys = new Map();
for (const [key, translation] of Object.entries(messages)) {
  valueKeys.set(translation.en, key);
  valueKeys.set(translation.es, key);
}

let activeLocale = "en";

export function getLocale() {
  return activeLocale;
}

export function setLocale(locale) {
  activeLocale = locale === "es" ? "es" : "en";
  return activeLocale;
}

export function t(keyOrValue, variables = {}) {
  const key = messages[keyOrValue] ? keyOrValue : valueKeys.get(String(keyOrValue));
  const template = key ? messages[key][activeLocale] : String(keyOrValue);
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, name) => String(variables[name] ?? ""));
}

export function translateDocument(root = document) {
  document.documentElement.lang = activeLocale;
  for (const node of root.querySelectorAll("[data-i18n]")) {
    node.textContent = t(node.dataset.i18n);
  }
  for (const node of root.querySelectorAll("[data-i18n-aria-label]")) {
    node.setAttribute("aria-label", t(node.dataset.i18nAriaLabel));
  }
}
