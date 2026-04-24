# ios/ AGENTS.md

## 0) Purpose
- This folder is for iOS planning and native-wrapper work only.
- Treat the React app in `src/` as the source of truth for shared product logic.
- Do not rewrite workout logic here unless a native iOS requirement truly needs it.

## 1) iOS Scope
- Capacitor iOS shell, Xcode project settings, Info.plist, entitlements, signing, and App Store packaging.
- iOS-specific lifecycle, audio, permissions, safe-area, and webview behavior.
- Platform-only polish that cannot live in shared React code.

## 2) Rules
- Keep changes small and explicit.
- Prefer shared fixes in the web app over iOS-only forks.
- Any native iOS change should preserve the same timer behavior, session flow, and audio semantics as the web app.
- If a change affects shared behavior, note the implication for `src/` and tests.

## 3) Planning Workflow
1. Document the iOS problem or target behavior first.
2. Identify whether it belongs in shared web code, Capacitor config, or native iOS code.
3. Only then create implementation tasks.
4. Keep iOS-specific work isolated from Android work unless the same native issue exists on both.

## 4) Common iOS Risks
- Audio unlock and speech synthesis in WebViews.
- App pause/resume and background suspension.
- Safe-area and notch handling.
- Keyboard, orientation, and viewport chrome changes.
- App Store signing and build configuration.

