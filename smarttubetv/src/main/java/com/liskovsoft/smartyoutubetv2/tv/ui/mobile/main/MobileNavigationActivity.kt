package com.liskovsoft.smartyoutubetv2.tv.ui.mobile.main

import android.content.pm.ActivityInfo
import android.content.res.ColorStateList
import android.graphics.Color
import android.os.Bundle
import android.view.View
import android.widget.ImageView
import androidx.appcompat.app.AppCompatActivity
import androidx.fragment.app.Fragment
import com.liskovsoft.smartyoutubetv2.tv.R
import com.liskovsoft.smartyoutubetv2.tv.ui.mobile.tabs.MobileDailymotionFragment
import com.liskovsoft.smartyoutubetv2.tv.ui.mobile.tabs.MobileIptvFragment
import com.liskovsoft.smartyoutubetv2.tv.ui.mobile.tabs.MobileLocalVideosFragment
import com.liskovsoft.smartyoutubetv2.tv.ui.movie.MoviesBrowseFragment
import com.liskovsoft.smartyoutubetv2.tv.ui.mobile.tabs.MobileSettingsFragment
import com.liskovsoft.smartyoutubetv2.tv.ui.mobile.tabs.MobileYouTubeFragment
import com.liskovsoft.smartyoutubetv2.tv.ui.tabs.TabNavigationActivity
import com.liskovsoft.smartyoutubetv2.tv.ui.tabs.TabNavigationActivity.TabType

class MobileNavigationActivity : AppCompatActivity() {

    private val fragments = HashMap<Int, Fragment>()
    private var currentTabId = R.id.btn_nav_dailymotion

    private lateinit var btnNavIptv: View
    private lateinit var btnNavMovies: View
    private lateinit var btnNavYouTube: View
    private lateinit var btnNavDailymotion: View
    private lateinit var btnNavLocal: View
    private lateinit var btnNavSettings: View

    private lateinit var iconIptv: ImageView
    private lateinit var iconMovies: ImageView
    private lateinit var iconYouTube: ImageView
    private lateinit var iconDailymotion: ImageView
    private lateinit var iconLocal: ImageView
    private lateinit var iconSettings: ImageView
    
    private lateinit var txtIptv: android.widget.TextView
    private lateinit var txtMovies: android.widget.TextView
    private lateinit var txtYouTube: android.widget.TextView
    private lateinit var txtDailymotion: android.widget.TextView
    private lateinit var txtLocal: android.widget.TextView
    private lateinit var txtSettings: android.widget.TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
        super.onCreate(savedInstanceState)
        setContentView(R.layout.mobile_activity_navigation)

        initViews()
        setupTabListeners()
        rebuildTabs()

        // Select default first visible tab
        selectDefaultTab()
    }

    private fun initViews() {
        btnNavIptv = findViewById(R.id.btn_nav_iptv)
        btnNavMovies = findViewById(R.id.btn_nav_movies)
        btnNavYouTube = findViewById(R.id.btn_nav_youtube)
        btnNavDailymotion = findViewById(R.id.btn_nav_dailymotion)
        btnNavLocal = findViewById(R.id.btn_nav_local)
        btnNavSettings = findViewById(R.id.btn_nav_settings)

        iconIptv = findViewById(R.id.icon_nav_iptv)
        iconMovies = findViewById(R.id.icon_nav_movies)
        iconYouTube = findViewById(R.id.icon_nav_youtube)
        iconDailymotion = findViewById(R.id.icon_nav_dailymotion)
        iconLocal = findViewById(R.id.icon_nav_local)
        iconSettings = findViewById(R.id.icon_nav_settings)
        
        txtIptv = findViewById(R.id.txt_nav_iptv)
        txtMovies = findViewById(R.id.txt_nav_movies)
        txtYouTube = findViewById(R.id.txt_nav_youtube)
        txtDailymotion = findViewById(R.id.txt_nav_dailymotion)
        txtLocal = findViewById(R.id.txt_nav_local)
        txtSettings = findViewById(R.id.txt_nav_settings)
    }

    private fun setupTabListeners() {
        btnNavIptv.setOnClickListener { selectTab(R.id.btn_nav_iptv) }
        btnNavMovies.setOnClickListener { selectTab(R.id.btn_nav_movies) }
        btnNavYouTube.setOnClickListener { selectTab(R.id.btn_nav_youtube) }
        btnNavDailymotion.setOnClickListener { selectTab(R.id.btn_nav_dailymotion) }
        btnNavLocal.setOnClickListener { selectTab(R.id.btn_nav_local) }
        btnNavSettings.setOnClickListener { selectTab(R.id.btn_nav_settings) }
    }

    fun rebuildTabs() {
        val showIptv = TabNavigationActivity.isTabVisible(this, TabType.STREAM)
        val showMovies = TabNavigationActivity.isTabVisible(this, TabType.MOVIES)
        val showYouTube = TabNavigationActivity.isTabVisible(this, TabType.SMARTTUBE)
        val showDailymotion = TabNavigationActivity.isTabVisible(this, TabType.DAILYMOTION)
        val showLocal = TabNavigationActivity.isTabVisible(this, TabType.LOCAL_VIDEOS)

        btnNavIptv.visibility = if (showIptv) View.VISIBLE else View.GONE
        btnNavMovies.visibility = if (showMovies) View.VISIBLE else View.GONE
        btnNavYouTube.visibility = if (showYouTube) View.VISIBLE else View.GONE
        btnNavDailymotion.visibility = if (showDailymotion) View.VISIBLE else View.GONE
        btnNavLocal.visibility = if (showLocal) View.VISIBLE else View.GONE
        btnNavSettings.visibility = View.VISIBLE

        // If currently selected tab is hidden, auto switch to a visible tab
        if (!isTabVisible(currentTabId)) {
            selectDefaultTab()
        }
    }

    private fun isTabVisible(tabId: Int): Boolean {
        return when (tabId) {
            R.id.btn_nav_iptv -> TabNavigationActivity.isTabVisible(this, TabType.STREAM)
            R.id.btn_nav_movies -> TabNavigationActivity.isTabVisible(this, TabType.MOVIES)
            R.id.btn_nav_youtube -> TabNavigationActivity.isTabVisible(this, TabType.SMARTTUBE)
            R.id.btn_nav_dailymotion -> TabNavigationActivity.isTabVisible(this, TabType.DAILYMOTION)
            R.id.btn_nav_local -> TabNavigationActivity.isTabVisible(this, TabType.LOCAL_VIDEOS)
            R.id.btn_nav_settings -> true
            else -> false
        }
    }

    private fun selectDefaultTab() {
        val firstVisible = when {
            TabNavigationActivity.isTabVisible(this, TabType.DAILYMOTION) -> R.id.btn_nav_dailymotion
            TabNavigationActivity.isTabVisible(this, TabType.SMARTTUBE) -> R.id.btn_nav_youtube
            TabNavigationActivity.isTabVisible(this, TabType.STREAM) -> R.id.btn_nav_iptv
            TabNavigationActivity.isTabVisible(this, TabType.MOVIES) -> R.id.btn_nav_movies
            TabNavigationActivity.isTabVisible(this, TabType.LOCAL_VIDEOS) -> R.id.btn_nav_local
            else -> R.id.btn_nav_settings
        }
        selectTab(firstVisible)
    }

    fun selectTab(tabId: Int) {
        currentTabId = tabId
        updateNavIcons(tabId)

        val fragment = fragments.getOrPut(tabId) {
            when (tabId) {
                R.id.btn_nav_iptv -> MobileIptvFragment()
                R.id.btn_nav_movies -> MoviesBrowseFragment()
                R.id.btn_nav_youtube -> MobileYouTubeFragment()
                R.id.btn_nav_dailymotion -> MobileDailymotionFragment()
                R.id.btn_nav_local -> MobileLocalVideosFragment()
                R.id.btn_nav_settings -> MobileSettingsFragment()
                else -> MobileIptvFragment()
            }
        }

        supportFragmentManager.beginTransaction()
            .replace(R.id.mobile_fragment_container, fragment)
            .commit()
    }

    private fun updateNavIcons(activeTabId: Int) {
        val activeColor = Color.parseColor("#FF6D00") // Orange
        val inactiveColor = Color.parseColor("#888888")

        iconIptv.imageTintList = ColorStateList.valueOf(if (activeTabId == R.id.btn_nav_iptv) activeColor else inactiveColor)
        iconMovies.imageTintList = ColorStateList.valueOf(if (activeTabId == R.id.btn_nav_movies) activeColor else inactiveColor)
        iconYouTube.imageTintList = ColorStateList.valueOf(if (activeTabId == R.id.btn_nav_youtube) activeColor else inactiveColor)
        iconDailymotion.imageTintList = ColorStateList.valueOf(if (activeTabId == R.id.btn_nav_dailymotion) activeColor else inactiveColor)
        iconLocal.imageTintList = ColorStateList.valueOf(if (activeTabId == R.id.btn_nav_local) activeColor else inactiveColor)
        iconSettings.imageTintList = ColorStateList.valueOf(if (activeTabId == R.id.btn_nav_settings) activeColor else inactiveColor)
        
        txtIptv.setTextColor(if (activeTabId == R.id.btn_nav_iptv) activeColor else inactiveColor)
        txtMovies.setTextColor(if (activeTabId == R.id.btn_nav_movies) activeColor else inactiveColor)
        txtYouTube.setTextColor(if (activeTabId == R.id.btn_nav_youtube) activeColor else inactiveColor)
        txtDailymotion.setTextColor(if (activeTabId == R.id.btn_nav_dailymotion) activeColor else inactiveColor)
        txtLocal.setTextColor(if (activeTabId == R.id.btn_nav_local) activeColor else inactiveColor)
        txtSettings.setTextColor(if (activeTabId == R.id.btn_nav_settings) activeColor else inactiveColor)
    }
}
