# Migración de las tres aplicaciones existentes

Durante la preparación se inspeccionaron estos proyectos:

| ID temporal | Proyecto observado | Ubicación | Renderer actual |
| --- | --- | --- | --- |
| `clax` | Clax | `/Users/mauricio/Documents/Build` | React + TypeScript + electron-vite |
| `noman` | Noman | `/Users/mauricio/Documents/noman` | React + TypeScript + electron-vite |
| `kaikei` | Kaikei | `/Users/mauricio/Documents/Kaikei` | React + TypeScript + Vite |

Los IDs son deliberadamente temporales. No se asignaron descripciones ni permisos de producto definitivos.

## Flujo común

1. Cree una rama de migración en el repositorio de la app.
2. Inventaríe todas las llamadas de su preload/IPC actual.
3. Clasifique cada llamada: interfaz local, archivos, Codex, proyecto, diálogo o capacidad propia.
4. Sustituya archivos/Codex/proyecto/diálogo por `window.officialApp`.
5. Mantenga en un módulo de dominio separado las capacidades que el bridge genérico todavía no cubre.
6. Compile el renderer y copie su salida autocontenida a `ui/`.
7. Cree `instructions/AGENTS.md` específico.
8. Complete un manifiesto con datos y justificaciones aprobados.
9. Pruebe CSP, teclado, modo oscuro, permisos y Detener tarea.
10. Empaquete, calcule SHA-256, firme y actualice el ID temporal en el registro.

## Clax → `clax`

1. Use `dist/renderer/` como punto de partida del paquete UI.
2. Sustituya el contrato `window.clax` por un adaptador renderer que consuma `window.officialApp`.
3. Mueva la autenticación de `src/main/codex/` al estado central del launcher.
4. Decida qué almacén cifrado y operaciones de curso siguen siendo servicio propio; no los fuerce a través del bridge de texto.
5. Mantenga proyectos/cursos en su formato actual y registre solo referencias bajo `apps-data/clax`.
6. Confirme permisos de PDF, exportación, imágenes, shell y red antes de completar el manifiesto.

## Noman → `noman`

1. Confirme primero el nombre público: el paquete y código inspeccionado dicen “Noman”.
2. Compile `out/renderer/` y adapte sus contratos de preload.
3. Retire el segundo proceso App Server de `src/main/services/codex-app-server.ts`; use threads propiedad de `noman`.
4. WhatsApp, FFmpeg y Chromium/Puppeteer son capacidades propias y ejecutables/dependencias especiales: declárelos, aíslelos y sométalos a revisión antes de empaquetar.
5. Defina explícitamente red, enlaces externos, audio y archivos; el launcher no debe concederlos implícitamente.
6. Verifique que la sesión de WhatsApp no se mezcle con la sesión de Codex ni con datos de otras apps.

## Kaikei → `kaikei`

1. Compile `dist/` y adapte el preload actual al bridge.
2. Retire el cliente duplicado `electron/codex-client.mjs`; use el App Server central y threads de `kaikei`.
3. Mantenga ExcelJS, PapaParse y PDF.js en la capa propia de Kaikei o exponga operaciones específicas; no convierta el bridge en acceso arbitrario a archivos.
4. Restrinja archivos contables al workspace seleccionado.
5. Confirme reglas de exportación, formatos bancarios, red y comandos antes del manifiesto.
6. Pruebe con copias de datos anonimizadas y valide que los logs no guarden movimientos ni identificadores sensibles.

## Criterio de finalización por app

- La interfaz original abre dentro de su ventana aislada.
- No depende de su propio login Codex.
- No inicia un segundo App Server.
- No accede a Node desde renderer.
- Toda ruta está bajo el workspace.
- Los threads e historial pertenecen solo al ID de la app.
- Los permisos declarados corresponden a comportamiento real.
- Instalar, actualizar, rollback y desinstalar pasan pruebas sin borrar proyectos.
