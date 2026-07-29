import { t } from "./i18n.js";

export function element(tagName, options = {}, children = []) {
  const node = document.createElement(tagName);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = t(options.text);
  if (options.type) node.type = options.type;
  if (options.id) node.id = options.id;
  if (options.href) node.href = options.href;
  if (options.src) node.src = options.src;
  if (options.alt !== undefined) node.alt = t(options.alt);
  if (options.loading) node.loading = options.loading;
  if (options.name) node.name = options.name;
  if (options.value !== undefined) node.value = options.value;
  if (options.checked !== undefined) node.checked = options.checked;
  if (options.disabled !== undefined) node.disabled = options.disabled;
  if (options.placeholder) node.placeholder = t(options.placeholder);
  if (options.required !== undefined) node.required = options.required;
  if (options.maxLength !== undefined) node.maxLength = options.maxLength;
  if (options.role) node.setAttribute("role", options.role);
  if (options.ariaLabel) node.setAttribute("aria-label", t(options.ariaLabel));
  if (options.onClick) node.addEventListener("click", options.onClick);
  for (const child of children.flat()) {
    if (child === null || child === undefined) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function clear(node) {
  node.replaceChildren();
}

export function badge(text, tone = "") {
  return element("span", { className: `status-badge ${tone}`.trim(), text });
}

export function field(labelText, input) {
  const label = element("label", { text: labelText });
  if (input.id) label.htmlFor = input.id;
  return element("div", { className: "field" }, [label, input]);
}

export function definitionList(entries, className = "") {
  const list = element("dl", { className });
  for (const [term, description] of entries) {
    list.append(
      element("dt", { text: term }),
      element("dd", { text: description ?? "No indicado" }),
    );
  }
  return list;
}
