# METRO File Intake Compatibility

## Core rule: Picker open — Runtime strict

METRO treats the operating-system file picker as a transport/UX boundary, not as a security boundary.

- **Picker open:** a picker hint such as an extension or MIME type may be used when it improves ordinary file selection and does not hide otherwise valid files. If Android or another system picker can block a valid custom-extension file before the app sees it, the picker must be broadened or left without `accept`.
- **Runtime strict:** after selection, the application must validate the file itself before it is trusted or applied.
- A filename extension or OS-reported **MIME is not security proof**. It is only a UX hint.
- **File content must be validated in-app** according to the intake contract that owns that file type.

The compatibility rule does not authorize weakening parsers, cryptographic verification, schema checks, version gates, readback checks, or importer business logic.

## Current intake inventory

| Intake surface | Location | Intended file | Picker hint | In-app validation | Compatibility decision |
| --- | --- | --- | --- | --- | --- |
| LIGHTHOUSE Patch | `android-shell/www/index.html` + `android-shell/www/patch/patch-runtime.mjs` | `.lhpatch` signed patch bundle | **No `accept`** | `parseSelectedPatchFile()` requires `.lhpatch`, then JSON parse; `verifyPatchBundle()` enforces `lighthouse.patch.v1`, 2 MiB limit, supported paths, SHA-256, ECDSA P-256/SHA-256 signature, pinned key/key id, base/current version and increasing target version | **Broad picker required.** Android may classify a custom `.lhpatch` as BIN/unknown and hide it when the picker is restricted. Runtime remains the security gate. |
| Advanced Recovery — Evidence | `index.html` + `ui/app.mjs` | Evidence JSON | `application/json,.json` | JSON parse, then `initializeFromEvidence(...)` validates the expected package/revision and runtime import contract | Keep JSON UX hint. No current evidence that the OS blocks valid JSON. |
| Advanced Recovery — Backup | `index.html` + `ui/app.mjs` | METRO backup JSON | `application/json,.json` | JSON parse, then runtime restore path validates the backup before state is accepted | Keep JSON UX hint. No current evidence that the OS blocks valid JSON. |
| Direct Recovery — Backup | dynamic recovery UI in `app.mjs` | METRO backup JSON | `application/json,.json` | `selectedBackup()` parses JSON; `prepareBackupForRestore(...)` and `openGreenfieldRuntimeFromBackup(...)` perform restore validation; overwrite requires explicit user confirmation | Keep JSON UX hint. No current evidence that the OS blocks valid JSON. |
| Settings — One Import Door | `ui/obligation-import-ui.mjs` | METRO-supported JSON: backup, finance seed, or obligation import | `application/json,.json` | JSON parse, `detectMetroImport(...)`, `validateForKind(...)`, then the existing kind-specific parser/verifier and readback checks; backup path also uses `verifyPortableGreenfieldBackup(...)` | Keep JSON UX hint. The app decides file kind from validated content, not from MIME. |

## Current change decision

Only the LIGHTHOUSE `.lhpatch` intake currently needs picker broadening. It uses a custom extension and has demonstrated Android compatibility risk when a restrictive picker hint is present.

The JSON intake doors remain unchanged because:

1. their intended transport format is ordinary JSON;
2. their current `accept="application/json,.json"` values are UX hints rather than trust decisions; and
3. each path validates content again inside METRO before mutation or restore.

Do not broaden every file input pre-emptively. Change a picker only when the OS-level hint is blocking a file that the owning runtime contract is designed to validate.

## Future intake rule

For every new or modified file intake:

1. Record the intended file shape and owning runtime/parser.
2. Treat extension and MIME as discoverability hints only.
3. If a custom extension or MIME mapping can cause Android or another picker to hide a valid file, use a broad picker (`*/*`) or omit `accept`.
4. After selection, validate the actual file content in-app before any mutation, activation, restore, or import.
5. Keep schema, size, hash/signature/key/version checks and readback gates at their existing strictness unless their owning contract is explicitly changed in a separate authorized task.
6. Do not change importer data formats or business logic merely to work around picker compatibility.

## Shared-helper decision

No shared file-intake helper is introduced by this work. At present only one custom-extension intake requires the Android compatibility behavior. A shared helper becomes appropriate only if multiple intake surfaces later need the same picker/runtime boundary and a real duplication pattern exists.

## Boundaries

This policy does not authorize merge, deploy, GPS/maps work, native permission changes, PR #84 behavior changes, importer data-format changes, or importer business-logic changes.
