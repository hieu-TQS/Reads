package com.liskovsoft.smartyoutubetv2.common.exoplayer.iptv

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.util.Xml
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import okhttp3.OkHttpClient
import okhttp3.Request
import org.xmlpull.v1.XmlPullParser
import java.io.InputStream
import java.text.SimpleDateFormat
import java.util.*
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import java.util.zip.GZIPInputStream

/**
 * EPG manager for fetching and parsing XMLTV data.
 * Kotlin version — ported from Java with enhancements from OKtivi's EpgManager.kt
 *
 * Features:
 * - Multiple EPG sources with switch support
 * - XMLTV parsing with GZIP support
 * - Channel alias resolution (tvg-id, display-name, normalized matching)
 * - Program cache with O(1) lookups
 * - Listener notification system
 * - Fallback program generation from channel description
 */
class EpgManager private constructor() {
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    private var appContext: Context? = null
    private val dateFormat = SimpleDateFormat("yyyyMMddHHmmss", Locale.US)
    private val displayFormat = SimpleDateFormat("HH:mm", Locale.getDefault())

    private var epgSources = mutableListOf<EpgSource>()
    private var currentSourceIndex = 0

    private val epgCache = ConcurrentHashMap<String, List<EpgData.EpgProgram>>()
    private val lowercaseKeyMap = ConcurrentHashMap<String, String>()
    private val normalizedKeyMap = ConcurrentHashMap<String, String>()
    private val channelAliasMap = ConcurrentHashMap<String, String>()
    private val normalizedAliasMap = ConcurrentHashMap<String, String>()
    private val resolvedIdCache = ConcurrentHashMap<String, String>()

    private var isUpdating = false
    private val callbacks = mutableListOf<() -> Unit>()
    private val externalListeners = mutableListOf<() -> Unit>()
    private val handler = Handler(Looper.getMainLooper())

    val sources: List<EpgSource> get() = epgSources.toList()

    val currentSource: EpgSource?
        get() = if (currentSourceIndex in epgSources.indices) epgSources[currentSourceIndex] else null

    companion object {
        private const val TAG = "EpgManager"
        private const val PREFS_KEY = "epg_sources"
        private const val DEFAULT_EPG_URL = "https://lichphatsong.io.vn/epgu.xml"

        @Volatile
        private var instance: EpgManager? = null

        @JvmStatic
        fun getInstance(): EpgManager {
            return instance ?: synchronized(this) {
                instance ?: EpgManager().also { instance = it }
            }
        }
    }

    init {
        dateFormat.timeZone = TimeZone.getTimeZone("GMT+7")
    }

    // ─────────────────────────────────────────
    // EPG SOURCE MANAGEMENT
    // ─────────────────────────────────────────

    fun init(context: Context) {
        appContext = context.applicationContext
        val prefs = context.getSharedPreferences("oktivi_prefs", Context.MODE_PRIVATE)
        val sourcesJson = prefs.getString(PREFS_KEY, null)
        if (sourcesJson != null) {
            val type = object : TypeToken<MutableList<EpgSource>>() {}.type
            epgSources = Gson().fromJson(sourcesJson, type) ?: mutableListOf()
        }
        currentSourceIndex = prefs.getInt("current_epg_source_index", 0)

        if (sourcesJson == null && epgSources.isEmpty()) {
            epgSources.add(EpgSource("Mặc định (VN)", DEFAULT_EPG_URL))
            save(context)
        }
    }

    private fun save(context: Context) {
        context.getSharedPreferences("oktivi_prefs", Context.MODE_PRIVATE).edit().apply {
            putString(PREFS_KEY, Gson().toJson(epgSources))
            putInt("current_epg_source_index", currentSourceIndex)
            apply()
        }
    }

    fun addSource(context: Context, name: String, url: String) {
        epgSources.add(EpgSource(name, url))
        save(context)
    }

    fun deleteSource(context: Context, index: Int) {
        if (index in epgSources.indices) {
            epgSources.removeAt(index)
            if (currentSourceIndex >= epgSources.size) currentSourceIndex = 0
            save(context)
        }
    }

    fun switchSource(context: Context, index: Int, onComplete: ((Boolean) -> Unit)? = null) {
        if (index in epgSources.indices) {
            currentSourceIndex = index
            save(context)
            clearCache()
            fetchEpg { onComplete?.invoke(true) }
        } else {
            onComplete?.invoke(false)
        }
    }

    fun setEpgUrl(url: String) {
        if (url.isNotBlank()) {
            epgSources.clear()
            epgSources.add(EpgSource("Custom", url))
            clearCache()
        }
    }

    fun getCurrentEpgUrl(): String? = currentSource?.url

    // ─────────────────────────────────────────
    // LISTENER MANAGEMENT
    // ─────────────────────────────────────────

    fun registerListener(listener: () -> Unit) {
        synchronized(externalListeners) {
            if (!externalListeners.contains(listener)) externalListeners.add(listener)
        }
    }

    fun unregisterListener(listener: () -> Unit) {
        synchronized(externalListeners) { externalListeners.remove(listener) }
    }

    private fun notifyListeners() {
        val listeners = synchronized(externalListeners) { externalListeners.toList() }
        listeners.forEach { it() }
    }

    // ─────────────────────────────────────────
    // EPG FETCHING
    // ─────────────────────────────────────────

    fun fetchEpg(callback: () -> Unit) {
        val url = getCurrentEpgUrl()
        if (url.isNullOrBlank()) {
            clearCache()
            callback()
            notifyListeners()
            return
        }
        fetchEpgFromUrl(url, callback)
    }

    fun fetchEpgFromUrl(url: String, callback: () -> Unit, force: Boolean = false) {
        if (!force && epgCache.isNotEmpty()) {
            callback()
            return
        }

        synchronized(callbacks) {
            callbacks.add(callback)
            if (isUpdating) return
            isUpdating = true
        }

        Thread {
            try {
                val request = Request.Builder().url(url).build()
                val response = client.newCall(request).execute()
                response.use { resp ->
                    if (resp.isSuccessful) {
                        resp.body()?.byteStream()?.let { parseEpg(it) }
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "EPG Fetch Error from $url", e)
            } finally {
                synchronized(callbacks) {
                    isUpdating = false
                    val pendingCallbacks = ArrayList(callbacks)
                    callbacks.clear()

                    handler.post {
                        pendingCallbacks.forEach { it() }
                        notifyListeners()
                    }
                }
            }
        }.start()
    }

    fun clearCache() {
        epgCache.clear()
        lowercaseKeyMap.clear()
        normalizedKeyMap.clear()
        channelAliasMap.clear()
        normalizedAliasMap.clear()
        resolvedIdCache.clear()
    }

    // ─────────────────────────────────────────
    // XMLTV PARSING
    // ─────────────────────────────────────────

    private fun parseEpg(inputStream: InputStream) {
        val actualStream: InputStream = try {
            val bytes = inputStream.readBytes()
            if (bytes.size >= 2 && bytes[0] == 0x1f.toByte() && bytes[1] == 0x8b.toByte()) {
                GZIPInputStream(bytes.inputStream())
            } else {
                bytes.inputStream()
            }
        } catch (e: Exception) {
            Log.e(TAG, "parseEpg: error detecting GZIP, fallback to raw stream", e)
            inputStream
        }

        try {
            val parser = Xml.newPullParser()
            parser.setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES, false)
            parser.setInput(actualStream, null)

            var eventType = parser.eventType
            var currentChannelId: String? = null
            var currentTitle: String? = null
            var currentDesc: String? = null
            var currentStart: String? = null
            var currentStop: String? = null
            var currentChannel: String? = null
            var inProgramme = false

            val tempMap = mutableMapOf<String, MutableList<EpgData.EpgProgram>>()
            val tempAliasMap = mutableMapOf<String, String>()

            while (eventType != XmlPullParser.END_DOCUMENT) {
                val name = parser.name
                when (eventType) {
                    XmlPullParser.START_TAG -> {
                        when (name) {
                            "channel" -> currentChannelId = parser.getAttributeValue(null, "id")
                            "display-name" -> {
                                if (currentChannelId != null) {
                                    tempAliasMap[parser.nextText().trim().lowercase()] = currentChannelId!!
                                }
                            }
                            "programme" -> {
                                currentStart = parser.getAttributeValue(null, "start")
                                currentStop = parser.getAttributeValue(null, "stop")
                                currentChannel = parser.getAttributeValue(null, "channel")
                                currentTitle = null
                                currentDesc = null
                                inProgramme = true
                            }
                            "title" -> { if (inProgramme) currentTitle = parser.nextText() }
                            "desc" -> { if (inProgramme) currentDesc = parser.nextText() }
                        }
                    }
                    XmlPullParser.END_TAG -> {
                        when (name) {
                            "programme" -> {
                                if (inProgramme && currentTitle != null && currentStart != null &&
                                    currentStop != null && currentChannel != null) {
                                    buildProgram(currentChannel, currentTitle, currentDesc, currentStart, currentStop)?.let { prog ->
                                        tempMap.getOrPut(prog.channelId) { mutableListOf() }.add(prog)
                                    }
                                }
                                inProgramme = false
                                currentTitle = null; currentDesc = null
                                currentStart = null; currentStop = null; currentChannel = null
                            }
                            "channel" -> currentChannelId = null
                        }
                    }
                }
                eventType = parser.next()
            }

            // Update caches
            epgCache.clear()
            epgCache.putAll(tempMap)
            lowercaseKeyMap.clear()
            normalizedKeyMap.clear()
            tempMap.keys.forEach { key ->
                lowercaseKeyMap[key.lowercase()] = key
                normalizedKeyMap[normalizeTitle(key)] = key
            }

            channelAliasMap.clear()
            channelAliasMap.putAll(tempAliasMap)
            normalizedAliasMap.clear()
            tempAliasMap.forEach { (k, v) ->
                normalizedAliasMap[normalizeTitle(k)] = v
            }

            resolvedIdCache.clear()
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing EPG XML", e)
        }
    }

    private fun buildProgram(channelId: String, title: String, description: String?,
                              startStr: String, stopStr: String): EpgData.EpgProgram? {
        if (startStr.length < 14 || stopStr.length < 14) {
            Log.w(TAG, "buildProgram: invalid date string start='$startStr' stop='$stopStr'")
            return null
        }
        return try {
            val startTrimmed = startStr.substring(0, 14)
            val stopTrimmed = stopStr.substring(0, 14)
            val start = dateFormat.parse(startTrimmed)
            val stop = dateFormat.parse(stopTrimmed)
            if (start == null || stop == null) {
                Log.w(TAG, "buildProgram: parse returned null")
                null
            } else {
                EpgData.EpgProgram(title, start, stop, description, channelId)
            }
        } catch (e: Exception) {
            Log.w(TAG, "buildProgram: error parsing", e)
            null
        }
    }

    // ─────────────────────────────────────────
    // CHANNEL ID RESOLUTION
    // ─────────────────────────────────────────

    private fun normalizeTitle(title: String): String {
        return title.trim().lowercase()
            .replace(" hd", "").replace(" sd", "")
            .replace(" fhd", "").replace(" 4k", "")
            .replace(" k+", "").replace(" ", "")
    }

    private fun resolveId(tvgId: String?): String? {
        if (tvgId.isNullOrBlank()) return null
        val trimmed = tvgId.trim()
        val cached = resolvedIdCache[trimmed]
        if (cached != null) return if (cached == "NULL_SENTINEL") null else cached

        val result = performResolveId(trimmed)
        resolvedIdCache[trimmed] = result ?: "NULL_SENTINEL"
        return result
    }

    private fun performResolveId(tvgId: String): String? {
        val lowerTvgId = tvgId.lowercase()

        // 1. O(1) match from lowercase map
        lowercaseKeyMap[lowerTvgId]?.let { return it }

        // 2. O(1) match from channel alias map
        channelAliasMap[lowerTvgId]?.let { return it }

        // 3. O(1) match from normalized alias map
        val normalizedTvgId = normalizeTitle(tvgId)
        normalizedAliasMap[normalizedTvgId]?.let { return it }

        // 4. O(1) match from normalized cache map
        return normalizedKeyMap[normalizedTvgId]
    }

    // ─────────────────────────────────────────
    // PROGRAM QUERIES
    // ─────────────────────────────────────────

    fun getCurrentProgram(tvgId: String?, channelTitle: String? = null): EpgData.EpgProgram? {
        var id = resolveId(tvgId)
        if (id == null && channelTitle != null) id = resolveId(channelTitle)
        return id?.let { epgCache[it]?.find { prog -> prog.isCurrent() } }
    }

    fun getPrograms(tvgId: String?, channelTitle: String? = null): List<EpgData.EpgProgram> {
        var id = resolveId(tvgId)
        if (id == null && channelTitle != null) id = resolveId(channelTitle)
        return id?.let { epgCache[it] } ?: emptyList()
    }

    fun getNextProgram(tvgId: String?, channelTitle: String? = null): EpgData.EpgProgram? {
        var id = resolveId(tvgId)
        if (id == null && channelTitle != null) id = resolveId(channelTitle)
        val programs = id?.let { epgCache[it] } ?: return null
        val now = Date()
        return programs.filter { it.startTime.after(now) }
            .minByOrNull { it.startTime }
    }
}
