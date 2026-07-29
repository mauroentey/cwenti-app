# Publicación y firma

## Preparación

1. Publique un ZIP de Clax, Kaikei y Noman para cada plataforma.
2. Ejecute `npm ci`, `npm run verify`, `npm run test:smoke` y `npm run licenses`.
3. Compruebe que no existen secretos ni claves privadas.
4. Actualice la versión de `package.json` y cree el tag `vX.Y.Z`.
5. Construya cada sistema en su runner correspondiente.

Los ZIP no viven en Git. El workflow usa estas variables del repositorio:

- `CWENTI_CLAX_MAC_URL`, `CWENTI_KAIKEI_MAC_URL`, `CWENTI_NOMAN_MAC_URL`.
- `CWENTI_CLAX_WIN_URL`, `CWENTI_KAIKEI_WIN_URL`, `CWENTI_NOMAN_WIN_URL`.

Si los archivos están protegidos, `CWENTI_BUNDLE_TOKEN` debe permitir su
descarga. `npm run download:apps` valida que cada ZIP contenga la aplicación
correcta y `npm run stage:apps` prepara el recurso que se incluye en Cwenti.

## macOS

Configure certificado Developer ID, hardened runtime y notarización mediante:

- `CSC_LINK`
- `CSC_KEY_PASSWORD`
- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`

No publique un DMG sin verificar firma, notarización y Gatekeeper.

## Windows

Configure Authenticode mediante:

- `WIN_CSC_LINK`
- `WIN_CSC_KEY_PASSWORD`

Pruebe instalación, desinstalación, accesos directos y conservación de datos.

## Actualizaciones

`electron-builder` publica en GitHub Releases el instalador, su blockmap y los
manifiestos `latest*.yml`. La aplicación empaquetada consulta ese canal con
`electron-updater`, pero no descarga automáticamente: el usuario confirma la
descarga y la instalación desde Configuración.

Cada release vuelve a incluir Clax, Kaikei y Noman. Al reemplazar Cwenti se
reemplazan también las tres copias integradas, por lo que no hay versiones
sueltas.

El repositorio `mauroentey/cwenti-app` o, como mínimo, el servidor de
actualizaciones debe ser públicamente accesible. Una aplicación de usuario final
no puede descargar releases privadas sin distribuir credenciales.

El workflow `Publish Cwenti suite` también se puede iniciar manualmente con un
tag existente. Antes de anunciar una release, instale el artefacto en un equipo
limpio, abra las tres apps y pruebe la actualización desde la versión anterior.
