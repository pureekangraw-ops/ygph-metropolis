# LIGHTHOUSE Intellectual Property Notice

Copyright © 2026 pureekangraw-ops. All rights reserved.

LIGHTHOUSE, including its source code, application design, documentation, build artifacts, release metadata, and associated project materials, is proprietary project software unless a separate written license expressly states otherwise.

Public visibility of source code or build artifacts does not by itself grant permission to copy, redistribute, rebrand, sublicense, sell, or claim authorship or ownership of LIGHTHOUSE.

## Canonical Android identity

The owner-authenticated Android application identity is anchored to both the package identity and the Android digital signature:

- Application ID: `com.yggdrasil.lighthouse`
- Canonical signing certificate SHA-256: `aae608a7ddab0dbfccc1d35e817c5683b3c64b90ab581a4b74867db54e0351ce`
- Signing key label: `lighthouse-apk-release`

An APK is considered owner-authenticated only when its Android digital signature validates to the canonical signing certificate and the release verification gates confirm the expected package and version identity.

## Build provenance

Owner builds produce provenance evidence that binds the final signed APK SHA-256 to its canonical signer fingerprint, source repository/ref/commit, workflow run, build time, and the SHA-256 of this notice. This evidence is intended to make the technical origin and continuity of a LIGHTHOUSE build independently auditable.

The signing private key, keystore bytes, passwords, and recovery secrets must never be stored in this repository or embedded in provenance evidence.

This notice is an ownership and provenance record; it does not replace any registration, contract, or other protection available under applicable law.
