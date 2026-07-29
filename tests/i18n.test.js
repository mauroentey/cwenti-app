import assert from "node:assert/strict";
import test from "node:test";
import {
  messages,
  setLocale,
  t,
} from "../src/renderer/scripts/i18n.js";

test("inglés es el idioma predeterminado y todos los mensajes tienen traducción", () => {
  setLocale("en");
  for (const translation of Object.values(messages)) {
    assert.equal(typeof translation.en, "string");
    assert.equal(typeof translation.es, "string");
    assert.ok(translation.en.length > 0);
    assert.ok(translation.es.length > 0);
  }
  assert.equal(t("library"), "Library");
});

test("cambia a español e interpola valores sin alterar el contenido", () => {
  setLocale("es");
  assert.equal(t("library"), "Biblioteca");
  assert.equal(t("app.logo", { name: "Clax" }), "Logo de Clax");
  setLocale("en");
});
