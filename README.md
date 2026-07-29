# Cwenti

Launcher de escritorio para macOS y Windows que incluye Clax, Kaikei y Noman.
Cwenti instala la suite completa, abre cada aplicación desde Biblioteca y
mantiene las tres al día con una sola actualización.

El producto es **source-available**: el código fuente está disponible, pero no debe describirse como “open source”.

## Estado

El MVP incluye:

- Electron con renderer en HTML semántico, CSS y JavaScript puro.
- Primera configuración para uso personal, prueba comercial o licencia offline.
- Biblioteca con Clax, Kaikei y Noman incluidos dentro de la aplicación.
- Instalación atómica, rollback, checksum SHA-256 y preparación para firmas Ed25519.
- App Server local por `stdio`, autenticación ChatGPT administrada por Codex y eventos normalizados.
- Workspaces explícitos, separación por aplicación y bridge IPC limitado.
- Aprobaciones puntuales, registro local, exportación y diagnóstico.
- Empaquetado macOS/Windows y CI.

Las capturas definitivas deben agregarse en `docs/assets/` antes del lanzamiento público.

## Requisitos

- Node.js 22 o posterior.
- npm 10 o posterior.
- macOS o Windows.
- Una instalación local compatible de Codex o ChatGPT.
- Codex recomendado y probado: `codex-cli 0.146.0-alpha.3.1`.

## Desarrollo

```bash
npm install
npm run dev
```

Verificación:

```bash
npm run lint
npm test
npm run validate:registry
npm run test:smoke
```

El renderer no lee variables de entorno. Copie `.env.example` únicamente para configurar el proceso principal o el empaquetado.

En desarrollo, `LAUNCHER_SIMULATE_UPDATE=1 npm run dev` habilita el flujo de actualización simulada sin publicar ni descargar una release.

## Uso

1. Inicie el launcher.
2. Seleccione uso personal/no comercial, prueba comercial o importe una licencia.
3. Inicie sesión con ChatGPT. El navegador abre la URL que entrega Codex; el launcher no intercepta ni guarda tokens.
4. Abra Biblioteca. Clax, Kaikei y Noman ya están disponibles.
5. Pulse “Abrir” para iniciar la aplicación elegida.

## Integración de Codex App Server

El launcher detecta `codex`, consulta su versión e inicia:

```text
codex app-server --listen stdio://
```

La conexión usa JSONL por stdin/stdout. `stderr` se drena y solo se registra como diagnóstico sin contenido. El flujo confirmado es `initialize` → `initialized`; después se utilizan `account/read`, `account/login/start`, `thread/start`, `thread/resume`, `turn/start` y `turn/interrupt`.

No hay servidor HTTP local ni puerto público. El launcher no guarda credenciales de OpenAI. Consulte [docs/CODEX_INTEGRATION.md](docs/CODEX_INTEGRATION.md).

## Formato de aplicaciones

Cada aplicación contiene `app.manifest.json`, licencia, instrucciones, UI y activos. Los manifiestos se validan contra `registry/app-manifest.schema.json`. No se permiten entradas remotas, path traversal, symlinks de paquete ni ejecutables no declarados.

Consulte [docs/APP_FORMAT.md](docs/APP_FORMAT.md).

## Agregar una aplicación oficial

1. Cree el paquete sin modificar todavía su identidad visual ni lógica de dominio.
2. Compile su renderer existente a HTML/CSS/JS estático dentro de `ui/`.
3. Reemplace su acceso directo a Electron/Node por métodos específicos de `window.officialApp`.
4. Escriba instrucciones propias en `instructions/AGENTS.md`.
5. Complete metadatos y permisos confirmados; `adaptLegacyManifest()` no inventa campos.
6. Valide el paquete.
7. Genere el ZIP, SHA-256 y firma de paquete fuera del repositorio público.
8. Agregue o actualice únicamente un ID ya autorizado en el registro cerrado.

La guía para Clax, Noman/Nomen y Kaikei está en [docs/MIGRATING_EXISTING_APPS.md](docs/MIGRATING_EXISTING_APPS.md).

## Actualizar el registro

`registry/bundled-apps.json` es la lista autorizada incluida. El registro remoto opcional solo puede actualizar IDs que ya existen en esa lista. Cada paquete remoto requiere URL HTTPS, tamaño, SHA-256 y firma.

```bash
npm run validate:registry
```

No existe publicación por terceros ni una API de marketplace.

## Permisos

Cada manifiesto declara archivos, shell, red y enlaces externos. Antes del primer inicio se presenta alcance y justificación. Los comandos, cambios de archivos y permisos adicionales usan solicitudes reales de App Server con estas decisiones:

- Permitir una vez.
- Permitir durante esta sesión.
- Rechazar.

Nunca se expone una opción permanente para permitir todo el sistema. El botón Detener tarea llama `turn/interrupt`.

## Licenciamiento

> **Este proyecto utiliza la Prosperity Public License 3.0.0. El uso personal y no comercial es gratuito. El uso comercial está permitido únicamente durante un periodo de prueba de 30 días. Para continuar usándolo comercialmente, contacte a [mauro@entey.net](mailto:mauro@entey.net).**

El código fuente está disponible públicamente. Prosperity 3.0.0 permite uso personal y no comercial gratuito y una prueba comercial de 30 días. La prueba es una sola para toda la organización, no una por empleado. Después, la empresa debe dejar de usar el software o adquirir una licencia comercial independiente.

Las excepciones para organizaciones no comerciales son exactamente las indicadas por Prosperity 3.0.0: organizaciones caritativas, instituciones educativas, organizaciones públicas de investigación, organizaciones de seguridad o salud pública, organizaciones de protección ambiental e instituciones gubernamentales, sin importar la fuente u obligaciones de financiación.

La publicación del código no concede derechos sobre marcas, nombres, logos, ilustraciones ni identidad visual. Las dependencias de terceros conservan sus licencias.

Consulte [LICENSE](LICENSE), [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md), [TRADEMARKS.md](TRADEMARKS.md), [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) y [docs/LICENSING.md](docs/LICENSING.md).

## Compilar para Windows

```bash
npm run dist:win
npm run dist:win:portable
```

Produce NSIS x64 y, opcionalmente, portable. La configuración deja preparada la firma Authenticode mediante `WIN_CSC_LINK` y `WIN_CSC_KEY_PASSWORD`. Compile Windows en Windows.

Antes de empaquetar, Cwenti busca los builds en `release/win-unpacked` de cada
proyecto. También puede indicar las rutas con `CWENTI_CLAX_APP`,
`CWENTI_KAIKEI_APP` y `CWENTI_NOMAN_APP`.

## Compilar para macOS

```bash
npm run dist:mac
npm run dist:mac:x64
npm run dist:mac:arm64
```

Produce DMG y ZIP. El build universal requiere herramientas y dependencias disponibles para ambas arquitecturas.

El comando predeterminado produce Apple Silicon e incluye las tres `.app`. Las
rutas se pueden indicar con las mismas variables `CWENTI_*_APP`.

## Firma y notarización

No desactive Gatekeeper. Para distribución pública configure certificados mediante secrets, active hardened runtime y proporcione:

- `CSC_LINK` y `CSC_KEY_PASSWORD`.
- `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` y `APPLE_TEAM_ID`.
- `WIN_CSC_LINK` y `WIN_CSC_KEY_PASSWORD`.

El CI nunca imprime estos valores. Consulte [docs/RELEASING.md](docs/RELEASING.md).

## Seguridad

Las ventanas tienen `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true` y `webSecurity: true`. CSP bloquea código remoto. El preload no expone `require`, `process`, `fs`, `child_process` ni `ipcRenderer`. Todas las rutas y mensajes IPC se validan.

Consulte [docs/SECURITY.md](docs/SECURITY.md).

## Privacidad

El comportamiento predeterminado es local y sin telemetría del launcher. Configuración, licencias, permisos, historial y logs permanecen bajo `app.getPath("userData")`. Cada aplicación usa su propia subcarpeta.

“Local” no significa que Codex funcione completamente offline. Al ejecutar una tarea, Codex puede enviar a OpenAI la solicitud y el contexto autorizado necesario. El creador del launcher no recibe archivos, rutas ni contenido mediante telemetría propia.

La pantalla Privacidad permite entender almacenamiento, exportación y revocación.

## Solución de problemas

- **Codex no disponible:** instale o actualice ChatGPT/Codex y compruebe `codex --version`.
- **Sesión ausente:** pulse “Iniciar sesión con ChatGPT” y complete el flujo oficial en el navegador.
- **App no abre:** seleccione una modalidad de licencia vigente, instálela y acepte permisos.
- **Checksum inválido:** no fuerce la instalación; regenere registro y paquete desde una fuente confiable.
- **Workspace perdido:** vuelva a seleccionarlo; no se borran archivos.
- **Empaquetado falla:** ejecute primero `npm run verify` y use el runner del sistema destino.

## Limitaciones conocidas

- Cada app conserva temporalmente su proceso de Codex App Server hasta completar la migración al proceso central.
- Las claves públicas de licencia y paquetes son variables de publicación pendientes.
- No se implementa marketplace ni publicación por terceros.
- La utilidad de desarrollo genera claves locales, pero la emisión comercial requiere infraestructura privada y revisión jurídica.
- Los renderers React/TypeScript existentes pueden conservarse como código fuente, pero su salida empaquetada debe consumir el bridge limitado del launcher.
