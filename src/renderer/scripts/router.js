const ROUTES = new Set([
  "library",
  "settings",
]);

export function currentRoute() {
  const requested = location.hash.replace(/^#\//, "").split("/")[0];
  return ROUTES.has(requested) ? requested : "library";
}

export function startRouter(onRoute) {
  const route = () => onRoute(currentRoute());
  window.addEventListener("hashchange", route);
  if (!ROUTES.has(location.hash.replace(/^#\//, "").split("/")[0])) {
    location.hash = "#/library";
  }
  route();
  return () => window.removeEventListener("hashchange", route);
}
