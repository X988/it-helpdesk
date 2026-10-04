package com.example.apkextractor

import org.junit.Assert.*
import org.junit.Test

class ExportFormatTest {
    @Test fun splitNameIsActualDataRatherThanInterpolationSource() {
        assertEquals("\"config.arm64_v8a\"", jsonQuotedOrNull("config.arm64_v8a"))
        assertEquals("null", jsonQuotedOrNull(null))
    }

    @Test fun manifestValuesEscapeQuotesBackslashesAndControls() {
        assertEquals("\"config.\\\"quoted\\\"\\\\line\\n\\t\\r\\u0001\"", jsonQuotedOrNull("config.\"quoted\"\\line\n\t\r\u0001"))
    }

    @Test fun manifestKeepsUnicodeAndEmptyValues() {
        assertEquals("\"Русский_日本語\"", jsonQuotedOrNull("Русский_日本語"))
        assertEquals("\"\"", jsonQuotedOrNull(""))
    }

    @Test fun filenameCannotEscapeTheChosenFolder() {
        assertEquals("secret.apk", sanitizeFileName("../../secret.apk"))
        assertFalse(sanitizeFileName("a/b\\c:*?\"<>|\n").any { it in "/\\:*?\"<>|\n" })
        assertEquals("app", sanitizeFileName("...___  "))
        assertEquals("unknown", sanitizeFileName("", "unknown"))
    }

    @Test fun filenameIsBoundedForDocumentProviders() {
        assertEquals(96, sanitizeFileName("a".repeat(200)).length)
    }
}
