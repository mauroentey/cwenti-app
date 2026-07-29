# Releases and signing

## Preparación

1. Publish the macOS and Windows ZIPs for Clax, Kaikei, and Noman.
2. Record each immutable release URL, exact byte size, and SHA-256 digest in
   `registry/suite-lock.json`.
3. Run `npm ci`, `npm run verify`, `npm run test:smoke`, and `npm run licenses`.
4. Confirm that no private keys or secrets are tracked.
5. Update `package.json` and create the matching `vX.Y.Z` tag.
6. Let each operating system build on its native GitHub Actions runner.

The ZIP payloads are not stored in Git. `npm run download:apps` accepts only the
three public, version-matched GitHub release URLs listed in the lock file,
enforces a 15-minute and 2 GiB limit, and verifies both size and SHA-256 before
extracting anything. `npm run stage:apps` then prepares the verified Electron
bundles included in Cwenti.

## macOS

Configure Developer ID signing, hardened runtime, and notarization with:

- `CSC_LINK`
- `CSC_KEY_PASSWORD`
- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`

Do not announce a DMG as trusted until signing, notarization, and Gatekeeper
verification pass.

## Windows

Configure Authenticode with:

- `WIN_CSC_LINK`
- `WIN_CSC_KEY_PASSWORD`

Test install, uninstall, shortcuts, and user-data preservation.

## Actualizaciones

`electron-builder` generates each installer, blockmap, and `latest*.yml`
manifest. The workflow publishes them to GitHub Releases only after both native
package jobs and the embedded-suite checks pass. The packaged application
checks that channel with `electron-updater`, but does not download
automatically: the user confirms the download and installation from Settings.

Every release includes Clax, Kaikei, and Noman again. Replacing Cwenti replaces
all three integrated copies, so the installed suite cannot drift across app
versions.

The `mauroentey/cwenti-app` repository and update releases must stay publicly
accessible. A user-facing app cannot safely consume private releases without
distributing credentials.

The `Publish Cwenti suite` workflow can also be started manually for an existing
tag. Before announcing a release, install it on a clean machine, open all three
apps, and test an update from the previous Cwenti version.
