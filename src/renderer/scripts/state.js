const listeners = new Set();

export const state = {
  bootstrap: null,
  apps: [],
  activity: [],
  route: "library",
  busy: new Set(),
};

export function updateState(patch) {
  Object.assign(state, patch);
  for (const listener of listeners) listener(state);
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setBusy(key, value) {
  if (value) state.busy.add(key);
  else state.busy.delete(key);
  for (const listener of listeners) listener(state);
}
