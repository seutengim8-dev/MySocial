# MySocial 4.5 native push / calling integration

This release adds the server-side native-token registry and delivery adapters. The web app remains usable as before. The Android/iOS projects are intentionally not checked in as generated projects; create them from this project with the Capacitor CLI after installing dependencies.

## Create native projects

```bash
npm install
npx cap add android
npx cap add ios
npx cap sync
```

Application IDs are fixed to `com.seutengim.mysocial` on both platforms. Open Android Studio / Xcode to finish signing and build. A browser/PWA alone cannot display the OS-native Telecom/CallKit incoming-call screen.

## Server environment

Keep existing `VAPID_*`, database, session and Cloudinary settings. Add:

- `FIREBASE_SERVICE_ACCOUNT_BASE64`: base64 of the Firebase service-account JSON (server secret; never put it in the app or repository).
- `APNS_KEY_BASE64`: base64 of the Apple `.p8` APNs AuthKey file.
- `APNS_KEY_ID`: Apple key ID.
- `APNS_TEAM_ID`: Apple developer team ID.
- `APNS_PRODUCTION`: `true` for App Store/TestFlight builds; otherwise sandbox.
- `IOS_BUNDLE_ID`: `com.seutengim8.mysocial`.

The backend exposes authenticated `POST /api/native/register` and `POST /api/native/unregister`. Standard native push is sent to registered Android FCM / iOS APNs tokens. Incoming iOS calls use a separately registered PushKit VoIP token (`voipToken`); a normal APNs token is not a substitute. The API currently accepts that token but the PushKit native bridge must be wired in Xcode before iOS VoIP calls can arrive.

## Android completion

1. Create a Firebase project, add Android app ID `com.seutengim.mysocial`, download `google-services.json` into `android/app/` (do not commit secrets/config if your policy forbids it), and enable Cloud Messaging.
2. Apply the `native/android/AndroidManifest-additions.xml` entries to the generated manifest. In the root Gradle plugins block apply `com.google.gms.google-services` (matching the Firebase docs), then add `implementation("com.google.firebase:firebase-messaging:24.1.0")` to the app dependencies. Copy both Kotlin files in `native/android/app/src/main/java/...` into the matching package path.
3. Implement the full-screen activity and `ConnectionService` against the call signaling API before claiming Telecom integration is complete. The included service file is a registration/notification starter, not a complete Telecom connection implementation.
4. Android 13+ notification permission and Android 14+ full-screen intent restrictions must be handled in the native app. Full-screen intents are subject to OS/user policy.

## iOS completion

1. In Xcode enable Push Notifications, Background Modes (Voice over IP and Remote notifications), and the PushKit/CallKit capabilities required by your distribution profile.
2. Add the `native/ios/MySocialPushKitBridge.swift` implementation to the generated iOS target and connect it to the app lifecycle. Report each PushKit incoming call to CallKit immediately.
3. Register both the regular APNs token (for messages) and PushKit VoIP token (for calls) with `/api/native/register`. Use the authenticated app session to call this endpoint.
4. Set `APNS_PRODUCTION` to match the signed build environment. VoIP pushes must use the `.voip` topic and `apns-push-type: voip`; the backend sets these when a VoIP token is present.

## Important limitation

This archive provides the server delivery layer, Capacitor shell configuration, token registration, and native integration starters. It is **not yet a signed/installable Android or iOS app**, and it does **not** claim completed Android Telecom / iOS CallKit end-to-end calling. Those final steps require generated native projects, Firebase and Apple credentials, platform capabilities, and real-device testing. WebRTC signaling/media also still needs to be connected to the native accept/answer/end actions.
