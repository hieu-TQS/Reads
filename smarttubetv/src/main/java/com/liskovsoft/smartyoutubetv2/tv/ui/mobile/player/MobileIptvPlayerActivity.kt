package com.liskovsoft.smartyoutubetv2.tv.ui.mobile.player

import android.content.pm.ActivityInfo
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.LayoutInflater
import android.view.TextureView
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.SeekBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.bumptech.glide.Glide
import com.liskovsoft.smartyoutubetv2.common.app.models.data.Video
import com.liskovsoft.smartyoutubetv2.common.exoplayer.iptv.IptvMedia3Player
import com.liskovsoft.smartyoutubetv2.common.m3u.cache.M3uCache
import com.liskovsoft.smartyoutubetv2.common.m3u.models.M3uSource
import com.liskovsoft.smartyoutubetv2.common.m3u.parser.CatchupUrlBuilder
import com.liskovsoft.smartyoutubetv2.common.prefs.IptvFavoritesStore
import com.liskovsoft.smartyoutubetv2.tv.R
import com.liskovsoft.smartyoutubetv2.common.exoplayer.iptv.EpgData.EpgProgram
import com.liskovsoft.smartyoutubetv2.common.exoplayer.iptv.EpgManager
import com.liskovsoft.smartyoutubetv2.tv.ui.widget.AnimatedGradientBorderView
import java.text.SimpleDateFormat
import java.util.Date
import java.util.LinkedHashSet
import java.util.Locale

@androidx.media3.common.util.UnstableApi
class MobileIptvPlayerActivity : AppCompatActivity(), IptvMedia3Player.PlayerListener {

    private lateinit var playerVideoContainer: ViewGroup
    private lateinit var channelInfoContainer: View
    private lateinit var contentArea: View
    private lateinit var bottomNavContainer: View

    private lateinit var playerSurface: TextureView
    private lateinit var playerLoadingProgress: ProgressBar
    private lateinit var overlayPlayerControls: View

    private lateinit var popupChannelLogo: ImageView
    private lateinit var popupChannelName: TextView
    private lateinit var popupProgramTitle: TextView
    private lateinit var popupStreamInfo: TextView
    private lateinit var popupStartTime: TextView
    private lateinit var popupStopTime: TextView
    private lateinit var popupProgressBar: SeekBar
    private lateinit var popupTimelineLayout: View
    private lateinit var popupLiveBadge: TextView
    private lateinit var btnOverlaySettings: ImageView
    private lateinit var btnOverlayChannels: ImageView
    private lateinit var btnOverlayEpg: ImageView
    private lateinit var btnPlayPause: ImageView
    private lateinit var btnOverlayBackFullscreen: ImageView

    private lateinit var btnOverlayEnterFullscreen: ImageView
    private lateinit var topActionButtons: View
    private lateinit var channelInfoPopup: View
    private lateinit var popupVodTimelineLayout: View
    
    private lateinit var popupVodCurrentTime: TextView
    private lateinit var popupVodTotalTime: TextView
    private lateinit var popupVodProgressBar: SeekBar
    private var isVodTimelineVisible = false

    private lateinit var infoVodTimeBar: View
    private lateinit var infoVodCurrentTime: TextView
    private lateinit var infoVodTotalTime: TextView
    private lateinit var infoVodProgressBar: SeekBar


    private val vodUpdateRunnable = object : Runnable {
        override fun run() {
            updateVodTimeline()
            if (isVodTimelineVisible) {
                handler.postDelayed(this, 1000)
            }
        }
    }

    private lateinit var imgChannelLogo: ImageView
    private lateinit var txtChannelName: TextView
    private lateinit var infoLiveBadge: TextView
    private lateinit var txtProgramTitle: TextView
    private lateinit var txtStreamInfo: TextView
    private lateinit var txtStartTime: TextView
    private lateinit var txtStopTime: TextView
    private lateinit var epgProgressBar: ProgressBar

    private lateinit var playerEpgTimeBar: View
    private lateinit var hsvPlayerCategoryChips: HorizontalScrollView

    private lateinit var containerPlayerCategoryChips: LinearLayout
    private lateinit var btnNavBack: LinearLayout
    private lateinit var btnNavList: LinearLayout
    private lateinit var btnNavSchedule: LinearLayout
    private lateinit var btnNavFullscreen: LinearLayout

    private lateinit var btnNavSettings: LinearLayout
    private lateinit var iconNavList: ImageView
    private lateinit var txtNavList: TextView
    private lateinit var iconNavSchedule: ImageView
    private lateinit var txtNavSchedule: TextView
    private lateinit var iconNavFullscreen: ImageView
    private lateinit var txtNavFullscreen: TextView
    private lateinit var iconNavSettings: ImageView
    private lateinit var txtNavSettings: TextView

    private lateinit var layoutChannelsTabContainer: View
    private lateinit var layoutEpgTabContainer: View
    private lateinit var recyclerChannels: RecyclerView
    private lateinit var recyclerEpg: RecyclerView

    private lateinit var fullscreenChannelsOverlay: View
    private lateinit var channelsOverlayDim: View
    private lateinit var btnCloseChannelsOverlay: ImageView
    private lateinit var hsvOverlayCategoryChips: HorizontalScrollView
    private lateinit var containerOverlayCategoryChips: LinearLayout
    private lateinit var recyclerOverlayChannels: RecyclerView

    private lateinit var fullscreenEpgOverlay: View
    private lateinit var epgOverlayDim: View
    private lateinit var btnCloseEpgOverlay: ImageView
    private lateinit var overlayEpgHeaderLogo: ImageView
    private lateinit var overlayEpgHeaderChannel: TextView
    private lateinit var overlayEpgHeaderLiveBadge: TextView
    private lateinit var recyclerOverlayEpg: RecyclerView

    private var player: IptvMedia3Player? = null
    private var video: Video? = null
    private var tvgId: String? = null
    private var activeChannelUrl: String? = null

    private var isCatchupMode = false
    private var isLocalVideo = false
    private var isDailymotion = false
    private var localVideoSize: String? = null
    private var localVideoDuration: String? = null
    private var localVideoDate: String? = null
    private var description: String? = null
    private var catchupProgram: EpgProgram? = null

    private val allChannels = ArrayList<M3uSource>()
    private val displayedChannels = ArrayList<M3uSource>()
    private val categoriesList = ArrayList<String>()
    private var selectedCategory = "Tất cả"

    private var channelAdapter: PlayerChannelAdapter? = null
    private var epgAdapter: MobileEpgAdapter? = null

    private var isFullscreen = false
    private var isVerticalVideo = false

    private val handler = Handler(Looper.getMainLooper())
    private val hideOverlayRunnable = Runnable {
        overlayPlayerControls.visibility = View.GONE
    }

    private val epgUpdateRunnable = object : Runnable {
        override fun run() {
            updateEpgInfo()
            handler.postDelayed(this, 1000)
        }
    }

    private val epgListRefreshRunnable = object : Runnable {
        override fun run() {
            refreshEpgList()
            handler.postDelayed(this, 60_000L)
        }
    }



    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.mobile_activity_iptv_player)

        EpgManager.getInstance().init(this)

        initViews()
        parseIntent()
        setupListeners()
        setupOverlayControls()
        setupChannelsList()
        setupEpgList()

        popupVodProgressBar.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(seekBar: SeekBar?, progress: Int, fromUser: Boolean) {
                if (fromUser && player != null) {
                    val duration = player!!.duration
                    if (duration > 0) {
                        val newPosition = (progress / 1000f * duration).toLong()
                        popupVodCurrentTime.text = formatTime(newPosition)
                    }
                }
            }

            override fun onStartTrackingTouch(seekBar: SeekBar?) {
                handler.removeCallbacks(hideOverlayRunnable)
            }

            override fun onStopTrackingTouch(seekBar: SeekBar?) {
                if (player != null && seekBar != null) {
                    val duration = player!!.duration
                    if (duration > 0) {
                        val newPosition = (seekBar.progress / 1000f * duration).toLong()
                        player!!.seekTo(newPosition)
                    }
                }
                handler.postDelayed(hideOverlayRunnable, 4000)
            }
        })

        infoVodProgressBar.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(seekBar: SeekBar?, progress: Int, fromUser: Boolean) {
                if (fromUser && player != null) {
                    val duration = player!!.duration
                    if (duration > 0) {
                        val newPosition = (progress / 1000f * duration).toLong()
                        infoVodCurrentTime.text = formatTime(newPosition)
                    }
                }
            }

            override fun onStartTrackingTouch(seekBar: SeekBar?) {
                handler.removeCallbacks(hideOverlayRunnable)
            }

            override fun onStopTrackingTouch(seekBar: SeekBar?) {
                if (player != null && seekBar != null) {
                    val duration = player!!.duration
                    if (duration > 0) {
                        val newPosition = (seekBar.progress / 1000f * duration).toLong()
                        player!!.seekTo(newPosition)
                    }
                }
            }
        })
        
        // Start player
        video?.let { v ->
            activeChannelUrl = v.videoUrl
            player = IptvMedia3Player(this).apply {
                setListener(this@MobileIptvPlayerActivity)
                play(v, playerSurface, null)
            }
        }

        handler.post(epgUpdateRunnable)
        handler.post(epgListRefreshRunnable)
        
        if (isLocalVideo) {
            toggleFullscreen(true)
        }
    }

    private fun initViews() {
        playerVideoContainer = findViewById(R.id.player_video_container)
        channelInfoContainer = findViewById(R.id.channel_info_container)
        contentArea = findViewById(R.id.content_area)
        bottomNavContainer = findViewById(R.id.bottom_nav_container)

        playerSurface = findViewById(R.id.player_surface)
        playerLoadingProgress = findViewById(R.id.player_loading_progress)
        overlayPlayerControls = findViewById(R.id.overlay_player_controls)

        popupChannelLogo = findViewById(R.id.popup_channel_logo)
        popupChannelName = findViewById(R.id.popup_channel_name)
        popupProgramTitle = findViewById(R.id.popup_program_title)
        popupStreamInfo = findViewById(R.id.popup_stream_info)
        popupStartTime = findViewById(R.id.popup_start_time)
        popupStopTime = findViewById(R.id.popup_stop_time)
        popupProgressBar = findViewById(R.id.popup_progress_bar)
        popupTimelineLayout = findViewById(R.id.popup_timeline_layout)
        popupLiveBadge = findViewById(R.id.popup_live_badge)
        btnOverlaySettings = findViewById(R.id.btn_overlay_settings)
        btnOverlayChannels = findViewById(R.id.btn_overlay_channels)
        btnOverlayEpg = findViewById(R.id.btn_overlay_epg)
        btnPlayPause = findViewById(R.id.btn_play_pause)
        
        btnOverlayBackFullscreen = findViewById(R.id.btn_overlay_back_fullscreen)
        btnOverlayEnterFullscreen = findViewById(R.id.btn_overlay_enter_fullscreen)
        topActionButtons = findViewById(R.id.top_action_buttons)
        channelInfoPopup = findViewById(R.id.channel_info_popup)
        
        popupVodTimelineLayout = findViewById(R.id.popup_vod_timeline_layout)
        popupVodCurrentTime = findViewById(R.id.popup_vod_current_time)
        popupVodTotalTime = findViewById(R.id.popup_vod_total_time)
        popupVodProgressBar = findViewById(R.id.popup_vod_progress_bar)

        infoVodTimeBar = findViewById(R.id.info_vod_time_bar)
        infoVodCurrentTime = findViewById(R.id.info_vod_current_time)
        infoVodTotalTime = findViewById(R.id.info_vod_total_time)
        infoVodProgressBar = findViewById(R.id.info_vod_progress_bar)

        imgChannelLogo = findViewById(R.id.info_channel_logo)
        txtChannelName = findViewById(R.id.info_channel_name)
        infoLiveBadge = findViewById(R.id.info_live_badge)
        txtProgramTitle = findViewById(R.id.current_program_title)
        txtStreamInfo = findViewById(R.id.txt_stream_info)
        txtStartTime = findViewById(R.id.program_start_time)
        txtStopTime = findViewById(R.id.program_stop_time)
        epgProgressBar = findViewById(R.id.epg_progress_bar)
        playerEpgTimeBar = findViewById(R.id.player_epg_time_bar)

        hsvPlayerCategoryChips = findViewById(R.id.hsv_player_category_chips)
        containerPlayerCategoryChips = findViewById(R.id.container_player_category_chips)

        btnNavBack = findViewById(R.id.btn_nav_back)
        btnNavList = findViewById(R.id.btn_nav_list)
        btnNavSchedule = findViewById(R.id.btn_nav_schedule)
        btnNavFullscreen = findViewById(R.id.btn_nav_fullscreen)
        btnNavSettings = findViewById(R.id.btn_nav_settings)

        iconNavList = findViewById(R.id.icon_nav_list)
        txtNavList = findViewById(R.id.txt_nav_list)
        iconNavSchedule = findViewById(R.id.icon_nav_schedule)
        txtNavSchedule = findViewById(R.id.txt_nav_schedule)
        iconNavFullscreen = findViewById(R.id.icon_nav_fullscreen)
        txtNavFullscreen = findViewById(R.id.txt_nav_fullscreen)
        iconNavSettings = findViewById(R.id.icon_nav_settings)
        txtNavSettings = findViewById(R.id.txt_nav_settings)

        layoutChannelsTabContainer = findViewById(R.id.layout_channels_tab_container)
        layoutEpgTabContainer = findViewById(R.id.layout_epg_tab_container)
        recyclerChannels = findViewById(R.id.recycler_channels)
        recyclerEpg = findViewById(R.id.recycler_epg)

        fullscreenChannelsOverlay = findViewById(R.id.fullscreen_channels_overlay)
        channelsOverlayDim = findViewById(R.id.channels_overlay_dim)
        btnCloseChannelsOverlay = findViewById(R.id.btn_close_channels_overlay)
        hsvOverlayCategoryChips = findViewById(R.id.hsv_overlay_category_chips)
        containerOverlayCategoryChips = findViewById(R.id.container_overlay_category_chips)
        recyclerOverlayChannels = findViewById(R.id.recycler_overlay_channels)

        fullscreenEpgOverlay = findViewById(R.id.fullscreen_epg_overlay)
        epgOverlayDim = findViewById(R.id.epg_overlay_dim)
        btnCloseEpgOverlay = findViewById(R.id.btn_close_epg_overlay)
        overlayEpgHeaderLogo = findViewById(R.id.overlay_epg_header_logo)
        overlayEpgHeaderChannel = findViewById(R.id.overlay_epg_header_channel)
        overlayEpgHeaderLiveBadge = findViewById(R.id.overlay_epg_header_live_badge)
        recyclerOverlayEpg = findViewById(R.id.recycler_overlay_epg)
    }

    private fun parseIntent() {
        val url = intent.getStringExtra("iptv_url")
            ?: intent.getStringExtra("media_url")
            ?: intent.getStringExtra("url")
            ?: return
        val title = intent.getStringExtra("iptv_title")
            ?: intent.getStringExtra("title")
            ?: "Video"
        val logoUrl = intent.getStringExtra("iptv_logo_url")
            ?: intent.getStringExtra("logo_url")
        val epgUrl = intent.getStringExtra("iptv_epg_url")
        tvgId = intent.getStringExtra("iptv_tvg_id")

        isLocalVideo = intent.getBooleanExtra("is_local_video", false)
        isDailymotion = intent.getBooleanExtra("is_dailymotion", false)
        localVideoSize = intent.getStringExtra("local_video_size")
        localVideoDuration = intent.getStringExtra("local_video_duration")
        localVideoDate = intent.getStringExtra("local_video_date")

        if (!epgUrl.isNullOrEmpty()) {
            EpgManager.getInstance().setEpgUrl(epgUrl)
        }

        video = Video().apply {
            videoUrl = url
            this.title = title
            isIptv = !isLocalVideo && !isDailymotion
            this.logoUrl = logoUrl
            this.tvgId = intent.getStringExtra("iptv_tvg_id")
            if (isLocalVideo) {
                this.description = "Dung lượng: $localVideoSize\nThời lượng: $localVideoDuration\nNgày thêm: $localVideoDate\nĐường dẫn:\n$url"
            } else if (isDailymotion) {
                val desc = intent.getStringExtra("description") ?: ""
                val author = intent.getStringExtra("author") ?: "Dailymotion"
                this.description = "Tác giả: $author\n\n$desc"
            }
            userAgent = intent.getStringExtra("user_agent")
            referrer = intent.getStringExtra("referrer")
            origin = intent.getStringExtra("origin")
            drmLicenseType = intent.getStringExtra("drm_type")
            drmLicenseKey = intent.getStringExtra("drm_key")
            drmUuid = intent.getStringExtra("drm_uuid")
            manifestType = intent.getStringExtra("manifest_type")
            playlistUrl = intent.getStringExtra("playlist_url")
            catchupSource = intent.getStringExtra("catchup_source")
            catchupType = intent.getStringExtra("catchup_type")
            catchupDays = intent.getStringExtra("catchup_days")
            hasCatchup = intent.getBooleanExtra("has_catchup", false)
            channelGroup = intent.getStringExtra("group_title")
        }

        txtChannelName.text = title
        popupChannelName.text = title

        if (isLocalVideo || isDailymotion) {
            val infoStr = if (isLocalVideo) "$localVideoSize • $localVideoDuration" else (intent.getStringExtra("author") ?: "Dailymotion")
            txtStreamInfo.text = infoStr
            popupStreamInfo.text = infoStr
            txtProgramTitle.text = title
            popupProgramTitle.text = title
        }

        if (!logoUrl.isNullOrEmpty()) {
            Glide.with(this).load(logoUrl).placeholder(R.mipmap.app_logo).error(R.mipmap.app_logo).into(imgChannelLogo)
            Glide.with(this).load(logoUrl).placeholder(R.mipmap.app_logo).error(R.mipmap.app_logo).into(popupChannelLogo)
        } else {
            imgChannelLogo.setImageResource(R.mipmap.app_logo)
            popupChannelLogo.setImageResource(R.mipmap.app_logo)
        }
    }

    private fun setupListeners() {
        btnNavBack.setOnClickListener {
            if (isFullscreen) {
                toggleFullscreen(false)
            } else {
                finish()
            }
        }

        if (isLocalVideo || isDailymotion) {
            txtNavList.text = "Danh sách"
            txtNavSchedule.text = "Mô tả"
            iconNavSchedule.setImageResource(R.drawable.ic_about)
        }

        btnNavList.setOnClickListener { showChannelsTab() }

        btnNavSchedule.setOnClickListener { showScheduleTab() }

        btnNavFullscreen.setOnClickListener {
            toggleFullscreen(!isFullscreen)
        }

        btnNavSettings.setOnClickListener {
            showVideoSettingsDialog()
        }
    }

    private fun showChannelsTab() {
        layoutChannelsTabContainer.visibility = View.VISIBLE
        layoutEpgTabContainer.visibility = View.GONE

        iconNavList.setColorFilter(Color.parseColor("#FF9800"))
        txtNavList.setTextColor(Color.parseColor("#FF9800"))

        iconNavSchedule.setColorFilter(Color.parseColor("#888888"))
        txtNavSchedule.setTextColor(Color.parseColor("#888888"))
    }

    private fun showScheduleTab() {
        layoutChannelsTabContainer.visibility = View.GONE
        layoutEpgTabContainer.visibility = View.VISIBLE

        iconNavSchedule.setColorFilter(Color.parseColor("#FF9800"))
        txtNavSchedule.setTextColor(Color.parseColor("#FF9800"))

        iconNavList.setColorFilter(Color.parseColor("#888888"))
        txtNavList.setTextColor(Color.parseColor("#888888"))

        refreshEpgList()
    }

    private fun setupOverlayControls() {
        val showOverlay = {
            if (overlayPlayerControls.visibility == View.VISIBLE) {
                overlayPlayerControls.visibility = View.GONE
                handler.removeCallbacks(hideOverlayRunnable)
            } else {
                overlayPlayerControls.visibility = View.VISIBLE
                handler.removeCallbacks(hideOverlayRunnable)
                handler.postDelayed(hideOverlayRunnable, 4000)
                
                // Adjust visibility based on orientation
                if (isFullscreen) {
                    topActionButtons.visibility = View.VISIBLE
                    btnOverlayBackFullscreen.visibility = View.VISIBLE
                    btnOverlayEnterFullscreen.visibility = View.GONE
                    channelInfoPopup.visibility = View.VISIBLE
                } else {
                    topActionButtons.visibility = View.GONE
                    btnOverlayBackFullscreen.visibility = View.GONE
                    btnOverlayEnterFullscreen.visibility = View.VISIBLE
                    channelInfoPopup.visibility = View.GONE
                }
            }
        }

        playerVideoContainer.setOnClickListener { showOverlay() }
        playerSurface.setOnClickListener { showOverlay() }

        channelsOverlayDim.setOnClickListener { hideFullscreenOverlays() }
        btnCloseChannelsOverlay.setOnClickListener { hideFullscreenOverlays() }

        epgOverlayDim.setOnClickListener { hideFullscreenOverlays() }
        btnCloseEpgOverlay.setOnClickListener { hideFullscreenOverlays() }

        btnOverlaySettings.setOnClickListener {
            showVideoSettingsDialog()
        }

        btnOverlayChannels.setOnClickListener {
            if (isFullscreen) {
                showChannelsOverlay()
            } else {
                showChannelsTab()
            }
        }

        btnOverlayEpg.setOnClickListener {
            if (isFullscreen) {
                showEpgOverlay()
            } else {
                showScheduleTab()
            }
        }
        
        btnOverlayBackFullscreen.setOnClickListener {
            if (isLocalVideo) {
                finish()
            } else {
                toggleFullscreen(false)
            }
        }
        
        btnOverlayEnterFullscreen.setOnClickListener {
            toggleFullscreen(true)
        }

        btnPlayPause.setOnClickListener {
            val p = player ?: return@setOnClickListener
            if (p.isPlaying) {
                p.pause()
                btnPlayPause.setImageResource(R.drawable.ic_play_circle)
            } else {
                p.play()
                btnPlayPause.setImageResource(R.drawable.ic_pause_circle)
            }
        }
    }

    private fun showChannelsOverlay() {
        fullscreenEpgOverlay.visibility = View.GONE
        fullscreenChannelsOverlay.visibility = View.VISIBLE
        overlayPlayerControls.visibility = View.GONE
        handler.removeCallbacks(hideOverlayRunnable)

        val playingIndex = displayedChannels.indexOfFirst { it.url == activeChannelUrl || it.name == video?.title }
        if (playingIndex >= 0) {
            recyclerOverlayChannels.post {
                (recyclerOverlayChannels.layoutManager as? LinearLayoutManager)?.scrollToPositionWithOffset(maxOf(0, playingIndex - 2), 0)
                recyclerOverlayChannels.findViewHolderForAdapterPosition(playingIndex)?.itemView?.requestFocus() ?: recyclerOverlayChannels.requestFocus()
            }
        } else {
            recyclerOverlayChannels.requestFocus()
        }
    }

    private fun showEpgOverlay() {
        fullscreenChannelsOverlay.visibility = View.GONE
        fullscreenEpgOverlay.visibility = View.VISIBLE
        overlayPlayerControls.visibility = View.GONE
        handler.removeCallbacks(hideOverlayRunnable)

        val title = video?.title?.replace("[Xem lại] ", "") ?: "LỊCH PHÁT SÓNG"
        overlayEpgHeaderChannel.text = title
        val logoUrl = video?.logoUrl
        if (!logoUrl.isNullOrEmpty()) {
            overlayEpgHeaderLogo.visibility = View.VISIBLE
            Glide.with(this).load(logoUrl).placeholder(R.mipmap.app_logo).error(R.mipmap.app_logo).into(overlayEpgHeaderLogo)
        } else {
            overlayEpgHeaderLogo.visibility = View.VISIBLE
            overlayEpgHeaderLogo.setImageResource(R.mipmap.app_logo)
        }

        if (isCatchupMode) {
            overlayEpgHeaderLiveBadge.visibility = View.VISIBLE
            overlayEpgHeaderLiveBadge.text = "DVR"
            overlayEpgHeaderLiveBadge.setBackgroundColor(Color.parseColor("#2196F3"))
        } else {
            overlayEpgHeaderLiveBadge.visibility = View.VISIBLE
            overlayEpgHeaderLiveBadge.text = "● LIVE"
            overlayEpgHeaderLiveBadge.setBackgroundColor(Color.parseColor("#CC0000"))
        }

        refreshEpgList()
        recyclerOverlayEpg.post {
            recyclerOverlayEpg.requestFocus()
        }
    }

    private fun hideFullscreenOverlays() {
        fullscreenChannelsOverlay.visibility = View.GONE
        fullscreenEpgOverlay.visibility = View.GONE
    }

    private fun toggleFullscreen(enable: Boolean) {
        isFullscreen = enable
        if (enable) {
            requestedOrientation = if (isVerticalVideo) {
                ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
            } else {
                ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
            }
            channelInfoContainer.visibility = View.GONE
            contentArea.visibility = View.GONE
            bottomNavContainer.visibility = View.GONE

            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = (
                View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            )

            val params = playerVideoContainer.layoutParams as androidx.constraintlayout.widget.ConstraintLayout.LayoutParams
            params.height = androidx.constraintlayout.widget.ConstraintLayout.LayoutParams.MATCH_PARENT
            params.dimensionRatio = null
            playerVideoContainer.layoutParams = params
        } else {
            hideFullscreenOverlays()
            overlayPlayerControls.visibility = View.GONE
            channelInfoPopup.visibility = View.GONE
            handler.removeCallbacks(hideOverlayRunnable)

            requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
            channelInfoContainer.visibility = View.VISIBLE
            contentArea.visibility = View.VISIBLE
            bottomNavContainer.visibility = View.VISIBLE

            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_VISIBLE

            val params = playerVideoContainer.layoutParams as androidx.constraintlayout.widget.ConstraintLayout.LayoutParams
            params.height = 0
            params.dimensionRatio = "16:9"
            playerVideoContainer.layoutParams = params
        }
    }

    override fun onBackPressed() {
        when {
            fullscreenChannelsOverlay.visibility == View.VISIBLE -> {
                fullscreenChannelsOverlay.visibility = View.GONE
            }
            fullscreenEpgOverlay.visibility == View.VISIBLE -> {
                fullscreenEpgOverlay.visibility = View.GONE
            }
            overlayPlayerControls.visibility == View.VISIBLE -> {
                overlayPlayerControls.visibility = View.GONE
                handler.removeCallbacks(hideOverlayRunnable)
            }
            isFullscreen -> {
                if (isLocalVideo) {
                    super.onBackPressed()
                } else {
                    toggleFullscreen(false)
                }
            }
            else -> {
                super.onBackPressed()
            }
        }
    }

    private fun updateEpgInfo() {
        val currentTitle = video?.title ?: ""
        val targetTvgId = tvgId ?: currentTitle

        val program = if (isCatchupMode && catchupProgram != null) catchupProgram else EpgManager.getInstance().getCurrentProgram(targetTvgId, currentTitle)
        if (program != null && !program.title.isNullOrEmpty()) {
            txtProgramTitle.visibility = View.VISIBLE
            txtProgramTitle.text = program.title

            val timeFormat = SimpleDateFormat("HH:mm", Locale.getDefault())
            txtStartTime.visibility = View.VISIBLE
            txtStartTime.text = timeFormat.format(program.startTime)

            txtStopTime.visibility = View.VISIBLE
            txtStopTime.text = timeFormat.format(program.stopTime)

            epgProgressBar.visibility = View.VISIBLE
            playerEpgTimeBar.visibility = View.VISIBLE
            epgProgressBar.progress = if (program.isCurrent() || isCatchupMode) program.getProgress() else 0
            
            infoLiveBadge.visibility = View.VISIBLE
            if (isCatchupMode) {
                infoLiveBadge.text = "DVR"
                infoLiveBadge.setBackgroundColor(Color.parseColor("#2196F3"))
            } else {
                infoLiveBadge.text = "LIVE"
                infoLiveBadge.setBackgroundColor(Color.parseColor("#CC0000"))
            }
            popupProgramTitle.visibility = View.VISIBLE
            popupProgramTitle.text = if (isCatchupMode) "[Xem lại] ${program.title}" else program.title
            
            popupStartTime.visibility = View.VISIBLE
            popupStartTime.text = timeFormat.format(program.startTime)

            popupStopTime.visibility = View.VISIBLE
            popupStopTime.text = timeFormat.format(program.stopTime)

            if (!isVodTimelineVisible) {
                popupTimelineLayout.visibility = View.VISIBLE
            }
            popupProgressBar.progress = if (program.isCurrent() || isCatchupMode) program.getProgress() else 0
            
            popupLiveBadge.visibility = View.VISIBLE
            if (isCatchupMode) {
                popupLiveBadge.text = "DVR"
                popupLiveBadge.setBackgroundColor(Color.parseColor("#2196F3"))
            } else {
                popupLiveBadge.text = "LIVE"
                popupLiveBadge.setBackgroundColor(Color.parseColor("#CC0000"))
            }
        } else {
            txtProgramTitle.visibility = View.GONE
            txtStartTime.visibility = View.GONE
            txtStopTime.visibility = View.GONE
            epgProgressBar.visibility = View.GONE
            playerEpgTimeBar.visibility = View.GONE
            infoLiveBadge.visibility = View.GONE
            
            popupProgramTitle.visibility = View.GONE
            popupTimelineLayout.visibility = View.GONE
            popupLiveBadge.visibility = View.GONE
        }
    }

    private fun updateVodTimeline() {
        val p = player ?: return
        if (!isVodTimelineVisible) return

        val duration = p.duration
        val position = p.currentPosition

        if (duration <= 0) return

        val timeCurrentStr = formatTime(position)
        val timeTotalStr = formatTime(duration)

        popupVodCurrentTime.text = timeCurrentStr
        popupVodTotalTime.text = timeTotalStr
        infoVodCurrentTime.text = timeCurrentStr
        infoVodTotalTime.text = timeTotalStr

        val progress = ((position * 1000f) / duration).toInt().coerceIn(0, 1000)
        popupVodProgressBar.progress = progress
        infoVodProgressBar.progress = progress
    }

    private fun formatTime(ms: Long): String {
        val totalSeconds = ms / 1000
        val hours = totalSeconds / 3600
        val minutes = (totalSeconds % 3600) / 60
        val seconds = totalSeconds % 60

        return if (hours > 0) {
            String.format(Locale.US, "%d:%02d:%02d", hours, minutes, seconds)
        } else {
            String.format(Locale.US, "%02d:%02d", minutes, seconds)
        }
    }
    private fun updateStreamInfo() {
        val info = player?.streamInfoString
        if (!info.isNullOrEmpty()) {
            txtStreamInfo.text = info
            txtStreamInfo.visibility = View.VISIBLE
            popupStreamInfo.text = info
            popupStreamInfo.visibility = View.VISIBLE
        } else {
            txtStreamInfo.visibility = View.GONE
            popupStreamInfo.visibility = View.GONE
        }
    }

    private fun loadLocalVideosAsChannels(): List<M3uSource> {
        val list = ArrayList<M3uSource>()
        val projection = arrayOf(
            android.provider.MediaStore.Video.Media._ID,
            android.provider.MediaStore.Video.Media.DISPLAY_NAME,
            android.provider.MediaStore.Video.Media.SIZE,
            android.provider.MediaStore.Video.Media.DATA,
            android.provider.MediaStore.Video.Media.DURATION,
            android.provider.MediaStore.Video.Media.DATE_ADDED
        )

        try {
            contentResolver.query(
                android.provider.MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
                projection,
                null,
                null,
                "${android.provider.MediaStore.Video.Media.DATE_ADDED} DESC"
            )?.use { cursor ->
                val idCol = cursor.getColumnIndexOrThrow(android.provider.MediaStore.Video.Media._ID)
                val nameCol = cursor.getColumnIndexOrThrow(android.provider.MediaStore.Video.Media.DISPLAY_NAME)
                val sizeCol = cursor.getColumnIndexOrThrow(android.provider.MediaStore.Video.Media.SIZE)
                val dataCol = cursor.getColumnIndexOrThrow(android.provider.MediaStore.Video.Media.DATA)
                val durCol = cursor.getColumnIndexOrThrow(android.provider.MediaStore.Video.Media.DURATION)
                val dateCol = cursor.getColumnIndexOrThrow(android.provider.MediaStore.Video.Media.DATE_ADDED)

                while (cursor.moveToNext()) {
                    val name = cursor.getString(nameCol) ?: "Video"
                    val dataPath = cursor.getString(dataCol) ?: ""
                    
                    val sizeMb = cursor.getLong(sizeCol) / (1024.0 * 1024.0)
                    val sizeFormatted = if (sizeMb >= 1024) String.format("%.2f GB", sizeMb / 1024.0) else String.format("%.1f MB", sizeMb)
                    
                    val totalSecs = cursor.getLong(durCol) / 1000
                    val durFormatted = String.format("%02d:%02d", totalSecs / 60, totalSecs % 60)
                    
                    val dateAdded = cursor.getLong(dateCol)
                    val sdf = java.text.SimpleDateFormat("dd/MM/yyyy HH:mm", java.util.Locale.getDefault())
                    val dateStr = sdf.format(java.util.Date(dateAdded * 1000L))

                    val src = M3uSource()
                    src.name = name
                    src.url = dataPath
                    src.groupTitle = "Local Videos"
                    src.description = "Dung lượng: $sizeFormatted\nThời lượng: $durFormatted\nNgày thêm: $dateStr\nĐường dẫn:\n$dataPath"
                    list.add(src)
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        return list
    }

    private fun setupChannelsList() {
        recyclerChannels.layoutManager = LinearLayoutManager(this)
        recyclerOverlayChannels.layoutManager = LinearLayoutManager(this)
        val loaded = if (isLocalVideo) loadLocalVideosAsChannels() else M3uCache(this).loadChannels()
        allChannels.clear()
        allChannels.addAll(loaded)

        // Focus on currently playing category
        if (video?.channelGroup != null) {
            val group = video!!.channelGroup
            if (allChannels.any { it.groupTitle == group }) {
                selectedCategory = group!!
            }
        }
        
        buildCategoryChips()

        channelAdapter = PlayerChannelAdapter(displayedChannels, { ch ->
            playSelectedChannel(ch)
            if (isFullscreen) hideFullscreenOverlays()
        }, { ch ->
            showChannelOptionsDialog(ch)
        })
        recyclerChannels.adapter = channelAdapter
        recyclerOverlayChannels.adapter = channelAdapter

        // Swipe left/right gesture to switch channel groups
        val gestureDetector = android.view.GestureDetector(this, object : android.view.GestureDetector.SimpleOnGestureListener() {
            private val SWIPE_THRESHOLD = 120
            private val SWIPE_VELOCITY_THRESHOLD = 120

            override fun onFling(e1: android.view.MotionEvent?, e2: android.view.MotionEvent, velocityX: Float, velocityY: Float): Boolean {
                if (e1 == null) return false
                val diffX = e2.x - e1.x
                val diffY = e2.y - e1.y
                if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > SWIPE_THRESHOLD && Math.abs(velocityX) > SWIPE_VELOCITY_THRESHOLD) {
                    if (diffX < 0) {
                        switchCategory(1) // Swipe Left -> Next Category
                    } else {
                        switchCategory(-1) // Swipe Right -> Previous Category
                    }
                    return true
                }
                return false
            }
        })

        recyclerChannels.addOnItemTouchListener(object : RecyclerView.SimpleOnItemTouchListener() {
            override fun onInterceptTouchEvent(rv: RecyclerView, e: android.view.MotionEvent): Boolean {
                gestureDetector.onTouchEvent(e)
                return false
            }
        })

        filterChannelsByCategory()
    }

    private fun switchCategory(delta: Int) {
        if (categoriesList.isEmpty()) return
        val currentIndex = categoriesList.indexOf(selectedCategory)
        val newIndex = (currentIndex + delta).coerceIn(0, categoriesList.size - 1)
        if (newIndex != currentIndex) {
            val direction = if (delta > 0) -100f else 100f
            
            // Smooth swipe animation
            recyclerChannels.animate()
                .translationX(direction)
                .alpha(0f)
                .setDuration(150)
                .withEndAction {
                    selectedCategory = categoriesList[newIndex]
                    buildCategoryChips()
                    filterChannelsByCategory()
                    
                    recyclerChannels.translationX = -direction
                    recyclerChannels.animate()
                        .translationX(0f)
                        .alpha(1f)
                        .setDuration(150)
                        .start()
                }
                .start()
        }
    }

    private fun buildCategoryChips() {
        val groupsSet = LinkedHashSet<String>()
        val visibilityPrefs = com.liskovsoft.smartyoutubetv2.common.prefs.IptvChannelVisibilityPrefs.instance(this)
        val hiddenGroups = visibilityPrefs.getHiddenGroupNames()

        groupsSet.add("Tất cả")
        groupsSet.add("Yêu thích")

        for (ch in allChannels) {
            val group = ch.groupTitle
            if (!group.isNullOrEmpty() && !hiddenGroups.contains(group)) {
                groupsSet.add(group)
            }
        }

        categoriesList.clear()
        categoriesList.addAll(groupsSet)

        containerPlayerCategoryChips.removeAllViews()
        containerOverlayCategoryChips.removeAllViews()

        for (cat in categoriesList) {
            val isSelected = (cat == selectedCategory)

            containerPlayerCategoryChips.addView(createCategoryChipView(cat, isSelected))
            containerOverlayCategoryChips.addView(createCategoryChipView(cat, isSelected))
        }
    }

    private fun createCategoryChipView(cat: String, isSelected: Boolean): View {
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(28, 14, 28, 8)
            isClickable = true
            isFocusable = true

            val txtCategory = TextView(context).apply {
                text = cat
                textSize = 15f
                typeface = android.graphics.Typeface.DEFAULT_BOLD
                setTextColor(Color.parseColor(if (isSelected) "#FF9800" else "#FFFFFF"))
            }
            addView(txtCategory)

            val indicatorLine = View(context).apply {
                val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 4)
                lp.topMargin = 6
                layoutParams = lp

                background = GradientDrawable().apply {
                    cornerRadius = 2f
                    setColor(if (isSelected) Color.parseColor("#FF9800") else Color.TRANSPARENT)
                }
            }
            addView(indicatorLine)

            setOnClickListener {
                selectedCategory = cat
                buildCategoryChips()
                filterChannelsByCategory()
            }
        }
    }

    private fun filterChannelsByCategory() {
        val favs = IptvFavoritesStore.instance(this).load()
        val favKeys = favs.mapNotNull { it.tvgId ?: it.title }.toSet()
        val visibilityPrefs = com.liskovsoft.smartyoutubetv2.common.prefs.IptvChannelVisibilityPrefs.instance(this)
        val hiddenChannels = visibilityPrefs.getHiddenChannelUrls()
        val hiddenGroups = visibilityPrefs.getHiddenGroupNames()

        displayedChannels.clear()
        for (ch in allChannels) {
            val url = ch.url
            val tvgId = ch.tvgId
            val group = ch.groupTitle

            if (url != null && hiddenChannels.contains(url)) continue
            if (tvgId != null && hiddenChannels.contains(tvgId)) continue
            if (group != null && hiddenGroups.contains(group) && selectedCategory != group) continue

            val isFav = favKeys.contains(ch.tvgId) || favKeys.contains(ch.name)
            val matches = when (selectedCategory) {
                "Tất cả" -> true
                "Yêu thích" -> isFav
                else -> ch.groupTitle.equals(selectedCategory, ignoreCase = true)
            }
            if (matches) {
                displayedChannels.add(ch)
            }
        }
        channelAdapter?.notifyDataSetChanged()

        // Auto scroll to currently playing channel position
        val playingIndex = displayedChannels.indexOfFirst { it.url == activeChannelUrl || it.name == video?.title }
        if (playingIndex >= 0) {
            recyclerChannels.post {
                (recyclerChannels.layoutManager as? LinearLayoutManager)?.scrollToPositionWithOffset(maxOf(0, playingIndex - 2), 0)
            }
            recyclerOverlayChannels.post {
                (recyclerOverlayChannels.layoutManager as? LinearLayoutManager)?.scrollToPositionWithOffset(maxOf(0, playingIndex - 2), 0)
            }
        }
    }

    private fun playSelectedChannel(ch: M3uSource) {
        val url = ch.url ?: return
        tvgId = ch.tvgId ?: ch.name
        activeChannelUrl = url
        
        isCatchupMode = false
        catchupProgram = null
        epgAdapter?.catchupStartTime = null

        val newVideo = Video().apply {
            videoUrl = url
            title = ch.name ?: url
            isIptv = true
            logoUrl = ch.getEffectiveLogoUrl()
            this.tvgId = ch.tvgId
            this.description = ch.description
            userAgent = ch.userAgent
            referrer = ch.referrer
            origin = ch.origin
            drmLicenseType = ch.drmLicenseType
            drmLicenseKey = ch.drmLicenseKey
            drmUuid = ch.drmUuid
            manifestType = ch.manifestType
            playlistUrl = ch.playlistSource
            catchupSource = ch.catchupSource
            catchupType = ch.catchupType
            catchupDays = ch.catchupDays
            hasCatchup = !ch.catchupSource.isNullOrEmpty() || !ch.catchupDays.isNullOrEmpty()
            channelGroup = ch.groupTitle
        }
        this.video = newVideo

        txtChannelName.text = newVideo.title
        popupChannelName.text = newVideo.title

        if (isLocalVideo) {
            val lines = newVideo.description?.split("\n") ?: emptyList()
            val size = lines.find { it.startsWith("Dung lượng:") }?.removePrefix("Dung lượng: ")?.trim() ?: ""
            val dur = lines.find { it.startsWith("Thời lượng:") }?.removePrefix("Thời lượng: ")?.trim() ?: ""
            val localInfo = "$size • $dur"
            txtStreamInfo.text = localInfo
            popupStreamInfo.text = localInfo
            txtProgramTitle.text = newVideo.title
            popupProgramTitle.text = newVideo.title
        }

        val logoUrl = newVideo.logoUrl
        if (!logoUrl.isNullOrEmpty()) {
            Glide.with(this).load(logoUrl).placeholder(R.mipmap.app_logo).error(R.mipmap.app_logo).into(imgChannelLogo)
            Glide.with(this).load(logoUrl).placeholder(R.mipmap.app_logo).error(R.mipmap.app_logo).into(popupChannelLogo)
        } else {
            imgChannelLogo.setImageResource(R.mipmap.app_logo)
            popupChannelLogo.setImageResource(R.mipmap.app_logo)
        }

        playerLoadingProgress.visibility = View.VISIBLE
        player?.play(newVideo, playerSurface, null)

        channelAdapter?.notifyDataSetChanged()

        updateEpgInfo()
        refreshEpgList()
    }

    private fun setupEpgList() {
        recyclerEpg.layoutManager = LinearLayoutManager(this)
        recyclerOverlayEpg.layoutManager = LinearLayoutManager(this)
        val hasCatchup = video?.hasCatchup == true || !video?.catchupSource.isNullOrEmpty()
        epgAdapter = MobileEpgAdapter(
            programs = emptyList(),
            hasCatchup = hasCatchup,
            onCatchupClick = { program ->
                onEpgProgramClicked(program)
                if (isFullscreen) hideFullscreenOverlays()
            }
        )
        recyclerEpg.adapter = epgAdapter
        recyclerOverlayEpg.adapter = epgAdapter
    }

    private fun refreshEpgList() {
        val id = tvgId
        val title = video?.title?.replace("[Xem lại] ", "")
        val hasCatchup = video?.hasCatchup == true || !video?.catchupSource.isNullOrEmpty() || isCatchupMode
        var programs = EpgManager.getInstance().getPrograms(id, title)

        // Inject fallback movie info if programs is empty and we have a video description
        if (programs.isEmpty() && video?.description != null) {
            val now = Date()
            val start = Date(now.time - 3600000)
            val stop = Date(now.time + 3600000)
            programs = listOf(
                EpgProgram(video?.title ?: "Thông tin phim", start, stop, video?.description, "movie_info")
            )
        }

        if (programs.isNotEmpty()) {
            epgAdapter?.updatePrograms(programs, hasCatchup)
            val currentIndex = programs.indexOfFirst { program -> 
                if (isCatchupMode && catchupProgram != null) program.startTime == catchupProgram?.startTime else program.isCurrent() 
            }
            if (currentIndex >= 0) {
                recyclerEpg.post {
                    (recyclerEpg.layoutManager as? LinearLayoutManager)?.scrollToPositionWithOffset(maxOf(0, currentIndex - 2), 0)
                }
                recyclerOverlayEpg.post {
                    (recyclerOverlayEpg.layoutManager as? LinearLayoutManager)?.scrollToPositionWithOffset(maxOf(0, currentIndex - 2), 0)
                }
            }
        } else {
            epgAdapter?.updatePrograms(emptyList(), hasCatchup)
        }
    }

    private fun onEpgProgramClicked(program: EpgProgram) {
        val currentVideo = video ?: return
        val now = Date()
        val isCurrent = program.isCurrent()

        var startMs = program.startTime.time
        var stopMs = program.stopTime.time
        if (stopMs <= startMs) {
            stopMs += 86400000L
        }

        val isPast = !isCurrent && stopMs < now.time
        val isFuture = !isCurrent && !isPast

        when {
            isFuture -> {
                // Do nothing
            }
            isCurrent -> {
                if (isCatchupMode) {
                    exitCatchupMode()
                } else {
                    // Do nothing
                }
            }
            isPast -> {
                val catchupTemplate = currentVideo.catchupSource
                if (!catchupTemplate.isNullOrEmpty() || currentVideo.hasCatchup || isCatchupMode) {
                    openCatchupPlayback(program)
                } else {
                    // Do nothing
                }
            }
        }
    }

    private fun exitCatchupMode() {
        if (!isCatchupMode) return
        isCatchupMode = false
        catchupProgram = null
        epgAdapter?.catchupStartTime = null

        val currentVideo = video ?: return
        val origUrl = currentVideo.playlistUrl ?: currentVideo.videoUrl
        val origTitle = currentVideo.title?.replace("[Xem lại] ", "") ?: "Kênh Live"
        
        val matchedChannel = allChannels.find { 
            (it.url != null && it.url == origUrl) || 
            (it.tvgId != null && it.tvgId == currentVideo.tvgId) || 
            (it.name != null && it.name == origTitle) 
        } ?: M3uSource(
            name = origTitle,
            url = origUrl,
            tvgId = currentVideo.tvgId,
            catchupSource = currentVideo.catchupSource,
            catchupType = currentVideo.catchupType,
            catchupDays = currentVideo.catchupDays
        )

        playSelectedChannel(matchedChannel)
    }

    private fun openCatchupPlayback(program: EpgProgram) {
        val currentVideo = video ?: return
        val catchupTemplate = currentVideo.catchupSource
        if (catchupTemplate.isNullOrEmpty()) {
            Toast.makeText(this, "Kênh không hỗ trợ xem lại", Toast.LENGTH_SHORT).show()
            return
        }

        val startUnix = program.startTime.time / 1000L
        var duration = (program.stopTime.time - program.startTime.time) / 1000L
        if (duration <= 0) duration = 3600L
        val builder = CatchupUrlBuilder(startUnix, duration)
        val catchupUrl = builder.build(catchupTemplate)

        isCatchupMode = true
        catchupProgram = program
        epgAdapter?.catchupStartTime = program.startTime

        val catchupVideo = Video().apply {
            videoUrl = catchupUrl
            title = program.title
            isIptv = true
            this.tvgId = currentVideo.tvgId
            userAgent = currentVideo.userAgent
            referrer = currentVideo.referrer
            origin = currentVideo.origin
            drmLicenseType = currentVideo.drmLicenseType
            drmLicenseKey = currentVideo.drmLicenseKey
            drmUuid = currentVideo.drmUuid
            manifestType = currentVideo.manifestType
            playlistUrl = currentVideo.playlistUrl ?: currentVideo.videoUrl
            catchupSource = currentVideo.catchupSource
            catchupType = currentVideo.catchupType
            catchupDays = currentVideo.catchupDays
            hasCatchup = currentVideo.hasCatchup
        }

        playerLoadingProgress.visibility = View.VISIBLE
        player?.play(catchupVideo, playerSurface, null)
        
        refreshEpgList()
    }

    private fun showVideoSettingsDialog() {
        val p = player ?: return
        val dialog = android.app.Dialog(this, android.R.style.Theme_DeviceDefault_NoActionBar)
        dialog.requestWindowFeature(android.view.Window.FEATURE_NO_TITLE)

        val dialogView = layoutInflater.inflate(R.layout.dialog_video_settings, null)
        dialog.setContentView(dialogView)

        dialog.window?.let { w ->
            w.setLayout((resources.displayMetrics.widthPixels * 0.85f).toInt(), android.view.WindowManager.LayoutParams.WRAP_CONTENT)
            w.setBackgroundDrawableResource(android.R.color.transparent)
            w.setGravity(Gravity.CENTER)
        }

        dialogView.findViewById<View>(R.id.btn_settings_close)?.setOnClickListener { dialog.dismiss() }

        val containerQuality = dialogView.findViewById<LinearLayout>(R.id.container_quality)
        if (containerQuality != null) {
            containerQuality.removeAllViews()
            val dp = resources.displayMetrics.density

            // 1. CHẤT LƯỢNG / ĐỘ PHÂN GIẢI
            val headerQuality = TextView(this).apply {
                text = "CHẤT LƯỢNG"
                setTextColor(Color.parseColor("#FFA500"))
                textSize = 16f
                setPadding(0, (16 * dp).toInt(), 0, (8 * dp).toInt())
            }
            containerQuality.addView(headerQuality)

            val tracks = p.videoTracks
            if (tracks.isNullOrEmpty()) {
                val noTracks = TextView(this).apply {
                    text = "Tự động"
                    setTextColor(Color.parseColor("#66FFFFFF"))
                    textSize = 14f
                    setPadding((16 * dp).toInt(), (8 * dp).toInt(), (16 * dp).toInt(), (8 * dp).toInt())
                }
                containerQuality.addView(noTracks)
            } else {
                var noTrackSelected = true
                for (t in tracks) {
                    if (t.isSelected) {
                        noTrackSelected = false
                        break
                    }
                }
                addResolutionRow(containerQuality, dp, "Tự động", -1, -1, noTrackSelected, dialog, p)

                for (track in tracks) {
                    addResolutionRow(containerQuality, dp, track.label, track.groupIndex, track.trackIndex, track.isSelected, dialog, p)
                }
            }

            // 2. KÊNH ÂM THANH
            val audioTracks = p.audioTracks
            if (!audioTracks.isNullOrEmpty()) {
                val headerAudio = TextView(this).apply {
                    text = "ÂM THANH"
                    setTextColor(Color.parseColor("#FFA500"))
                    textSize = 16f
                    setPadding(0, (16 * dp).toInt(), 0, (8 * dp).toInt())
                }
                containerQuality.addView(headerAudio)

                var noAudioSelected = true
                for (t in audioTracks) {
                    if (t.isSelected) {
                        noAudioSelected = false
                        break
                    }
                }
                addAudioRow(containerQuality, dp, "Tự động", -1, -1, noAudioSelected, dialog, p)

                for (track in audioTracks) {
                    addAudioRow(containerQuality, dp, track.label, track.groupIndex, track.trackIndex, track.isSelected, dialog, p)
                }
            }

            // 3. TỐC ĐỘ PHÁT
            val headerSpeed = TextView(this).apply {
                text = "TỐC ĐỘ PHÁT"
                setTextColor(Color.parseColor("#FFA500"))
                textSize = 16f
                setPadding(0, (16 * dp).toInt(), 0, (8 * dp).toInt())
            }
            containerQuality.addView(headerSpeed)

            val currentSpeed = p.getPlaybackSpeed()
            val speedLabel = TextView(this).apply {
                text = String.format(Locale.US, "%.2fx", currentSpeed)
                setTextColor(Color.WHITE)
                textSize = 22f
                typeface = android.graphics.Typeface.DEFAULT_BOLD
                gravity = Gravity.CENTER
                setPadding(0, (8 * dp).toInt(), 0, (4 * dp).toInt())
            }
            containerQuality.addView(speedLabel)

            val seekBar = SeekBar(this).apply {
                max = 35
                progress = Math.max(0, Math.min(Math.round((currentSpeed - 0.25f) / 0.05f), 35))
                val padH = (16 * dp).toInt()
                setPadding(padH, (8 * dp).toInt(), padH, (4 * dp).toInt())
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                )
            }

            val presets = floatArrayOf(0.25f, 0.5f, 0.75f, 1.0f, 1.25f, 1.5f, 1.75f, 2.0f)
            val snapThreshold = 0.03f

            seekBar.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                override fun onProgressChanged(sb: SeekBar, progress: Int, fromUser: Boolean) {
                    if (!fromUser) return
                    var rawSpeed = 0.25f + progress * 0.05f
                    for (preset in presets) {
                        if (Math.abs(rawSpeed - preset) < snapThreshold) {
                            rawSpeed = preset
                            break
                        }
                    }
                    speedLabel.text = String.format(Locale.US, "%.2fx", rawSpeed)
                    p.setPlaybackSpeed(rawSpeed)
                }

                override fun onStartTrackingTouch(sb: SeekBar) {}
                override fun onStopTrackingTouch(sb: SeekBar) {}
            })
            containerQuality.addView(seekBar)
            
            // 4. TỶ LỆ HIỂN THỊ
            val ratioHeader = TextView(this).apply {
                text = "TỈ LỆ HIỂN THỊ"
                setTextColor(Color.parseColor("#FFA500"))
                textSize = 16f
                setPadding(0, (16 * dp).toInt(), 0, (8 * dp).toInt())
            }
            containerQuality.addView(ratioHeader)

            val ratioLabels = arrayOf("Tự động", "Fit", "Fill", "Zoom")
            val ratioModes = intArrayOf(-1, 0, 3, 4) // mapping to AndroidX AspectRatio modes roughly if needed
            
            val ratioRow = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER
                setPadding(0, 0, 0, (4 * dp).toInt())
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                )
            }

            for (i in ratioLabels.indices) {
                val mode = ratioModes[i]
                val label = ratioLabels[i]
                val chip = TextView(this).apply {
                    text = label
                    setTextColor(Color.WHITE)
                    textSize = 13f
                    gravity = Gravity.CENTER
                    val chipH = (32 * dp).toInt()
                    layoutParams = LinearLayout.LayoutParams(0, chipH, 1f).apply {
                        marginEnd = (6 * dp).toInt()
                    }
                    setBackgroundResource(R.drawable.bg_chip)
                    // Level handling could be added here if we track current mode
                    setOnClickListener {
                        p.setUserResizeMode(mode)
                        Toast.makeText(this@MobileIptvPlayerActivity, "Tỉ lệ: $label", Toast.LENGTH_SHORT).show()
                        dialog.dismiss()
                    }
                }
                ratioRow.addView(chip)
            }
            containerQuality.addView(ratioRow)

            // 5. XOAY
            val rotateHeader = TextView(this).apply {
                text = "XOAY"
                setTextColor(Color.parseColor("#FFA500"))
                textSize = 16f
                setPadding(0, (16 * dp).toInt(), 0, (8 * dp).toInt())
            }
            containerQuality.addView(rotateHeader)

            val rotations = intArrayOf(0, 90, 180, 270)
            val rotLabels = arrayOf("0°", "90°", "180°", "270°")

            val rotRow = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER
                setPadding(0, 0, 0, (4 * dp).toInt())
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                )
            }

            for (i in rotations.indices) {
                val rot = rotations[i]
                val label = rotLabels[i]
                val chip = TextView(this).apply {
                    text = label
                    setTextColor(Color.WHITE)
                    textSize = 13f
                    gravity = Gravity.CENTER
                    val chipH = (32 * dp).toInt()
                    layoutParams = LinearLayout.LayoutParams(0, chipH, 1f).apply {
                        marginEnd = (6 * dp).toInt()
                    }
                    setBackgroundResource(R.drawable.bg_chip)
                    setOnClickListener {
                        p.setRotationAngle(rot)
                        Toast.makeText(this@MobileIptvPlayerActivity, "Xoay: $label", Toast.LENGTH_SHORT).show()
                        dialog.dismiss()
                    }
                }
                rotRow.addView(chip)
            }
            containerQuality.addView(rotRow)

            // 6. LẬT NGANG
            val flipSwitchRow = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(0, (10 * dp).toInt(), 0, (10 * dp).toInt())
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                )
            }

            val flipLabel = TextView(this).apply {
                text = "Lật ngang"
                setTextColor(Color.WHITE)
                textSize = 14f
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            }
            flipSwitchRow.addView(flipLabel)

            val flipSwitch = android.widget.Switch(this).apply {
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                )
                setOnCheckedChangeListener { _, isChecked ->
                    p.setFlipHorizontal(isChecked)
                    Toast.makeText(this@MobileIptvPlayerActivity, if (isChecked) "Lật ngang: Bật" else "Lật ngang: Tắt", Toast.LENGTH_SHORT).show()
                }
            }
            flipSwitchRow.addView(flipSwitch)
            containerQuality.addView(flipSwitchRow)

            // 7. TĂNG ÂM LƯỢNG
            val volHeader = TextView(this).apply {
                text = "TĂNG ÂM LƯỢNG"
                setTextColor(Color.parseColor("#FFA500"))
                textSize = 16f
                setPadding(0, (16 * dp).toInt(), 0, (8 * dp).toInt())
            }
            containerQuality.addView(volHeader)

            val volLabel = TextView(this).apply {
                text = "100%"
                setTextColor(Color.WHITE)
                textSize = 22f
                typeface = android.graphics.Typeface.DEFAULT_BOLD
                gravity = Gravity.CENTER
                setPadding(0, (8 * dp).toInt(), 0, (4 * dp).toInt())
            }
            containerQuality.addView(volLabel)

            val volBar = SeekBar(this).apply {
                max = 40
                progress = 0
                val padH = (16 * dp).toInt()
                setPadding(padH, (8 * dp).toInt(), padH, (4 * dp).toInt())
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                )
                setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                    override fun onProgressChanged(sb: SeekBar, progress: Int, fromUser: Boolean) {
                        if (!fromUser) return
                        val boostPercent = 100 + progress * 5
                        volLabel.text = "$boostPercent%"
                        p.setVolumeBoost(boostPercent / 100f)
                    }

                    override fun onStartTrackingTouch(sb: SeekBar) {}
                    override fun onStopTrackingTouch(sb: SeekBar) {}
                })
            }
            containerQuality.addView(volBar)

            // 8. PHỤ ĐỀ & DỊCH
            val prefs = com.liskovsoft.smartyoutubetv2.common.prefs.M3uSourceManager.instance(this)
            val subHeader = TextView(this).apply {
                text = "PHỤ ĐỀ & DỊCH"
                setTextColor(Color.parseColor("#FFA500"))
                textSize = 16f
                setPadding(0, (16 * dp).toInt(), 0, (8 * dp).toInt())
            }
            containerQuality.addView(subHeader)

            // 8.1 Dịch phụ đề switch
            val translateRow = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(0, (8 * dp).toInt(), 0, (8 * dp).toInt())
                layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            }
            val translateLabel = TextView(this).apply {
                text = "Dịch phụ đề (ML Kit)"
                setTextColor(Color.WHITE)
                textSize = 14f
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            }
            translateRow.addView(translateLabel)

            val translateSwitch = android.widget.Switch(this).apply {
                isChecked = prefs.isMlKitTranslationEnabled()
                setOnCheckedChangeListener { _, isChecked ->
                    prefs.setMlKitTranslationEnabled(isChecked)
                    p.translator?.isEnabled = isChecked
                    p.applySubtitleStyle()
                    Toast.makeText(this@MobileIptvPlayerActivity, "Dịch phụ đề: " + (if (isChecked) "BẬT" else "TẮT"), Toast.LENGTH_SHORT).show()
                }
            }
            translateRow.addView(translateSwitch)
            containerQuality.addView(translateRow)

            // 8.2 Hiện phụ đề gốc switch
            val origSubRow = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(0, (8 * dp).toInt(), 0, (8 * dp).toInt())
                layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            }
            val origSubLabel = TextView(this).apply {
                text = "Hiện phụ đề gốc"
                setTextColor(Color.WHITE)
                textSize = 14f
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            }
            origSubRow.addView(origSubLabel)

            val origSubSwitch = android.widget.Switch(this).apply {
                isChecked = prefs.isOriginalSubtitleVisible()
                setOnCheckedChangeListener { _, isChecked ->
                    prefs.setOriginalSubtitleVisible(isChecked)
                    Toast.makeText(this@MobileIptvPlayerActivity, "Phụ đề gốc: " + (if (isChecked) "HIỆN" else "ẨN"), Toast.LENGTH_SHORT).show()
                }
            }
            origSubRow.addView(origSubSwitch)
            containerQuality.addView(origSubRow)

            // 8.3 Đọc phụ đề TTS switch & options
            val ttsOptionsContainer = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
                visibility = if (prefs.isTtsReadEnabled()) View.VISIBLE else View.GONE
            }

            val ttsRow = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(0, (8 * dp).toInt(), 0, (8 * dp).toInt())
                layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            }
            val ttsLabel = TextView(this).apply {
                text = "Đọc phụ đề (TTS)"
                setTextColor(Color.WHITE)
                textSize = 14f
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            }
            ttsRow.addView(ttsLabel)

            val ttsSwitch = android.widget.Switch(this).apply {
                isChecked = prefs.isTtsReadEnabled()
                setOnCheckedChangeListener { _, isChecked ->
                    prefs.setTtsReadEnabled(isChecked)
                    p.translator?.isReadEnabled = isChecked
                    ttsOptionsContainer.visibility = if (isChecked) View.VISIBLE else View.GONE
                    Toast.makeText(this@MobileIptvPlayerActivity, "Đọc phụ đề TTS: " + (if (isChecked) "BẬT" else "TẮT"), Toast.LENGTH_SHORT).show()
                }
            }
            ttsRow.addView(ttsSwitch)
            containerQuality.addView(ttsRow)

            // TTS Speed
            val initTtsSpeed = prefs.getTtsSpeechRate()
            val ttsSpeedLabel = TextView(this).apply {
                text = String.format(Locale.US, "Tốc độ đọc (TTS): %.2fx", initTtsSpeed)
                setTextColor(Color.parseColor("#FFA500"))
                textSize = 13f
                setPadding(0, (12 * dp).toInt(), 0, (4 * dp).toInt())
            }
            ttsOptionsContainer.addView(ttsSpeedLabel)

            val ttsSpeedBar = SeekBar(this).apply {
                max = 50 // (3.0 - 0.5) / 0.05
                progress = Math.round(Math.max(0f, Math.min(initTtsSpeed - 0.5f, 2.5f)) / 0.05f).toInt()
                setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                    override fun onProgressChanged(sb: SeekBar, progress: Int, fromUser: Boolean) {
                        if (!fromUser) return
                        val rate = 0.5f + progress * 0.05f
                        ttsSpeedLabel.text = String.format(Locale.US, "Tốc độ đọc (TTS): %.2fx", rate)
                        prefs.setTtsSpeechRate(rate)
                    }
                    override fun onStartTrackingTouch(sb: SeekBar) {}
                    override fun onStopTrackingTouch(sb: SeekBar) {}
                })
            }
            ttsOptionsContainer.addView(ttsSpeedBar)

            // TTS Volume
            val initTtsVolumePct = Math.round(prefs.getTtsVolume() * 100).toInt()
            val ttsVolumeLabel = TextView(this).apply {
                text = String.format(Locale.US, "Âm lượng đọc (TTS): %d%%", initTtsVolumePct)
                setTextColor(Color.parseColor("#FFA500"))
                textSize = 13f
                setPadding(0, (12 * dp).toInt(), 0, (4 * dp).toInt())
            }
            ttsOptionsContainer.addView(ttsVolumeLabel)

            val ttsVolumeBar = SeekBar(this).apply {
                max = 100
                progress = initTtsVolumePct
                setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                    override fun onProgressChanged(sb: SeekBar, progress: Int, fromUser: Boolean) {
                        if (!fromUser) return
                        ttsVolumeLabel.text = String.format(Locale.US, "Âm lượng đọc (TTS): %d%%", progress)
                        prefs.setTtsVolume(progress / 100f)
                    }
                    override fun onStartTrackingTouch(sb: SeekBar) {}
                    override fun onStopTrackingTouch(sb: SeekBar) {}
                })
            }
            ttsOptionsContainer.addView(ttsVolumeBar)
            containerQuality.addView(ttsOptionsContainer)

            // 8.4 Nền phụ đề
            val bgRow = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(0, (8 * dp).toInt(), 0, (8 * dp).toInt())
                layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            }
            val bgLabel = TextView(this).apply {
                text = "Nền phụ đề"
                setTextColor(Color.WHITE)
                textSize = 14f
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            }
            bgRow.addView(bgLabel)

            val bgSwitch = android.widget.Switch(this).apply {
                isChecked = prefs.isSubtitleBackgroundEnabled()
                setOnCheckedChangeListener { _, isChecked ->
                    prefs.setSubtitleBackgroundEnabled(isChecked)
                    p.applySubtitleStyle()
                    Toast.makeText(this@MobileIptvPlayerActivity, "Nền phụ đề: " + (if (isChecked) "CÓ" else "KHÔNG"), Toast.LENGTH_SHORT).show()
                }
            }
            bgRow.addView(bgSwitch)
            containerQuality.addView(bgRow)

            // 8.5 Màu phụ đề
            val colorHeader = TextView(this).apply {
                text = "Màu phụ đề"
                setTextColor(Color.parseColor("#FFA500"))
                textSize = 13f
                setPadding(0, (12 * dp).toInt(), 0, (4 * dp).toInt())
            }
            containerQuality.addView(colorHeader)

            val colors = intArrayOf(
                0xFFFFFFFF.toInt(), 0xFFFFFF00.toInt(), 0xFF4CAF50.toInt(),
                0xFF2196F3.toInt(), 0xFFFF5252.toInt(), 0xFF00E5FF.toInt()
            )
            val colorNames = arrayOf("Trắng", "Vàng", "Xanh lá", "Xanh dương", "Đỏ", "Lam ngọc")
            val colorRow = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER
                setPadding(0, 0, 0, (8 * dp).toInt())
                layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            }
            val currentColor = prefs.getSubtitleColor()
            val swatchSize = (38 * dp).toInt()
            val strokeSel = (3 * dp).toInt()
            val strokeNorm = (1.5f * dp).toInt()

            for (i in colors.indices) {
                val c = colors[i]
                val name = colorNames[i]
                val swatch = FrameLayout(this).apply {
                    layoutParams = LinearLayout.LayoutParams(swatchSize, swatchSize).apply {
                        marginEnd = (12 * dp).toInt()
                    }
                    isFocusable = true
                    background = GradientDrawable().apply {
                        shape = GradientDrawable.RECTANGLE
                        cornerRadius = 8 * dp
                        setColor(c)
                        setStroke(if (currentColor == c) strokeSel else strokeNorm, if (currentColor == c) Color.parseColor("#FF9800") else Color.parseColor("#66FFFFFF"))
                    }
                    setOnClickListener {
                        prefs.setSubtitleColor(c)
                        p.applySubtitleStyle()
                        Toast.makeText(this@MobileIptvPlayerActivity, "Màu phụ đề: $name", Toast.LENGTH_SHORT).show()
                        for (j in 0 until colorRow.childCount) {
                            val bg = colorRow.getChildAt(j).background as? GradientDrawable
                            bg?.setStroke(strokeNorm, Color.parseColor("#66FFFFFF"))
                        }
                        (background as? GradientDrawable)?.setStroke(strokeSel, Color.parseColor("#FF9800"))
                    }
                }
                colorRow.addView(swatch)
            }
            containerQuality.addView(colorRow)

            // 8.6 Cỡ phụ đề
            val initSize = prefs.getSubtitleSizeScale()
            val sizeLabel = TextView(this).apply {
                text = String.format(Locale.US, "Cỡ phụ đề: %.2fx", initSize)
                setTextColor(Color.parseColor("#FFA500"))
                textSize = 13f
                setPadding(0, (12 * dp).toInt(), 0, (4 * dp).toInt())
            }
            containerQuality.addView(sizeLabel)

            val sizeBar = SeekBar(this).apply {
                max = 30 // (2.0 - 0.5) / 0.05
                progress = Math.round(Math.max(0f, Math.min(initSize - 0.5f, 1.5f)) / 0.05f).toInt()
                setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                    override fun onProgressChanged(sb: SeekBar, progress: Int, fromUser: Boolean) {
                        if (!fromUser) return
                        val scale = 0.5f + progress * 0.05f
                        sizeLabel.text = String.format(Locale.US, "Cỡ phụ đề: %.2fx", scale)
                        prefs.setSubtitleSizeScale(scale)
                    }
                    override fun onStartTrackingTouch(sb: SeekBar) {}
                    override fun onStopTrackingTouch(sb: SeekBar) {
                        p.applySubtitleStyle()
                    }
                })
            }
            containerQuality.addView(sizeBar)

            // 8.7 Vị trí phụ đề
            val initPosPct = Math.round(prefs.getSubtitlePositionFraction() * 100).toInt()
            val posLabel = TextView(this).apply {
                text = String.format(Locale.US, "Vị trí phụ đề: %d (0=đáy, 100=đỉnh)", initPosPct)
                setTextColor(Color.parseColor("#FFA500"))
                textSize = 13f
                setPadding(0, (12 * dp).toInt(), 0, (4 * dp).toInt())
            }
            containerQuality.addView(posLabel)

            val posBar = SeekBar(this).apply {
                max = 100
                progress = initPosPct
                setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                    override fun onProgressChanged(sb: SeekBar, progress: Int, fromUser: Boolean) {
                        if (!fromUser) return
                        posLabel.text = String.format(Locale.US, "Vị trí phụ đề: %d (0=đáy, 100=đỉnh)", progress)
                        prefs.setSubtitlePositionFraction(progress / 100f)
                    }
                    override fun onStartTrackingTouch(sb: SeekBar) {}
                    override fun onStopTrackingTouch(sb: SeekBar) {
                        p.applySubtitleStyle()
                    }
                })
            }
            containerQuality.addView(posBar)
        }

        dialog.show()
    }

    private fun addResolutionRow(container: LinearLayout, dp: Float, label: String, groupIndex: Int, trackIndex: Int, isSelected: Boolean, dialog: android.app.Dialog, p: IptvMedia3Player) {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding((16 * dp).toInt(), 0, (16 * dp).toInt(), 0)
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, (48 * dp).toInt()
            ).apply { bottomMargin = (2 * dp).toInt() }
            setBackgroundResource(R.drawable.bg_dialog_row)
            background.level = if (isSelected) 1 else 0
            isClickable = true
            isFocusable = true
            setOnClickListener {
                p.selectVideoTrack(if (groupIndex >= 0) groupIndex else -1, if (trackIndex >= 0) trackIndex else 0)
                dialog.dismiss()
            }
        }

        val badgeView = TextView(this).apply {
            layoutParams = LinearLayout.LayoutParams((42 * dp).toInt(), (24 * dp).toInt()).apply { marginEnd = (12 * dp).toInt() }
            gravity = Gravity.CENTER
            textSize = 11f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            setTextColor(Color.WHITE)

            if (groupIndex < 0) {
                text = "Auto"
                setBackgroundResource(R.drawable.ic_quality_sd)
            } else {
                val height = extractHeight(label)
                when {
                    height >= 2160 -> { text = "4K"; setBackgroundResource(R.drawable.ic_quality_4k) }
                    height >= 720 -> { text = "HD"; setBackgroundResource(R.drawable.ic_quality_hd) }
                    else -> { text = "SD"; setBackgroundResource(R.drawable.ic_quality_sd) }
                }
            }
        }

        val labelView = TextView(this).apply {
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            text = label
            setTextColor(Color.WHITE)
            textSize = 15f
        }

        val checkView = TextView(this).apply {
            layoutParams = LinearLayout.LayoutParams((24 * dp).toInt(), (24 * dp).toInt())
            gravity = Gravity.CENTER
            text = if (isSelected) "✓" else ""
            setTextColor(Color.parseColor("#FF9800"))
            textSize = 18f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
        }

        row.addView(badgeView)
        row.addView(labelView)
        row.addView(checkView)
        container.addView(row)
    }

    private fun addAudioRow(container: LinearLayout, dp: Float, label: String, groupIndex: Int, trackIndex: Int, isSelected: Boolean, dialog: android.app.Dialog, p: IptvMedia3Player) {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding((16 * dp).toInt(), 0, (16 * dp).toInt(), 0)
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, (48 * dp).toInt()
            ).apply { bottomMargin = (2 * dp).toInt() }
            setBackgroundResource(R.drawable.bg_dialog_row)
            background.level = if (isSelected) 1 else 0
            isClickable = true
            isFocusable = true
            setOnClickListener {
                p.selectAudioTrack(if (groupIndex >= 0) groupIndex else -1, if (trackIndex >= 0) trackIndex else 0)
                dialog.dismiss()
            }
        }

        val badgeView = TextView(this).apply {
            layoutParams = LinearLayout.LayoutParams((42 * dp).toInt(), (24 * dp).toInt()).apply { marginEnd = (12 * dp).toInt() }
            gravity = Gravity.CENTER
            textSize = 11f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            setTextColor(Color.WHITE)
            text = "Audio"
            setBackgroundResource(R.drawable.ic_quality_sd)
        }

        val labelView = TextView(this).apply {
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            text = label
            setTextColor(Color.WHITE)
            textSize = 15f
        }

        val checkView = TextView(this).apply {
            layoutParams = LinearLayout.LayoutParams((24 * dp).toInt(), (24 * dp).toInt())
            gravity = Gravity.CENTER
            text = if (isSelected) "✓" else ""
            setTextColor(Color.parseColor("#FF9800"))
            textSize = 18f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
        }

        row.addView(badgeView)
        row.addView(labelView)
        row.addView(checkView)
        container.addView(row)
    }

    private fun extractHeight(label: String): Int {
        if (label.contains("2160") || label.contains("4K")) return 2160
        if (label.contains("1440")) return 1440
        if (label.contains("1080")) return 1080
        if (label.contains("720")) return 720
        if (label.contains("480")) return 480
        if (label.contains("360")) return 360
        if (label.contains("240")) return 240
        if (label.contains("144")) return 144
        val matcher = java.util.regex.Pattern.compile("(\\d+)p").matcher(label)
        return if (matcher.find()) matcher.group(1)?.toInt() ?: 0 else 0
    }

    override fun onResume() {
        super.onResume()
        player?.play()
    }

    override fun onPause() {
        super.onPause()
        player?.pause()
    }

    override fun onDestroy() {
        super.onDestroy()
        handler.removeCallbacks(hideOverlayRunnable)
        handler.removeCallbacks(epgUpdateRunnable)
        handler.removeCallbacks(epgListRefreshRunnable)
        handler.removeCallbacks(vodUpdateRunnable)
        player?.release()
    }

    // PlayerListener callbacks
    override fun onError(message: String?) {
        playerLoadingProgress.visibility = View.GONE
        Toast.makeText(this, "Lỗi phát video", Toast.LENGTH_SHORT).show()
    }

    override fun onPlaybackStarted(title: String?) {
        playerLoadingProgress.visibility = View.GONE
        btnPlayPause.setImageResource(R.drawable.ic_pause_circle)
        updateStreamInfo()
        
        val p = player
        if (p != null && p.duration > 0 && !p.isCurrentWindowDynamic && !p.isCurrentWindowLive) {
            isVodTimelineVisible = true
            popupVodTimelineLayout.visibility = View.VISIBLE
            infoVodTimeBar.visibility = View.VISIBLE
            popupTimelineLayout.visibility = View.GONE // Hide EPG timeline
            playerEpgTimeBar.visibility = View.GONE
            handler.post(vodUpdateRunnable)
        } else {
            isVodTimelineVisible = false
            popupVodTimelineLayout.visibility = View.GONE
            infoVodTimeBar.visibility = View.GONE
            playerEpgTimeBar.visibility = View.VISIBLE
            handler.removeCallbacks(vodUpdateRunnable)
        }
    }

    override fun onBuffering(buffering: Boolean) {
        playerLoadingProgress.visibility = if (buffering) View.VISIBLE else View.GONE
    }

    override fun onVideoFormatChanged(width: Int, height: Int, frameRate: Float, bitrate: Int) {
        runOnUiThread {
            isVerticalVideo = height > width && width > 0
            if (isFullscreen) {
                // If already in fullscreen, ensure the orientation matches
                requestedOrientation = if (isVerticalVideo) {
                    ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
                } else {
                    ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
                }
            }
            updateStreamInfo()
        }
    }

    override fun onFpsMeasured(fps: Float) {
        runOnUiThread { updateStreamInfo() }
    }

    override fun onAudioOnlyDetected(audioSessionId: Int) {}

    private fun showChannelOptionsDialog(channel: M3uSource) {
        val dialogView = layoutInflater.inflate(R.layout.dialog_mobile_popup, null)
        val txtTitle = dialogView.findViewById<TextView>(R.id.txt_popup_title)
        val imgLogo = dialogView.findViewById<ImageView>(R.id.img_popup_logo)
        val btnClose = dialogView.findViewById<View>(R.id.btn_popup_close)
        val btnDismiss = dialogView.findViewById<View>(R.id.btn_popup_dismiss)
        val containerItems = dialogView.findViewById<LinearLayout>(R.id.container_popup_items)

        txtTitle.text = channel.name ?: "Kênh Truyền Hình"
        
        val logoUrl = channel.getEffectiveLogoUrl()
        if (!logoUrl.isNullOrEmpty()) {
            imgLogo.visibility = View.VISIBLE
            Glide.with(this)
                .load(logoUrl)
                .placeholder(R.drawable.iptv_channel_placeholder)
                .into(imgLogo)
        } else {
            imgLogo.visibility = View.GONE
        }

        val dialog = android.app.AlertDialog.Builder(this)
            .setView(dialogView)
            .create()

        dialog.window?.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))

        btnClose.setOnClickListener { dialog.dismiss() }
        btnDismiss.visibility = View.GONE

        containerItems.removeAllViews()
        
        val favoritesStore = IptvFavoritesStore.instance(this)
        val favs = favoritesStore.load()
        val channelKey = channel.tvgId ?: channel.name ?: channel.url ?: ""
        val isFavorite = favs.any { it.tvgId == channelKey || it.title == channel.name }
        
        val favAction = if (isFavorite) "❌ Bỏ Yêu thích" else "❤️ Thêm Yêu thích"
        val hideChannelAction = "🙈 Ẩn Kênh Này"
        val hideGroupAction = if (!channel.groupTitle.isNullOrEmpty()) "🙈 Ẩn Nhóm (${channel.groupTitle})" else null

        val options = listOfNotNull(favAction, hideChannelAction, hideGroupAction)
        for (opt in options) {
            val itemRow = TextView(this).apply {
                text = opt
                setTextColor(Color.WHITE)
                textSize = 15f
                typeface = android.graphics.Typeface.DEFAULT_BOLD
                setPadding(16, 24, 16, 24)
                setOnClickListener {
                    when (opt) {
                        favAction -> {
                            val currentFavKeys = favs.mapNotNull { it.tvgId ?: it.title }.toMutableSet()
                            if (isFavorite) currentFavKeys.remove(channelKey) else currentFavKeys.add(channelKey)
                            favoritesStore.save(allChannels, currentFavKeys)
                            
                            val loaded = M3uCache(this@MobileIptvPlayerActivity).loadChannels()
                            allChannels.clear()
                            allChannels.addAll(loaded)
                            buildCategoryChips()
                            filterChannelsByCategory()
                            
                            Toast.makeText(this@MobileIptvPlayerActivity, "Đã cập nhật yêu thích", Toast.LENGTH_SHORT).show()
                        }
                        hideChannelAction -> {
                            val url = channel.url ?: channel.tvgId
                            if (url != null) {
                                com.liskovsoft.smartyoutubetv2.common.prefs.IptvChannelVisibilityPrefs.instance(this@MobileIptvPlayerActivity).setChannelHidden(url, true)
                                
                                val loaded = M3uCache(this@MobileIptvPlayerActivity).loadChannels()
                                allChannels.clear()
                                allChannels.addAll(loaded)
                                buildCategoryChips()
                                filterChannelsByCategory()
                                
                                Toast.makeText(this@MobileIptvPlayerActivity, "Đã ẩn kênh: ${channel.name}", Toast.LENGTH_SHORT).show()
                            }
                        }
                        hideGroupAction -> {
                            val group = channel.groupTitle
                            if (group != null) {
                                com.liskovsoft.smartyoutubetv2.common.prefs.IptvChannelVisibilityPrefs.instance(this@MobileIptvPlayerActivity).setGroupHidden(group, true)
                                
                                val loaded = M3uCache(this@MobileIptvPlayerActivity).loadChannels()
                                allChannels.clear()
                                allChannels.addAll(loaded)
                                buildCategoryChips()
                                filterChannelsByCategory()
                                
                                Toast.makeText(this@MobileIptvPlayerActivity, "Đã ẩn nhóm: $group", Toast.LENGTH_SHORT).show()
                            }
                        }
                    }
                    dialog.dismiss()
                }
            }
            containerItems.addView(itemRow)
        }

        dialog.show()
    }

    private inner class PlayerChannelAdapter(
        private val items: List<M3uSource>,
        private val onItemClick: (M3uSource) -> Unit,
        private val onLongClick: (M3uSource) -> Unit
    ) : RecyclerView.Adapter<PlayerChannelAdapter.ViewHolder>() {

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
            val view = layoutInflater.inflate(R.layout.mobile_item_iptv_channel, parent, false)
            return ViewHolder(view)
        }

        override fun onBindViewHolder(holder: ViewHolder, position: Int) {
            val item = items[position]
            val isPlaying = item.url == activeChannelUrl || item.name == video?.title

            val channelName = item.name ?: "Kênh Live"
            holder.txtName.text = channelName
            holder.txtName.setTextColor(if (isPlaying) Color.parseColor("#FF9800") else Color.WHITE)
            
            if (isPlaying) {
                holder.gradientBorder.visibility = View.VISIBLE
                holder.gradientBorder.startBorderAnimation()
            } else {
                holder.gradientBorder.visibility = View.GONE
                holder.gradientBorder.stopBorderAnimation()
            }

            val currentProg = EpgManager.getInstance().getCurrentProgram(item.tvgId, item.name)
            if (currentProg != null && !currentProg.title.isNullOrEmpty()) {
                holder.txtEpg.visibility = View.VISIBLE
                holder.layoutTimeBar.visibility = View.VISIBLE
                holder.txtEpg.text = currentProg.title
                val timeFmt = SimpleDateFormat("HH:mm", Locale.getDefault())
                holder.txtStartTime.text = timeFmt.format(currentProg.startTime)
                holder.txtStopTime.text = timeFmt.format(currentProg.stopTime)

                val totalMs = currentProg.stopTime.time - currentProg.startTime.time
                val elapsedMs = System.currentTimeMillis() - currentProg.startTime.time
                val progressPercent = if (totalMs > 0) ((elapsedMs.toDouble() / totalMs) * 100).toInt().coerceIn(5, 100) else 50
                holder.progressEpg.progress = progressPercent
            } else {
                holder.txtEpg.visibility = View.GONE
                holder.layoutTimeBar.visibility = View.GONE
            }

            val hasCatchup = !item.catchupSource.isNullOrEmpty() || !item.catchupDays.isNullOrEmpty() || item.catchupType != null
            if (hasCatchup) {
                holder.imgCatchupIcon.visibility = View.VISIBLE
            } else {
                holder.imgCatchupIcon.visibility = View.GONE
            }

            val logoUrl = item.getEffectiveLogoUrl()
            if (!logoUrl.isNullOrEmpty()) {
                Glide.with(holder.itemView.context)
                    .load(logoUrl)
                    .placeholder(R.mipmap.app_logo)
                    .error(R.mipmap.app_logo)
                    .into(holder.imgLogo)
            } else {
                holder.imgLogo.setImageResource(R.mipmap.app_logo)
            }

            holder.channelItemRoot.setOnClickListener { onItemClick(item) }
            holder.channelItemRoot.setOnLongClickListener { 
                onLongClick(item)
                true
            }
        }

        override fun getItemCount(): Int = items.size

        private inner class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
            val channelItemRoot: View = view.findViewById(R.id.channel_item_root)
            val txtName: TextView = view.findViewById(R.id.txt_channel_name)
            val txtEpg: TextView = view.findViewById(R.id.txt_epg_title)
            val txtStartTime: TextView = view.findViewById(R.id.txt_epg_start_time)
            val txtStopTime: TextView = view.findViewById(R.id.txt_epg_stop_time)
            val progressEpg: ProgressBar = view.findViewById(R.id.progress_epg)
            val layoutTimeBar: View = view.findViewById(R.id.layout_epg_time_bar)
            val imgLogo: ImageView = view.findViewById(R.id.img_channel_logo)
            val imgCatchupIcon: ImageView = view.findViewById(R.id.img_catchup_icon)
            val gradientBorder: com.liskovsoft.smartyoutubetv2.tv.ui.widget.AnimatedGradientBorderView = view.findViewById(R.id.channel_gradient_border)
        }
    }
}
