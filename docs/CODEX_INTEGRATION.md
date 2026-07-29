# Integración de Codex App Server

## Contrato probado

- Codex CLI: `0.146.0-alpha.3.1`.
- Transporte: JSONL por `stdio`.
- Esquemas inspeccionados con `codex app-server generate-json-schema --experimental`.
- Documentación oficial: Codex App Server.

El launcher no abre un puerto, no expone App Server a la LAN y no persiste tokens.

## Inicialización

1. Descubre una instalación conocida de Codex/ChatGPT o el comando `codex`.
2. Ejecuta `codex --version`.
3. Inicia `codex app-server --listen stdio://`.
4. Envía `initialize` con metadatos del cliente.
5. Envía la notificación `initialized`.

Solo `protocol-adapter.js` contiene nombres y formas del protocolo.

## Autenticación central

`account/read` obtiene el estado. `account/login/start` usa `type: "chatgpt"` y devuelve una URL HTTPS de OpenAI/ChatGPT que se abre en el navegador. Codex posee el callback, persistencia y renovación de la sesión. El launcher no ve el token.

## Threads y separación

Cada app guarda su lista en:

```text
userData/apps-data/<appId>/threads.json
```

Un thread se registra con propietario y workspace. Toda reanudación, turno o interrupción verifica esa propiedad.

## Eventos

`event-normalizer.js` traduce notificaciones conocidas a eventos internos como:

- `thread.started`
- `turn.started`, `turn.completed`
- `message.delta`
- `terminal.delta`
- `diff.updated`
- `approval.resolved`
- `server.error`

Los métodos desconocidos se convierten en `protocol.unknown` y no cierran el launcher.

## Aprobaciones

Se manejan las solicitudes reales:

- `item/commandExecution/requestApproval`
- `item/fileChange/requestApproval`
- `item/permissions/requestApproval`

Las respuestas usan `accept`, `acceptForSession` o `decline`, y los permisos adicionales devuelven como máximo el subconjunto solicitado.

## Compatibilidad futura

Al actualizar Codex:

1. Genere esquemas nuevos.
2. Compare solicitudes, respuestas y notificaciones.
3. Actualice únicamente `protocol-adapter.js` y normalizadores.
4. Ejecute pruebas de eventos desconocidos y una prueba real de inicio/turno/aprobación.
5. Actualice la versión probada en `config/product.config.js` y este documento.
