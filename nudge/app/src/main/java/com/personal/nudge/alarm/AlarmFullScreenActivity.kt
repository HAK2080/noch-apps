package com.personal.nudge.alarm

import android.app.Activity
import android.os.Bundle
import android.widget.Button
import android.widget.LinearLayout

class AlarmFullScreenActivity: Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val layout = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val dismiss = Button(this).apply { text = "Dismiss"; setOnClickListener { finish() } }
        val snooze = Button(this).apply { text = "Snooze 5m"; setOnClickListener { finish() } }
        layout.addView(dismiss); layout.addView(snooze)
        setContentView(layout)
    }
}
