const elements = {
  agentStatus: document.querySelector("#agent-status"),
  workspaceTitle: document.querySelector("#workspace-title"),
  workspacePath: document.querySelector("#workspace-path"),
  chooseWorkspace: document.querySelector("#choose-workspace"),
  taskInput: document.querySelector("#task-input"),
  runTask: document.querySelector("#run-task"),
  stopTask: document.querySelector("#stop-task"),
  backLauncher: document.querySelector("#back-launcher"),
  message: document.querySelector("#message"),
  activityList: document.querySelector("#activity-list"),
  approvalDialog: document.querySelector("#approval-dialog"),
  approvalTitle: document.querySelector("#approval-title"),
  approvalDetails: document.querySelector("#approval-details"),
};

let context = null;
let activeThreadId = null;
let pendingApproval = null;

function setMessage(message, isError = false) {
  elements.message.textContent = message;
  elements.message.classList.toggle("error-message", isError);
}

function addActivity(event) {
  const item = document.createElement("li");
  const timestamp = new Date(event.at ?? Date.now()).toLocaleTimeString();
  item.textContent = `${timestamp} · ${event.type}: ${event.message ?? ""}`;
  elements.activityList.prepend(item);
  while (elements.activityList.children.length > 100) {
    elements.activityList.lastElementChild?.remove();
  }
}

function renderContext() {
  const workspace = context?.workspace;
  elements.workspaceTitle.textContent = workspace?.name ?? "Sin carpeta seleccionada";
  elements.workspacePath.textContent = workspace?.path ?? "El launcher limitará el acceso a la carpeta que elija.";
}

async function initialize() {
  context = await window.officialApp.getContext();
  renderContext();
  window.officialApp.onActivity((event) => {
    addActivity(event);
    if (event.type === "turn.completed" || event.type === "turn.failed") {
      elements.agentStatus.textContent = "Agente detenido";
    }
  });
  window.officialApp.onApproval((request) => showApproval(request));
}

async function showApproval(request) {
  pendingApproval = request;
  elements.approvalTitle.textContent = request.title ?? "Acción solicitada";
  elements.approvalDetails.replaceChildren();
  for (const [label, value] of Object.entries(request.details ?? {})) {
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    term.textContent = label;
    description.textContent = String(value);
    elements.approvalDetails.append(term, description);
  }
  elements.approvalDialog.showModal();
}

elements.approvalDialog.addEventListener("close", async () => {
  if (!pendingApproval) return;
  const decision = elements.approvalDialog.returnValue;
  const requestId = pendingApproval.requestId;
  pendingApproval = null;
  await window.officialApp.respondToApproval(requestId, decision);
});

elements.chooseWorkspace.addEventListener("click", async () => {
  try {
    const workspace = await window.officialApp.chooseWorkspace();
    if (workspace) {
      context = { ...context, workspace };
      activeThreadId = null;
      renderContext();
      setMessage("Workspace activo actualizado.");
    }
  } catch (error) {
    setMessage(error.message, true);
  }
});

elements.runTask.addEventListener("click", async () => {
  const prompt = elements.taskInput.value.trim();
  if (!prompt) {
    setMessage("Escribe una tarea.", true);
    return;
  }
  if (!context?.workspace) {
    setMessage("Selecciona un workspace antes de iniciar una tarea.", true);
    return;
  }
  try {
    elements.agentStatus.textContent = "Agente trabajando";
    setMessage("Iniciando tarea…");
    if (!activeThreadId) {
      const result = await window.officialApp.startThread();
      activeThreadId = result.threadId;
    }
    await window.officialApp.startTurn(activeThreadId, prompt);
    setMessage("Tarea iniciada. La actividad aparecerá abajo.");
  } catch (error) {
    elements.agentStatus.textContent = "Agente detenido";
    setMessage(error.message, true);
  }
});

elements.stopTask.addEventListener("click", async () => {
  if (!activeThreadId) return;
  try {
    await window.officialApp.interruptTurn(activeThreadId);
    setMessage("Se solicitó detener la tarea.");
  } catch (error) {
    setMessage(error.message, true);
  }
});

elements.backLauncher.addEventListener("click", () => window.officialApp.backToLauncher());

initialize().catch((error) => setMessage(error.message, true));
