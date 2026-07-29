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
  library: "library",
  settings: "settings",
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
    available: t("status.available"),
    installed: t("status.installed"),
    "update-available": t("status.updateAvailable"),
    "migration-required": t("status.migrationRequired"),
  }[app.status] ?? app.status;
}

function licenseLabel(license) {
  const key = {
    unselected: "license.unselected",
    personal: "license.personal",
    trial: "license.trial",
    "trial-expired": "license.trialExpired",
    commercial: "license.commercial",
    "commercial-expired": "license.commercialExpired",
    invalid: "license.invalid",
  }[license.mode];
  return key ? t(key) : license.mode;
}

function updateChrome() {
  const bootstrap = state.bootstrap;
  if (!bootstrap) return;
  productName.textContent = bootstrap.product.productName;
  document.documentElement.dataset.theme = bootstrap.settings.theme ?? "system";
  const codexStatus = document.querySelector("#codex-sidebar-status");
  const codexDot = document.querySelector("#codex-dot");
  codexStatus.textContent = t(bootstrap.codex.checking
    ? "codex.connecting"
    : bootstrap.codex.available
    ? bootstrap.codex.authenticated
      ? "Codex"
      : "codex.signedOut"
    : "codex.unavailable");
  codexDot.className = `status-dot ${bootstrap.codex.authenticated ? "good" : bootstrap.codex.available ? "warning" : "bad"}`;
  quickLogin.textContent = t(
    bootstrap.codex.authenticated ? "account.signOut" : "account.signIn",
  );
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
    ? t("action.update")
    : app.status === "installed"
      ? t("action.open")
      : app.managedExternally
        ? t("action.locate")
        : t("action.install");
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
      text: t("action.uninstall"),
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
        element("p", {
          text: getLocale() === "es" ? app.categoryEs ?? app.category : app.category,
        }),
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
    await runAction(app.id, () => api.installApp(app.id), t("app.installed"));
    await refreshApps();
    renderCurrentRoute();
  }
}

async function handleUninstall(app) {
  if (!window.confirm(t("app.uninstallConfirm", { name: app.name }))) return;
  await runAction(app.id, () => api.uninstallApp(app.id), t("app.uninstalled"));
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
      : element("div", { className: "empty-state compact", text: t("activity.empty") }),
  ]);
}

function renderLicense() {
  const license = state.bootstrap.license;
  const expiration = license.endsAt ?? license.expiresAt;
  const actions = [
    element("button", {
      type: "button",
      text: t("license.change"),
      onClick: () => {
        showLicenseChoice("personal");
        licenseDialog.showModal();
      },
    }),
    element("button", {
      className: "primary",
      type: "button",
      text: t("license.import"),
      onClick: importLicense,
    }),
  ];
  if (license.mode === "commercial") {
    actions.unshift(element("button", {
      className: "danger",
      type: "button",
      text: t("license.remove"),
      onClick: () => runAction("license", () => api.removeLicense()).then(refreshAndRender),
    }));
  }
  return element("section", { className: "section panel license-panel" }, [
    element("div", { className: "license-summary" }, [
      element("div", {}, [
        element("p", { className: "eyebrow", text: t("license.status") }),
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
      element("summary", { text: t("license.terms") }),
      element("p", {
        text: t("license.termsSummary"),
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
  const themeSelect = element("select", { ariaLabel: t("settings.themeAria") }, [
    element("option", { value: "system", text: t("theme.system") }),
    element("option", { value: "light", text: t("theme.light") }),
    element("option", { value: "dark", text: t("theme.dark") }),
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
    ariaLabel: t("settings.autoUpdatesAria"),
  });
  updatesToggle.addEventListener("change", () => runAction(
    "settings",
    () => api.updateSettings({ autoUpdates: updatesToggle.checked }),
  ));
  const codexEnabled = settings.codexEnabled !== false;
  const codexButton = element("button", {
    type: "button",
    text: t(codexEnabled ? "codex.stop" : "codex.start"),
    onClick: async () => {
      await runAction(
        "codex-toggle",
        () => api.setCodexEnabled(!codexEnabled),
        t(codexEnabled ? "codex.stopped" : "codex.started"),
      );
      await refreshAndRender();
    },
  });
  const updatePhase = state.bootstrap.updates.phase;
  const updateButton = element("button", {
    type: "button",
    text: updatePhase === "available"
      ? t("updates.download")
      : updatePhase === "downloaded"
        ? t("updates.restart")
        : t("updates.check"),
    onClick: async () => {
      if (updatePhase === "downloaded" && !window.confirm(t("updates.restartConfirm"))) return;
      const result = await runAction(
        "updates",
        () => updatePhase === "available"
          ? api.downloadUpdate()
          : updatePhase === "downloaded"
            ? api.installUpdate()
            : api.checkForUpdates(),
        t(updatePhase === "available"
          ? "updates.downloadStarted"
          : "updates.checkComplete"),
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
      text: t("tools.logs"),
      onClick: () => runAction("logs", () => api.openLogsFolder()),
    }),
    element("button", {
      type: "button",
      text: t("tools.diagnostics"),
      onClick: () => runAction(
        "diagnostic",
        () => api.exportDiagnostics(),
        t("tools.diagnosticsExported"),
      ),
    }),
    element("button", {
      type: "button",
      text: t("tools.exportData"),
      onClick: () => runAction(
        "export",
        () => api.exportUserData(),
        t("tools.exportComplete"),
      ),
    }),
  ];
  if (state.bootstrap.developmentMode) {
    tools.push(element("button", {
      type: "button",
      text: t("tools.installFolder"),
      onClick: () => runAction(
        "dev-install",
        () => api.chooseDevelopmentApp(),
        t("tools.localInstalled"),
      )
        .then(refreshAndRender),
    }));
  }
  return element("div", {}, [
    element("section", { className: "section panel" }, [
      settingControl(t("settings.language"), "", languageSelect),
      settingControl(t("settings.theme"), "", themeSelect),
      settingControl(t("settings.autoUpdates"), "", updatesToggle),
      settingControl("Codex", "", codexButton),
    ]),
    element("section", { className: "section panel" }, [
      element("h2", { text: t("tools.title") }),
      element("div", { className: "inline-actions" }, tools),
    ]),
  ]);
}

function renderPrivacy() {
  return element("section", { className: "section" }, [
    element("div", { className: "panel privacy-list" }, [
      settingControl(
        t("privacy.data"),
        t("privacy.dataDescription"),
        badge("Local", "good"),
      ),
      settingControl(t("privacy.ai"), t("privacy.aiDescription"), badge("Codex")),
      settingControl(
        t("privacy.telemetry"),
        t("privacy.telemetryDescription"),
        badge(t("privacy.disabled"), "good"),
      ),
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
      element("p", {
        className: "muted",
        text: t("about.version", { version: product.version }),
      }),
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
  ["general", "settings.general"],
  ["license", "settings.license"],
  ["activity", "settings.activity"],
  ["privacy", "settings.privacy"],
  ["about", "settings.about"],
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
    text: t(label),
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
      ariaLabel: t("settings.sections"),
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
      element("h2", { text: t("view.loadError") }),
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
        element("p", { text: t("personal.free") }),
      ]),
      element("label", { className: "check-row" }, [
        declaration,
        element("span", { text: t("personal.declaration") }),
      ]),
      element("div", { className: "modal-actions" }, [
        element("button", {
          className: "primary",
          type: "submit",
          text: t("personal.activate"),
        }),
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
        element("p", { text: t("trial.summary") }),
      ]),
      element("div", { className: "field-grid" }, [
        field(t("trial.organization"), organization),
        field(t("trial.email"), email),
        field(t("trial.country"), country),
      ]),
      element("label", { className: "check-row" }, [
        prior,
        element("span", { text: t("trial.prior") }),
      ]),
      element("label", { className: "check-row" }, [
        declaration,
        element("span", { text: t("trial.declaration") }),
      ]),
      element("div", { className: "modal-actions" }, [
        element("button", {
          className: "primary",
          type: "submit",
          text: t("trial.start"),
        }),
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
        element("p", { text: t("license.selectFile") }),
      ]),
      element("div", { className: "modal-actions" }, [
        element("button", {
          className: "primary",
          type: "button",
          text: t("license.select"),
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
  return runAction("license", () => api.importLicense(), t("license.activated"));
}

function showPermissionDialog(app) {
  pendingPermissionApp = app;
  permissionTitle.textContent = t("permissions.title");
  permissionAppName.textContent = app.name;
  clear(permissionList);
  const labels = {
    filesystem: t("permissions.files"),
    shell: t("permissions.commands"),
    network: t("permissions.network"),
    externalLinks: t("permissions.links"),
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
    t(authenticated ? "auth.signedOut" : "auth.completeInBrowser"),
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
  t("refresh.complete"),
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
