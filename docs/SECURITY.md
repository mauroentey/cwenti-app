# Modelo de seguridad

## Límites

- El renderer no tiene Node.
- El preload expone métodos específicos.
- El proceso principal valida remitente, forma, tamaño, URL y ruta.
- App Server usa stdio local.
- Cada app usa una partición Electron aislada y su propia carpeta de datos.

## Rutas

Las APIs aceptan rutas relativas. Se resuelven contra el workspace real, rechazan `..`, rutas absolutas y separadores inesperados, y verifican la ruta real del archivo o del padre para impedir escapes mediante symlink.

Los paquetes no pueden contener symlinks. Una desinstalación solo elimina el paquete instalado; no toca `apps-data` ni el workspace.

## Ventanas

- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`
- `webSecurity: true`
- CSP sin scripts ni conexiones remotas
- nuevas ventanas bloqueadas
- navegación arbitraria bloqueada
- permisos web denegados

## Descargas

Las URLs deben ser HTTPS, hay timeout y límite de bytes, SHA-256 obligatorio y firma Ed25519 para paquetes remotos. La extracción y validación ocurren antes del reemplazo atómico.

## Logs

Los logs rotan a 2 MB y se eliminan después de 14 días. Los patrones de tokens, API keys y autorizaciones se redactan. No se registra contenido completo de proyectos.

## Amenazas no resueltas por diseño

El control de licencia local es asistencia de cumplimiento, no DRM invulnerable. Un dispositivo completamente comprometido está fuera del límite de confianza. Los contratos legales, la firma de distribución, protección de claves privadas y respuesta a incidentes requieren procesos organizacionales externos.
