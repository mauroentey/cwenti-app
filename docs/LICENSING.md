# Licensing

Cwenti uses a dual licensing model:

1. The Prosperity Public License 3.0.0 covers personal and noncommercial use and
   provides a single 30-day commercial trial per organization.
2. A separate commercial agreement is required for continued commercial use.

`COMMERCIAL-LICENSE.md` is an informational notice and does not grant commercial
rights by itself. The public license, commercial notice, and final contract
should be reviewed by qualified counsel before paid distribution.

## Local commercial trial

The launcher stores the normalized organization, email, country, UTC start and
end timestamps, launcher version, and a local UUID. The end date is exactly 30
calendar days after the start date in UTC.

When the trial expires:

- commercial app execution is blocked;
- user data remains available;
- licensing, export, and diagnostics remain accessible;
- a commercial license can still be imported.

## Offline commercial licenses

Commercial license files are JSON documents signed with Ed25519. The signature
covers the canonical JSON representation of every license field except
`signature`. Cwenti rejects unknown fields, invalid dates, unsupported products,
missing commercial-use authorization, altered payloads, and signatures from a
different key.

The production license public key is embedded in the application. Its SHA-256
fingerprint is:

```text
12f9980ad1bc43b70aefdeeb40362191e49bd0ffefad25423bde149d1ac6b504
```

Official app packages use a separate Ed25519 key. Its public-key fingerprint is:

```text
a3515f5ae8bd13ebdec13faf9e60bfb0e5f1155b003f0be2251331c935b88f54
```

The corresponding private keys must remain outside Git, installers, build
artifacts, logs, and support exports. Back them up in an encrypted secret store
before issuing production licenses. Losing a private key prevents issuing
compatible new signatures; exposing one requires a key rotation and app update.

The development utility at `scripts/create-development-license.js` creates
separate local test keys under a Git-ignored directory. It must not be used as a
production license issuer.

## Verified repository coverage

- `LICENSE` contains the Prosperity Public License 3.0.0 with the contributor and
  source-code fields completed.
- `package.json` and `package-lock.json` use the `Prosperity-3.0.0` identifier.
- Electron packaging includes the public, commercial, trademark, and third-party
  notices.
- Automated tests validate the metadata and both production public keys.
- Third-party notices exclude Cwenti itself and list only dependencies.

## Remaining operational work

- Keep production private keys in a managed encrypted backup.
- Run commercial issuance from a separate, access-controlled system.
- Define contract-specific renewal and revocation procedures.
- Obtain legal review for paid distribution and US-facing terms.

---

## Español

Cwenti utiliza Prosperity Public License 3.0.0 para uso personal y no comercial,
con una única prueba comercial de 30 días por organización. Para continuar un
uso comercial se requiere un contrato independiente.

Las licencias comerciales offline se verifican con Ed25519. Las claves públicas
están incluidas en la aplicación; las claves privadas permanecen fuera de Git y
del instalador. Deben conservarse en un respaldo cifrado y utilizarse únicamente
desde un sistema de emisión separado y con acceso controlado.
