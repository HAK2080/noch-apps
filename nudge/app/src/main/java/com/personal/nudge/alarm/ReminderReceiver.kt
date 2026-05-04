package com.personal.nudge.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

class ReminderReceiver: BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val text = intent.getStringExtra("title") ?: "Task reminder"
        val n = NotificationCompat.Builder(context, "nudge_reminders")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("Nudge")
            .setContentText(text)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .build()
        NotificationManagerCompat.from(context).notify((System.currentTimeMillis()%100000).toInt(), n)
    }
}
