package com.example.apkextractor

private val invalidFileNameChars = Regex("[\\\\/:*?\"<>|\\p{Cntrl}]")
internal fun sanitizeFileName(value: String, fallback: String = "app"): String {
    val cleaned = value.trim()
        .replace(invalidFileNameChars, "_")
        .replace(Regex("_+"), "_")
        .trim(' ', '.', '_')
        .take(96)
    return cleaned.ifBlank { fallback }
}


internal fun jsonEscape(value: String): String = buildString {
    value.forEach { ch ->
        when (ch) {
            '\\' -> append("\\\\")
            '"' -> append("\\\"")
            '\n' -> append("\\n")
            '\r' -> append("\\r")
            '\t' -> append("\\t")
            else -> if (ch.code < 0x20) append("\\u%04x".format(ch.code)) else append(ch)
        }
    }
}


internal fun jsonQuotedOrNull(value: String?): String =
    value?.let { "\"" + jsonEscape(it) + "\"" } ?: "null"
