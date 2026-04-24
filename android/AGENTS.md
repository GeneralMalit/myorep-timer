# android/ AGENTS.md

## 0) Purpose
- This folder is for Android planning and native-wrapper work only.
- Treat the React app in `src/` as the source of truth for shared product logic.
- Do not rewrite workout logic here unless an Android requirement truly needs it.

## 1) Android Scope
- Capacitor Android shell, Gradle project settings, manifest changes, signing, and Play Store packaging.
- Android-specific lifecycle, permissions, safe-area, and webview behavior.
- Platform-only polish that cannot live in shared React code.

## 2) Rules
- Keep changes small and explicit.
- Prefer shared fixes in the web app over Android-only forks.
- Any native Android change should preserve the same timer behavior, session flow, and audio semantics as the web app.
- If a change affects shared behavior, note the implication for `src/` and tests.

## 3) Planning Workflow
1. Document the Android problem or target behavior first.
2. Identify whether it belongs in shared web code, Capacitor config, or native Android code.
3. Only then create implementation tasks.
4. Keep Android-specific work isolated from iOS work unless the same native issue exists on both.

## 4) Common Android Risks
- WebView audio timing and user-gesture requirements.
- App pause/resume and background suspension.
- Status bar, gesture nav, and safe-area handling.
- Orientation and small-screen layout issues.
- Gradle, signing, and Play Console build configuration.


