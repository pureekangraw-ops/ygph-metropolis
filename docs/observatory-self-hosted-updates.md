# Observatory self-hosted Android updates

This is the non-Play-Store release path. It does not use a customer license key and does not upload or deploy automatically.

## Release workflow

`.github/workflows/observatory-release-signed.yml` is a manual release workflow. It only runs on `main`, builds the release APK, signs it in the dedicated `observatory-release` GitHub Environment, verifies package/version/alignment/certificate, and emits a signed APK plus the exact `update-manifest.json` as a short-lived workflow artifact. Naming an environment in YAML does not enable its protection rules: configure required reviewers and protect `main` before adding secrets. The workflow does not publish a GitHub Release, upload to Cloudflare, or change the app's configured update URL.

The manifest URL must be the final direct HTTPS URL for the exact APK and must be on `github.com`, `raw.githubusercontent.com`, or `yggmetro.com` / a subdomain. Avoid redirects for a self-hosted yggmetro URL. The Android updater validates package identity, strictly newer version, SHA-256, signer certificate, and the source commit before handing the APK to Android's installer for owner consent.

## Secrets to configure later

Add these as **environment secrets** in the `observatory-release` GitHub Environment, not repository files, chat messages, app assets, or Cloudflare Worker secrets:

- `OBSERVATORY_SIGNING_KEYSTORE_B64`
- `OBSERVATORY_SIGNING_KEYSTORE_PASSWORD`
- `OBSERVATORY_SIGNING_KEY_ALIAS`
- `OBSERVATORY_SIGNING_KEY_PASSWORD`

Before enabling a signing run, require an environment reviewer, protect `main`, restrict release-workflow edits, keep the keystore backup offline, and ensure untrusted pull-request workflows cannot reach the environment. Cloudflare upload credentials, if later needed, must be a separate least-privilege secret and a separately reviewed publish step. Never print secret values in logs.

If the secrets are absent, the signing job stops before signing and reports only the missing secret name. The independent unsigned CI workflow remains available for build/test evidence; an unsigned artifact is not installable as an update to a signed app.

## Current state

The workflow is prepared but has not been run with signing material. No credentials have been created or changed, no release has been published, and no live update endpoint has been configured. Manual APK installation remains subject to Android's installer consent and the existing package-signature continuity requirement.
