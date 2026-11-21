package com.seutengim.mysocial

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/** Data-message receiver starter. Wire call accept/reject into the app's authenticated API + WebRTC bridge. */
class MySocialMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        // The Capacitor app also receives the registration event while running.
        // For background token refresh, persist this token and sync it after user authentication.
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        val data = message.data
        val isCall = data["kind"] == "incoming-call"
        if (isCall) {
            try {
                MySocialConnectionService.reportIncomingCall(
                    this,
                    data["callId"] ?: System.currentTimeMillis().toString(),
                    data["sender"] ?: data["title"] ?: "MySocial 친구"
                )
            } catch (error: SecurityException) {
                // The user may not have enabled the self-managed PhoneAccount yet; fall back to a notification.
            } catch (error: Exception) {
                // Keep a visible fallback alert if Telecom registration is unavailable on this device.
            }
        }
        val channelId = if (isCall) "mysocial_calls" else "mysocial_messages"
        val manager = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(NotificationChannel(
                channelId,
                if (isCall) "MySocial calls" else "MySocial messages",
                if (isCall) NotificationManager.IMPORTANCE_HIGH else NotificationManager.IMPORTANCE_DEFAULT
            ).apply { setSound(null, null) })
        }
        val launch = packageManager.getLaunchIntentForPackage(packageName) ?: return
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        launch.putExtra("mysocial_call_id", data["callId"])
        val pending = PendingIntent.getActivity(
            this, (data["callId"] ?: System.currentTimeMillis().toString()).hashCode(), launch,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val title = data["title"] ?: "MySocial"
        val body = data["body"] ?: if (isCall) "수신 전화" else "새 알림이 도착했어."
        val notification = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(applicationInfo.icon)
            .setContentTitle(title)
            .setContentText(body)
            .setCategory(if (isCall) NotificationCompat.CATEGORY_CALL else NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(if (isCall) NotificationCompat.PRIORITY_MAX else NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(!isCall)
            .setOngoing(isCall)
            .setFullScreenIntent(if (isCall) pending else null, isCall)
            .setContentIntent(pending)
            .build()
        NotificationManagerCompat.from(this).notify((data["callId"] ?: title).hashCode(), notification)
    }
}
