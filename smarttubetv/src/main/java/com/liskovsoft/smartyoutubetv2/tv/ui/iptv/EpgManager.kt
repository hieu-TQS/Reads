package com.liskovsoft.smartyoutubetv2.tv.ui.iptv

import android.content.Context
import android.util.Log
import android.util.Xml
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import okhttp3.Request
import org.xmlpull.v1.XmlPullParser
import java.io.InputStream
import java.text.SimpleDateFormat
import java.util.*
import java.util.concurrent.ConcurrentHashMap
import java.util.zip.GZIPInputStream

/**
 * EPG Manager ported from OKMaterialTV.
 * Fetches, parses, and caches XMLTV EPG data.
 */
object EpgManager {
    private const val TAG = "EpgManager"
    private const val PREFS_KEY = "epg_sources"
    private val DEFAULT_EPG_URL = "https://lichphatsong.io.vn/epgu.xml"
    private val client by lazy { okhttp3.OkHttpClient() }
    private var appContext: Context? = null
    internal val dateFormat = SimpleDateFormat("yyyyMMddHHmmss Z", Locale.US)
    val displayFormat = SimpleDateFormat("HH:mm", Locale.getDefault())

    data class EpgSource(val name: String, val url: String)

    private var epgSources = mutableListOf<EpgSource>()
    private var currentSourceIndex = 0

    val sources: List<EpgSource> get() = epgSources

    val currentSource: EpgSource?
        get() = if (currentSourceIndex in epgSources.indices) epgSources[currentSourceIndex] else null

    private val epgCache = ConcurrentHashMap<String, List<EpgProgram>>()
    private val lowercaseKeyMap = ConcurrentHashMap<String, String>()
    private val normalizedKeyMap = ConcurrentHashMap<String, String>()
    private val channelAliasMap = ConcurrentHashMap<String, String>()
    private val normalizedAliasMap = ConcurrentHashMap<String, String>()
    private val resolvedIdCache = ConcurrentHashMap<String, String>()
    private var isUpdating = false
    private val callbacks = mutableListOf<() -> Unit>()
    private val externalListeners = mutableListOf<() -> Unit>()
    private val handler = android.os.Handler(android.os.Looper.getMainLooper())

    fun init(context: Context) {
        appContext = context.applicationContext
        val prefs = context.getSharedPreferences("okmaterialtv_prefs", Context.MODE_PRIVATE)
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
        context.getSharedPreferences("okmaterialtv_prefs", Context.MODE_PRIVATE).edit().apply {
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
            fetchEpg {
                onComplete?.invoke(true)
            }
        } else {
            onComplete?.invoke(false)
        }
    }

    fun getCurrentEpgUrl(): String? = currentSource?.url

    fun registerListener(listener: () -> Unit) {
        synchronized(externalListeners) {
            if (!externalListeners.contains(listener)) externalListeners.add(listener)
        }
    }

    fun unregisterListener(listener: () -> Unit) {
        synchronized(externalListeners) {
            externalListeners.remove(listener)
        }
    }

    private fun notifyListeners() {
        val listeners = synchronized(externalListeners) { externalListeners.toList() }
        listeners.forEach { it() }
    }

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
                client.newCall(request).execute().use { response ->
                    if (response.isSuccessful) {
                        response.body()?.byteStream()?.let { parseEpg(it) }
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

        val parser = Xml.newPullParser()
        parser.setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES, false)
        parser.setInput(actualStream, null)

        var eventType = parser.eventType
        var currentProgram: EpgProgramBuilder? = null
        var currentChannelId: String? = null
        val tempMap = mutableMapOf<String, MutableList<EpgProgram>>()
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
                            val start = parser.getAttributeValue(null, "start")
                            val stop = parser.getAttributeValue(null, "stop")
                            val channel = parser.getAttributeValue(null, "channel")
                            currentProgram = EpgProgramBuilder(channel, start, stop)
                        }
                        "title" -> currentProgram?.title = parser.nextText()
                        "desc" -> currentProgram?.description = parser.nextText()
                    }
                }
                XmlPullParser.END_TAG -> {
                    if (name == "programme" && currentProgram != null) {
                        currentProgram?.build()?.let { prog ->
                            tempMap.getOrPut(prog.channelId) { mutableListOf() }.add(prog)
                        }
                        currentProgram = null
                    } else if (name == "channel") {
                        currentChannelId = null
                    }
                }
            }
            eventType = parser.next()
        }
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
    }

    private fun normalizeTitle(title: String): String {
        return title.trim().lowercase()
            .replace(" hd", "")
            .replace(" sd", "")
            .replace(" fhd", "")
            .replace(" 4k", "")
            .replace(" k+", "")
            .replace(" ", "")
    }

    private fun resolveId(tvgId: String?): String? {
        if (tvgId == null || tvgId.trim().isEmpty()) return null
        val trimmed = tvgId.trim()
        val cached = resolvedIdCache[trimmed]
        if (cached != null) {
            return if (cached == "NULL_SENTINEL") null else cached
        }

        val result = performResolveId(trimmed)
        resolvedIdCache[trimmed] = result ?: "NULL_SENTINEL"
        return result
    }

    private fun performResolveId(tvgId: String): String? {
        val lowerTvgId = tvgId.lowercase()

        val cachedKey = lowercaseKeyMap[lowerTvgId]
        if (cachedKey != null) return cachedKey

        var resolved = channelAliasMap[lowerTvgId]
        if (resolved != null) return resolved

        val normalizedTvgId = normalizeTitle(tvgId)
        resolved = normalizedAliasMap[normalizedTvgId]
        if (resolved != null) return resolved

        return normalizedKeyMap[normalizedTvgId]
    }

    fun getCurrentProgram(tvgId: String?, channelTitle: String? = null): EpgProgram? {
        var id = resolveId(tvgId)
        if (id == null && channelTitle != null) {
            id = resolveId(channelTitle)
        }
        val targetId = id ?: return null
        return epgCache[targetId]?.find { it.isCurrent() }
    }

    fun getPrograms(tvgId: String?, channelTitle: String? = null): List<EpgProgram> {
        var id = resolveId(tvgId)
        if (id == null && channelTitle != null) {
            id = resolveId(channelTitle)
        }
        val targetId = id ?: return emptyList()
        return epgCache[targetId] ?: emptyList()
    }

    fun getNextProgram(tvgId: String?, channelTitle: String? = null): EpgProgram? {
        var id = resolveId(tvgId)
        if (id == null && channelTitle != null) {
            id = resolveId(channelTitle)
        }
        val targetId = id ?: return null
        val now = Date()
        return epgCache[targetId]?.filter { it.startTime.after(now) }?.minByOrNull { it.startTime }
    }

    private class EpgProgramBuilder(val channelId: String, val startStr: String, val stopStr: String) {
        var title: String? = null
        var description: String? = null
        fun build(): EpgProgram? {
            if (title == null) return null
            if (startStr.length < 14 || stopStr.length < 14) {
                Log.w(TAG, "EpgProgramBuilder: invalid date string start='$startStr' stop='$stopStr'")
                return null
            }
            return try {
                val dateFormat = SimpleDateFormat("yyyyMMddHHmmss", Locale.US)
                dateFormat.timeZone = TimeZone.getTimeZone("GMT+7")
                val startStrTrimmed = startStr.substring(0, 14)
                val stopStrTrimmed = stopStr.substring(0, 14)
                val start = dateFormat.parse(startStrTrimmed)
                val stop = dateFormat.parse(stopStrTrimmed)
                if (start == null || stop == null) {
                    Log.w(TAG, "EpgProgramBuilder: parse returned null")
                    return null
                }
                EpgProgram(title!!, start, stop, description, channelId)
            } catch (e: Exception) {
                Log.w(TAG, "EpgProgramBuilder: error parsing", e)
                null
            }
        }
    }
}
