import { api, call } from "./api.js";
import {
  badge,
  clear,
  element,
  field,
} from "./dom.js";
import {
  getLocale,
  setLocale,
  t,
  translateDocument,
} from "./i18n.js";
import { startRouter } from "./router.js";
import { setBusy, state, updateState } from "./state.js";

const view = document.querySelector("#view");
const pageTitle = document.querySelector("#page-title");
const productName = document.querySelector("#product-name");
const appHeader = document.querySelector("#app-header");
const navToggle = document.querySelector("#nav-toggle");
const refreshButton = document.querySelector("#refresh-button");
const quickLogin = document.querySelector("#quick-login");
const licenseDialog = document.querySelector("#license-onboarding");
const licensePanel = document.querySelector("#license-choice-panel");
const licenseLater = document.querySelector("#license-later");
const permissionDialog = document.querySelector("#permission-dialog");
const permissionForm = document.querySelector("#permission-form");
const permissionTitle = document.querySelector("#permission-title");
const permissionAppName = document.querySelector("#permission-app-name");
const permissionList = document.querySelector("#permission-list");
const permissionDeclaration = document.querySelector("#permission-declaration");
const permissionCancel = document.querySelector("#permission-cancel");
const toastRegion = document.querySelector("#toast-region");

let pendingPermissionApp = null;
const navPreferenceKey = "cwenti.navigation.collapsed";

const pageMetadata = {
  library: "Biblioteca",
  settings: "Configuración",
};

const appLogoSources = {
  clax: "../../assets/branding/apps/clax.png",
  kaikei: "../../assets/branding/apps/kaikei.png",
  noman: "../../assets/branding/apps/noman.png",
};

function showToast(message, error = false) {
  const toast = element("div", {
    className: `toast${error ? " error" : ""}`,
    text: message,
  });
  toastRegion.append(toast);
  setTimeout(() => toast.remove(), 5_000);
}

function displayDate(value) {
  if (!value) return t("date.unspecified");
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? t("date.unspecified")
    : new Intl.DateTimeFormat(getLocale() === "es" ? "es-CO" : "en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

function statusTone(status) {
  if (["installed", "commercial", "personal", "trial"].includes(status)) return "good";
  if (["update-available", "migration-required", "trial-expired"].includes(status)) return "warning";
  if (["invalid", "commercial-expired"].includes(status)) return "bad";
  return "";
}

function appStatusLabel(app) {
  return {
    available: "Disponible",
    installed: "Instalada",
    "update-available": "Actualización disponible",
    "migration-required": "Preparada para migración",
  }[app.status] ?? app.status;
}

function licenseLabel(license) {
  return {
    unselected: "Sin seleccionar",
    personal: "Uso personal",
    trial: "Prueba activa",
    "trial-expired": "Prueba finalizada",
    commercial: "Licencia comercial",
    "commercial-expired": "Licencia vencida",
    invalid: "Licencia inválida",
  }[license.mode] ?? license.mode;
}

function updateChrome() {
  const bootstrap = state.bootstrap;
  if (!bootstrap) return;
  productName.textContent = bootstrap.product.productName;
  document.documentElement.dataset.theme = bootstrap.settings.theme ?? "system";
  const codexStatus = document.querySelector("#codex-sidebar-status");
  const codexDot = document.querySelector("#codex-dot");
  codexStatus.textContent = t(bootstrap.codex.checking
    ? "Conectando"
    : bootstrap.codex.available
    ? bootstrap.codex.authenticated
      ? "Codex"
      : "Sin sesión"
    : "Sin Codex");
  codexDot.className = `status-dot ${bootstrap.codex.authenticated ? "good" : bootstrap.codex.available ? "warning" : "bad"}`;
  quickLogin.textContent = t(bootstrap.codex.authenticated ? "Salir" : "Iniciar sesión");
  for (const link of document.querySelectorAll("#primary-nav a")) {
    if (link.dataset.route === state.route) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
}

function setNavigationCollapsed(collapsed) {
  appHeader.classList.toggle("collapsed", collapsed);
  navToggle.setAttribute("aria-expanded", String(!collapsed));
  navToggle.setAttribute("aria-label", t(collapsed ? "nav.expand" : "nav.collapse"));
  localStorage.setItem(navPreferenceKey, collapsed ? "true" : "false");
}

async function refreshBootstrap() {
  const bootstrap = await call(() => api.getBootstrap());
  setLocale(bootstrap.settings.language);
  translateDocument();
  updateState({ bootstrap, apps: bootstrap.apps });
  updateChrome();
  if (bootstrap.license.mode === "unselected" && !licenseDialog.open) {
    showLicenseChoice("personal");
    licenseDialog.showModal();
  }
  return bootstrap;
}

function renderAppCard(app) {
  const actionLabel = app.status === "update-available"
    ? "Actualizar"
    : app.status === "installed"
      ? "Abrir"
      : app.managedExternally
        ? "Localizar"
        : "Instalar";
  const action = element("button", {
    className: app.status === "migration-required" ? "" : "primary",
    type: "button",
    text: actionLabel,
    disabled: state.busy.has(app.id),
    onClick: () => handleAppAction(app),
  });
  const secondaryActions = [];
  if (app.installedVersion && !app.managedExternally) {
    secondaryActions.push(element("button", {
      className: "quiet danger",
      type: "button",
      text: "Desinstalar",
      onClick: () => handleUninstall(app),
    }));
  }
  return element("article", { className: "app-card" }, [
    element("div", { className: "app-preview" }, [
      element("img", {
        className: "app-logo",
        src: appLogoSources[app.id],
        alt: t("app.logo", { name: app.name }),
        loading: "eager",
      }),
      badge(appStatusLabel(app), statusTone(app.status)),
    ]),
    element("div", { className: "app-card-footer" }, [
      element("div", { className: "app-identity" }, [
        element("h2", { text: app.name }),
        element("p", { text: app.category }),
      ]),
      ...secondaryActions,
      action,
    ]),
  ]);
}

async function handleAppAction(app) {
  if (app.status === "installed") {
    const result = await runAction(app.id, () => api.openApp(app.id));
    if (result?.requiresPermissionConsent) showPermissionDialog(result.app);
    return;
  }
  if (app.managedExternally) {
    const result = await runAction(
      app.id,
      () => api.locateApp(app.id),
      t("app.connected", { name: app.name }),
    );
    if (result) {
      await refreshApps();
      renderCurrentRoute();
    }
    return;
  }
  if (app.status === "available" || app.status === "update-available") {
    await runAction(app.id, () => api.installApp(app.id), "Aplicación instalada.");
    await refreshApps();
    renderCurrentRoute();
  }
}

async function handleUninstall(app) {
  if (!window.confirm(t("app.uninstallConfirm", { name: app.name }))) return;
  await runAction(app.id, () => api.uninstallApp(app.id), "Aplicación desinstalada; los proyectos se conservaron.");
  await refreshApps();
  renderCurrentRoute();
}

function renderLibrary() {
  return element("section", { className: "section library-grid" }, [
    ...state.apps.map(renderAppCard),
  ]);
}

function activityCard(item) {
  return element("article", { className: "activity-card" }, [
    element("div", {}, [
      element("h3", { text: item.type }),
      element("p", { className: "muted", text: `${item.appId} · ${displayDate(item.at)}` }),
    ]),
    badge(item.technical?.status ?? "local"),
  ]);
}

async function renderActivity() {
  const activity = await call(() => api.getActivity());
  updateState({ activity });
  return element("section", { className: "section" }, [
    activity.length
      ? element("div", { className: "list" }, activity.map(activityCard))
      : element("div", { className: "empty-state compact", text: "Sin actividad" }),
  ]);
}

function renderLicense() {
  const license = state.bootstrap.license;
  const expiration = license.endsAt ?? license.expiresAt;
  const actions = [
    element("button", {
      type: "button",
      text: "Cambiar",
      onClick: () => {
        showLicenseChoice("personal");
        licenseDialog.showModal();
      },
    }),
    element("button", {
      className: "primary",
      type: "button",
      text: "Importar",
      onClick: importLicense,
    }),
  ];
  if (license.mode === "commercial") {
    actions.unshift(element("button", {
      className: "danger",
      type: "button",
      text: "Remover licencia",
      onClick: () => runAction("license", () => api.removeLicense()).then(refreshAndRender),
    }));
  }
  return element("section", { className: "section panel license-panel" }, [
    element("div", { className: "license-summary" }, [
      element("div", {}, [
        element("p", { className: "eyebrow", text: "Estado" }),
        element("h2", { text: licenseLabel(license) }),
        expiration
          ? element("p", {
              className: "muted",
              text: t("license.expires", { date: displayDate(expiration) }),
            })
          : null,
      ]),
      element("div", { className: "inline-actions" }, actions),
    ]),
    element("details", { className: "legal-details" }, [
      element("summary", { text: "Condiciones" }),
      element("p", {
        text: "Uso personal gratuito. La prueba comercial dura 30 días.",
      }),
    ]),
  ]);
}

function settingControl(label, description, control) {
  return element("div", { className: "setting-row" }, [
    element("div", {}, [
      element("h3", { text: label }),
      description ? element("p", { className: "muted", text: description }) : null,
    ]),
    control,
  ]);
}

function renderGeneralSettings() {
  const settings = state.bootstrap.settings;
  const languageSelect = element("select", { ariaLabel: t("settings.languageAria") }, [
    element("option", { value: "en", text: "English" }),
    element("option", { value: "es", text: "Español" }),
  ]);
  languageSelect.value = settings.language ?? "en";
  languageSelect.addEventListener("change", async () => {
    const language = languageSelect.value === "es" ? "es" : "en";
    await runAction("settings-language", () => api.updateSettings({ language }));
    state.bootstrap.settings.language = language;
    setLocale(language);
    translateDocument();
    updateChrome();
    await renderCurrentRoute();
  });
  const themeSelect = element("select", { ariaLabel: "Tema visual" }, [
    element("option", { value: "system", text: "Sistema" }),
    element("option", { value: "light", text: "Claro" }),
    element("option", { value: "dark", text: "Oscuro" }),
  ]);
  themeSelect.value = settings.theme;
  themeSelect.addEventListener("change", async () => {
    await runAction("settings", () => api.updateSettings({ theme: themeSelect.value }));
    state.bootstrap.settings.theme = themeSelect.value;
    updateChrome();
  });
  const updatesToggle = element("input", {
    type: "checkbox",
    checked: settings.autoUpdates,
    ariaLabel: "Comprobar actualizaciones automáticamente",
  });
  updatesToggle.addEventListener("change", () => runAction(
    "settings",
    () => api.updateSettings({ autoUpdates: updatesToggle.checked }),
  ));
  const codexEnabled = settings.codexEnabled !== false;
  const codexButton = element("button", {
    type: "button",
    text: codexEnabled ? "Detener App Server" : "Iniciar App Server",
    onClick: async () => {
      await runAction(
        "codex-toggle",
        () => api.setCodexEnabled(!codexEnabled),
        codexEnabled ? "Codex App Server detenido." : "Codex App Server iniciado.",
      );
      await refreshAndRender();
    },
  });
  const updatePhase = state.bootstrap.updates.phase;
  const updateButton = element("button", {
    type: "button",
    text: updatePhase === "available"
      ? "Descargar actualización"
      : updatePhase === "downloaded"
        ? "Reiniciar e instalar"
        : "Comprobar actualizaciones",
    onClick: async () => {
      if (updatePhase === "downloaded" && !window.confirm(t("updates.restartConfirm"))) return;
      const result = await runAction(
        "updates",
        () => updatePhase === "available"
          ? api.downloadUpdate()
          : updatePhase === "downloaded"
            ? api.installUpdate()
            : api.checkForUpdates(),
        updatePhase === "available" ? "Descarga iniciada." : "Comprobación completada.",
      );
      if (result) {
        state.bootstrap.updates = result;
        await renderCurrentRoute();
      }
    },
  });
  const tools = [
    updateButton,
    element("button", {
      type: "button",
      text: "Logs",
      onClick: () => runAction("logs", () => api.openLogsFolder()),
    }),
    element("button", {
      type: "button",
      text: "Diagnóstico",
      onClick: () => runAction("diagnostic", () => api.exportDiagnostics(), "Diagnóstico exportado."),
    }),
    element("button", {
      type: "button",
      text: "Exportar datos",
      onClick: () => runAction("export", () => api.exportUserData(), "Exportación completada."),
    }),
  ];
  if (state.bootstrap.developmentMode) {
    tools.push(element("button", {
      type: "button",
      text: "Instalar app desde carpeta",
      onClick: () => runAction("dev-install", () => api.chooseDevelopmentApp(), "Aplicación local instalada.")
        .then(refreshAndRender),
    }));
  }
  return element("div", {}, [
    element("section", { className: "section panel" }, [
      settingControl(t("settings.language"), "", languageSelect),
      settingControl("Tema", "", themeSelect),
      settingControl("Actualizaciones automáticas", "", updatesToggle),
      settingControl("Codex", "", codexButton),
    ]),
    element("section", { className: "section panel" }, [
      element("h2", { text: "Herramientas" }),
      element("div", { className: "inline-actions" }, tools),
    ]),
  ]);
}

function renderPrivacy() {
  return element("section", { className: "section" }, [
    element("div", { className: "panel privacy-list" }, [
      settingControl("Datos", "Guardados en este equipo.", badge("Local", "good")),
      settingControl("IA", "Codex puede conectarse con OpenAI.", badge("Codex")),
      settingControl("Telemetría", "Cwenti no envía telemetría propia.", badge("Desactivada", "good")),
    ]),
  ]);
}

function renderAbout() {
  const product = state.bootstrap.product;
  return element("section", { className: "section panel about-panel" }, [
    element("img", {
      className: "about-logo",
      src: "../../assets/branding/cwenti-icon.png",
      alt: "Cwenti",
    }),
    element("div", {}, [
      element("h2", { text: product.productName }),
      element("p", { className: "muted", text: "Versión 0.1.0" }),
      element("button", {
        className: "quiet compact-link",
        type: "button",
        text: "cwenti.com",
        onClick: () => runAction("website", () => api.openExternal(product.website)),
      }),
    ]),
  ]);
}

const settingsSections = [
  ["general", "General"],
  ["license", "Licencia"],
  ["activity", "Actividad"],
  ["privacy", "Privacidad"],
  ["about", "Acerca de"],
];

function currentSettingsSection() {
  const requested = location.hash.replace(/^#\//, "").split("/")[1];
  return settingsSections.some(([id]) => id === requested) ? requested : "general";
}

async function renderSettings() {
  const activeSection = currentSettingsSection();
  const tabs = settingsSections.map(([id, label]) => element("button", {
    className: `settings-tab${id === activeSection ? " active" : ""}`,
    type: "button",
    text: label,
    onClick: () => { location.hash = `#/settings/${id}`; },
  }));
  const content = activeSection === "license"
    ? renderLicense()
    : activeSection === "activity"
      ? await renderActivity()
      : activeSection === "privacy"
        ? renderPrivacy()
        : activeSection === "about"
          ? renderAbout()
          : renderGeneralSettings();
  return element("div", { className: "settings-view" }, [
    element("nav", {
      className: "settings-tabs",
      ariaLabel: "Secciones de configuración",
    }, tabs),
    element("div", { className: "settings-content" }, [content]),
  ]);
}

async function renderCurrentRoute() {
  const route = state.route;
  pageTitle.textContent = t(pageMetadata[route]);
  updateChrome();
  clear(view);
  let content;
  try {
    content = route === "settings" ? await renderSettings() : renderLibrary();
  } catch (error) {
    content = element("div", { className: "notice danger" }, [
      element("h2", { text: "No se pudo cargar esta vista" }),
      element("p", { text: error.message }),
    ]);
  }
  view.append(content);
  view.focus();
}

function showLicenseChoice(choice) {
  for (const button of document.querySelectorAll("[data-license-choice]")) {
    button.classList.toggle("active", button.dataset.licenseChoice === choice);
  }
  clear(licensePanel);
  if (choice === "personal") {
    const declaration = element("input", { type: "checkbox", required: true, id: "personal-declaration" });
    const form = element("form", {}, [
      element("div", { className: "notice" }, [
        element("p", { text: "Gratis para uso personal y no comercial." }),
      ]),
      element("label", { className: "check-row" }, [
        declaration,
        element("span", { text: "Declaro que la información proporcionada es correcta y que este uso no es comercial." }),
      ]),
      element("div", { className: "modal-actions" }, [
        element("button", { className: "primary", type: "submit", text: "Activar uso personal" }),
      ]),
    ]);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      await runAction("license", () => api.selectPersonalUse(declaration.checked));
      await finishLicenseSelection();
    });
    licensePanel.append(form);
  } else if (choice === "trial") {
    const organization = element("input", { id: "trial-organization", required: true, maxLength: 200 });
    const email = element("input", { id: "trial-email", required: true, maxLength: 254 });
    email.type = "email";
    const country = element("input", { id: "trial-country", required: true, maxLength: 100 });
    const prior = element("input", { type: "checkbox", required: true });
    const declaration = element("input", { type: "checkbox", required: true });
    const form = element("form", {}, [
      element("div", { className: "notice warning" }, [
        element("p", { text: "30 días. Una prueba por organización." }),
      ]),
      element("div", { className: "field-grid" }, [
        field("Organización", organization),
        field("Correo corporativo", email),
        field("País", country),
      ]),
      element("label", { className: "check-row" }, [
        prior,
        element("span", { text: "Confirmo que la organización no ha utilizado previamente esta prueba." }),
      ]),
      element("label", { className: "check-row" }, [
        declaration,
        element("span", { text: "Declaro que la información proporcionada es correcta." }),
      ]),
      element("div", { className: "modal-actions" }, [
        element("button", { className: "primary", type: "submit", text: "Iniciar prueba" }),
      ]),
    ]);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      await runAction("license", () => api.startCommercialTrial({
        organization: organization.value,
        email: email.value,
        country: country.value,
        noPriorTrialConfirmed: prior.checked,
        declarationAccepted: declaration.checked,
      }));
      await finishLicenseSelection();
    });
    licensePanel.append(form);
  } else {
    licensePanel.append(
      element("div", { className: "notice" }, [
        element("p", { text: "Selecciona tu archivo .license.json." }),
      ]),
      element("div", { className: "modal-actions" }, [
        element("button", {
          className: "primary",
          type: "button",
          text: "Seleccionar licencia",
          onClick: async () => {
            const result = await importLicense();
            if (result) await finishLicenseSelection();
          },
        }),
      ]),
    );
  }
}

async function finishLicenseSelection() {
  await refreshBootstrap();
  licenseDialog.close();
  await renderCurrentRoute();
}

async function importLicense() {
  return runAction("license", () => api.importLicense(), "Licencia comercial activada.");
}

function showPermissionDialog(app) {
  pendingPermissionApp = app;
  permissionTitle.textContent = t("permissions.title");
  permissionAppName.textContent = app.name;
  clear(permissionList);
  const labels = {
    filesystem: "Archivos",
    shell: "Comandos",
    network: "Red",
    externalLinks: "Enlaces externos",
  };
  for (const [key, value] of Object.entries(app.permissions)) {
    permissionList.append(
      element("dt", { text: labels[key] ?? key }),
      element("dd", { text: `${value} — ${app.reasons[key]}` }),
    );
  }
  permissionDeclaration.checked = false;
  permissionDialog.showModal();
}

async function handleCodexAuth() {
  const authenticated = state.bootstrap.codex.authenticated;
  if (authenticated && !window.confirm(t("auth.logoutConfirm"))) return;
  await runAction(
    "codex-auth",
    () => authenticated ? api.logoutCodex() : api.loginCodex(),
    authenticated ? "Sesión cerrada." : "Complete el inicio de sesión en su navegador.",
  );
  setTimeout(() => refreshAndRender(), authenticated ? 0 : 1_500);
}

async function refreshApps() {
  const apps = await call(() => api.getApps());
  state.apps = apps;
  state.bootstrap.apps = apps;
}

async function refreshAndRender() {
  await refreshBootstrap();
  await renderCurrentRoute();
}

async function runAction(key, action, successMessage = "") {
  if (state.busy.has(key)) return null;
  setBusy(key, true);
  try {
    const result = await call(action);
    if (successMessage && result !== null) showToast(successMessage);
    return result;
  } catch (error) {
    showToast(error.message, true);
    return null;
  } finally {
    setBusy(key, false);
  }
}

for (const button of document.querySelectorAll("[data-license-choice]")) {
  button.addEventListener("click", () => showLicenseChoice(button.dataset.licenseChoice));
}

licenseLater.addEventListener("click", () => licenseDialog.close());

permissionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!pendingPermissionApp) return;
  const result = await runAction(
    pendingPermissionApp.id,
    () => api.acceptAppPermissions(pendingPermissionApp.id, permissionDeclaration.checked),
  );
  if (result?.opened) {
    permissionDialog.close();
    pendingPermissionApp = null;
  }
});

permissionCancel.addEventListener("click", () => {
  permissionDialog.close();
  pendingPermissionApp = null;
});

quickLogin.addEventListener("click", handleCodexAuth);
navToggle.addEventListener("click", () => {
  setNavigationCollapsed(!appHeader.classList.contains("collapsed"));
});
refreshButton.addEventListener("click", () => runAction(
  "refresh",
  refreshAndRender,
  "Información actualizada.",
));

api.onActivity((event) => {
  state.activity.unshift(event);
  if (state.route === "settings" && currentSettingsSection() === "activity") {
    void renderCurrentRoute();
  }
});
api.onCodexEvent((event) => {
  if (event.type === "status.updated" && event.status && state.bootstrap) {
    state.bootstrap.codex = event.status;
    updateChrome();
    return;
  }
  if (event.type === "auth.updated" || event.type === "auth.login-completed") {
    setTimeout(() => refreshAndRender(), 400);
  }
});

setNavigationCollapsed(localStorage.getItem(navPreferenceKey) === "true");
await refreshBootstrap();
startRouter((route) => {
  updateState({ route });
  void renderCurrentRoute();
});
