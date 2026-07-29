# Licenciamiento

El launcher usa un modelo dual:

1. Prosperity Public License 3.0.0 para uso personal y no comercial, con una prueba comercial de 30 días.
2. Contrato comercial independiente para continuar usos comerciales.

`COMMERCIAL-LICENSE.md` es un aviso, no concede derechos. Antes de publicar, un abogado debe revisar todo el paquete jurídico.

## Prueba local

Guarda organización normalizada, correo, país, inicio UTC, fin UTC, versión y UUID local. El fin se calcula sumando 30 días calendario en UTC.

Al vencer:

- se bloquea iniciar ejecución comercial;
- se conserva toda la información;
- continúan funcionando Licencia, exportación y diagnóstico;
- se puede importar una licencia.

## Licencias offline

La firma Ed25519 cubre la representación JSON canónica de todos los campos salvo `signature`. La clave pública se distribuye con la app. La clave privada nunca debe estar en el repositorio ni en el instalador.

La utilidad `scripts/create-development-license.js` está excluida del paquete y genera material local ignorado por Git. No debe usarse como emisor comercial.

## Pendiente antes de distribución

- Sustituir `[CLAVE_PUBLICA_ED25519]`.
- Proteger la clave privada en un sistema de emisión separado.
- Definir revocación/renovación contractual.
- Completar titular, repositorio, email y sitio.
- Obtener revisión jurídica.
