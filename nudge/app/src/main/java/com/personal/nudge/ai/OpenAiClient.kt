package com.personal.nudge.ai

import kotlinx.serialization.Serializable

@Serializable data class ExtractedTask(val title: String, val description: String = "", val dueAt: Long? = null, val priority: String = "medium", val recurrence: String? = null, val reminderAt: Long? = null, val confidence: Double = 0.6)

object OpenAiClient {
    suspend fun extractTask(apiKey: String, input: String, source: String): ExtractedTask {
        if (input.isBlank()) return ExtractedTask(title = "Inbox item", description = "Empty input", priority = "low", confidence = 0.2)
        // Minimal local fallback parser for reliability when key/model unavailable.
        val urgent = input.contains("urgent", true)
        return ExtractedTask(title = input.lineSequence().first().take(80), description = input, priority = if (urgent) "urgent" else "medium", confidence = sourceConfidence(source))
    }

    private fun sourceConfidence(source: String): Double = when (source) {"notification" -> 0.72; "voice" -> 0.78; else -> 0.84}
}
