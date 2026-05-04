package com.personal.nudge.services

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import java.security.MessageDigest

class NudgeNotificationListenerService: NotificationListenerService() {
    private val seen = HashSet<String>()
    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        sbn ?: return
        val extras = sbn.notification.extras
        val title = extras.getCharSequence("android.title")?.toString().orEmpty()
        val text = extras.getCharSequence("android.text")?.toString().orEmpty()
        if (text.isBlank()) return
        val hash = sha1("${sbn.packageName}|$title|$text")
        if (!seen.add(hash)) return
        // TODO: persist to Room and queue AI extraction worker.
    }
    private fun sha1(input: String): String = MessageDigest.getInstance("SHA-1").digest(input.toByteArray()).joinToString("") { "%02x".format(it) }
}
