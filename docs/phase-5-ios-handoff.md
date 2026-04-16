# Phase 5 iOS Handoff

## Current State
- Phase 5 is executing Android-first on Windows.
- The shared app now uses the native callback scheme `com.generalmalit.myoreptimer://auth/callback` for both warm app-open events and cold-start launch URLs.
- Android has completed the Windows-side shell pass: `npx cap sync android` and `.\gradlew.bat assembleDebug` succeed against the current shared bundle.
- The repository still does not yet contain a generated iOS Capacitor/Xcode project. The current `ios/` directory is scaffold/plugin output only, not a buildable Xcode shell.
- `npm run cap:doctor` reports Android healthy and iOS blocked only because Xcode is not installed on this machine.

## Goal For The Next macOS Pass
- Generate the real `ios/` Capacitor shell.
- Mirror the Android callback strategy on iOS.
- Keep the iOS wrapper thin and leave timer/session logic in `src/`.

## Required iOS Work
1. Generate or sync the iOS project from the repo root:
   - `npm run build:mobile`
   - `npx cap add ios` if the shell still does not exist
   - `npm run cap:sync`
2. Open the Xcode project/workspace and confirm the app identity stays:
   - bundle id: `com.generalmalit.myoreptimer`
   - app name: `MyoRep Timer`
3. Add URL type support for the custom scheme:
   - scheme: `com.generalmalit.myoreptimer`
   - expected callback: `com.generalmalit.myoreptimer://auth/callback`
4. Confirm Capacitor `App` URL-open events reach the shared React listener added in `src/`.
5. Confirm the cold-start path also reaches the same shared bootstrap flow when the app is launched from a magic link.
6. Validate that tapping a Supabase magic link returns into the installed app and completes session bootstrap.

## Likely Native Files To Touch
- `ios/App/App/Info.plist`
  - add URL types for `com.generalmalit.myoreptimer`
  - verify display name / bundle metadata
- `ios/App/App/AppDelegate.swift`
  - only if the generated Capacitor shell needs explicit URL-open forwarding beyond the default setup
- `ios/App/Podfile`
  - created by Capacitor/Xcode generation; this is also the missing file that currently blocks full `cap sync` on Windows
- `ios/App/App.xcodeproj/project.pbxproj`
  - generated with the real Capacitor shell; required before Info.plist and signing changes can be validated in Xcode
- Xcode project settings under `ios/App/App.xcodeproj` or `ios/App/App.xcworkspace`
  - signing/team
  - bundle id confirmation
  - deployment target if needed

## Supabase Allowlist Expectations
- Keep the existing web redirect URL for browser builds.
- Add the native callback URL to both dev and prod Supabase redirect allowlists:
  - `com.generalmalit.myoreptimer://auth/callback`

## Validation Checklist
- App installs and launches in iOS simulator or on device.
- Magic-link tap returns to the installed app instead of staying browser-only.
- Cold-start magic-link launches are handled by the shared bootstrap flow, not only warm `appUrlOpen` callbacks.
- Signed-in session appears through the existing shared bootstrap flow.
- No duplicate app instance opens during callback handling.
- Timer/setup/session builder still behave the same after auth return.

## Explicit Deferral
- This handoff does not include App Store signing, store metadata, billing, or native audio/plugin migration.
- Any iOS WebView-specific audio/TTS quirks discovered during this pass belong to Phase 7 validation unless a shell-level fix is clearly required.
