# Formato de aplicaciones oficiales

## Estructura mínima

```text
my-app/
├── app.manifest.json
├── LICENSE
├── README.md
├── instructions/
│   └── AGENTS.md
├── ui/
│   ├── index.html
│   ├── app.css
│   └── app.js
└── assets/
    ├── icon.png
    └── preview.webp
```

Una aplicación puede compilar su renderer con otras herramientas, siempre que el paquete final contenga archivos locales HTML/CSS/JS y no cargue código remoto.

## Manifiesto

Use `examples/example-app/app.manifest.json` como referencia. Todos los campos descriptivos, permisos y justificaciones deben ser confirmados por el equipo del producto.

El adaptador `src/main/manifest-adapter.js` convierte metadatos explícitos de una app existente, pero falla si falta información. No adivina funciones ni permisos.

## Bridge disponible

`window.officialApp` expone únicamente:

- `getContext()`
- `chooseWorkspace()` y `revokeWorkspace()`
- `startThread()`, `resumeThread()`, `listThreads()`
- `startTurn()` e `interruptTurn()`
- `readTextFile()` y `writeTextFile()` con rutas relativas al workspace
- `respondToApproval()`
- `openExternal()` con confirmación
- `backToLauncher()`
- eventos `onActivity()` y `onApproval()`

No hay acceso directo a Node, Electron o IPC.

## Validación e instalación

El launcher:

1. Exige un ID oficial único.
2. Verifica tamaño, SHA-256 y firma del ZIP remoto.
3. Extrae en un temporal.
4. Rechaza rutas remotas, traversal, symlinks y ejecutables no declarados.
5. Valida plataforma y versión mínima.
6. Mueve la instalación de forma atómica.
7. Conserva hasta dos versiones para rollback.
8. No ejecuta código durante la instalación.

El modo `LAUNCHER_DEV_MODE=1` habilita instalación desde carpeta. Nunca se activa por defecto.
