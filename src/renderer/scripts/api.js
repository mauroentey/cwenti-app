export const api = window.launcher;

export async function call(action, fallbackMessage = "No se pudo completar la operación.") {
  try {
    return await action();
  } catch (error) {
    const message = typeof error?.message === "string" && error.message
      ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, "")
      : fallbackMessage;
    throw new Error(message, { cause: error });
  }
}
