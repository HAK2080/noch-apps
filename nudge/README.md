# Nudge (com.personal.nudge)

Local-first Android AI assistant focused on fast task capture, notification-to-task suggestions, and reliable reminders.

## Setup
1. Open in Android Studio Iguana+.
2. Build APK: `./gradlew assembleDebug`.
3. Install: `adb install -r app/build/outputs/apk/debug/app-debug.apk`.

## API Key
In app Settings table (`settings.openAiApiKey`) via future Settings screen; for now initialize in DB using Android Studio Database Inspector.

## Permissions & Reliability
- Notification access: Android Settings → Notification Access → enable Nudge.
- Exact alarms: Settings → Special app access → Alarms & reminders → allow.
- Disable battery optimization: Settings → Battery → Unrestricted for Nudge.
- Notifications: grant POST_NOTIFICATIONS on first launch.

## Architecture
- MVVM + Repository-ready Room entities/DAO.
- NotificationListenerService deduplicates incoming notifications.
- Alarm receiver posts high-priority reminders when app is closed.

## Privacy
- Data is local in Room DB (`nudge.db`).
- Only user-selected text should be sent to OpenAI API.
