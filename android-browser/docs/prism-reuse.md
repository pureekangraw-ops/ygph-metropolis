# PRISM reuse in Observatory 0.3.0

Owner request: adapt PRISM phone UI, device location and sharing status to the existing Observatory Android app.

PRISM owner.29 attached release identifies source 831f8a82cb0a095b7c135ac85ca5ab9d7c087ef1. The ZIP contains a compiled APK and provenance, not source. Native code adaptation references the PRISM sources already present in this repository: theme.css Graphite/Lime tokens, ui/icons.mjs arrow-left/gear-six paths, and android-shell/native-local-map/RideMapActivity.java foreground provider flow. This is an adaptation, not a byte-for-byte copy of the attached APK.

- Browser primary actions fit the phone width; advanced station/relay/disconnect controls move into settings.
- Device location starts only after the owner taps the location button and grants Android foreground permission. Approximate location is accepted. All listeners stop and the marker clears on pause. Fixes older than 30 seconds, future fixes and invalid coordinates/accuracy are rejected. Mock locations are labelled. Device fixes are separate from durable owner-selected pins and are not sent as GPS evidence in the map station payload.
- LIVE means the station accepted a recent snapshot while the local surface is fresh. Opening Share is WAITING. Offline, stale, unpaired and background/stopped states are distinct. Delivery does not mean that GO or a business action succeeded.
- WebView, station contracts and command authority remain the current implementation. No GeckoView migration or PRISM signing identity transfer.
- Installer uses Observatory package com.big.gobrowser, version 0.3.0, development signing.

Validation: DOM/Lyra regression tests; JVM location-age/invalid-fix and sharing ACK/freshness tests; phone-layout and actual MapLibre location-layer instrumentation; existing rendering/journal/credential instrumentation. Real handset GPS precision and live owner pairing remain device acceptance.
