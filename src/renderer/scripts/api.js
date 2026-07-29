import { t } from "./i18n.js";

export const api = window.launcher;

export async function call(action, fallbackMessage = "error.default") {
  try {
    return await action();
  } catch (error) {
    const message = typeof error?.message === "string" && error.message
      ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, "")
      : fallbackMessage;
    throw new Error(t(message), { cause: error });
  }
}
