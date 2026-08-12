package com.liskovsoft.smartyoutubetv2.tv.ui.mobile.tabs

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.fragment.app.Fragment
import com.liskovsoft.googleapi.oauth2.impl.GoogleSignInService
import com.liskovsoft.mediaserviceinterfaces.oauth.Account
import com.liskovsoft.sharedutils.helpers.AppInfoHelpers
import com.liskovsoft.sharedutils.helpers.MessageHelpers
import com.liskovsoft.smartyoutubetv2.common.app.models.data.Video
import com.liskovsoft.smartyoutubetv2.common.app.models.playback.ui.OptionCategory
import com.liskovsoft.smartyoutubetv2.common.app.models.playback.ui.OptionItem
import com.liskovsoft.smartyoutubetv2.common.app.models.playback.ui.UiOptionItem
import com.liskovsoft.smartyoutubetv2.common.app.presenters.AppDialogPresenter
import com.liskovsoft.smartyoutubetv2.common.app.presenters.dialogs.AppUpdatePresenter
import com.liskovsoft.smartyoutubetv2.common.app.presenters.settings.AccountSettingsPresenter
import com.liskovsoft.smartyoutubetv2.common.app.presenters.settings.DnsSettingsPresenter
import com.liskovsoft.smartyoutubetv2.common.app.presenters.settings.IptvSettingsPresenter
import com.liskovsoft.smartyoutubetv2.common.app.presenters.settings.MovieSourceSettingsPresenter
import com.liskovsoft.smartyoutubetv2.common.app.presenters.settings.SubtitleSettingsPresenter
import com.liskovsoft.smartyoutubetv2.common.app.views.AppDialogView
import com.liskovsoft.smartyoutubetv2.common.m3u.cache.M3uCache
import com.liskovsoft.smartyoutubetv2.common.m3u.models.M3uSource
import com.liskovsoft.smartyoutubetv2.common.misc.GDriveBackupManager
import com.liskovsoft.smartyoutubetv2.common.misc.MediaServiceManager
import com.liskovsoft.smartyoutubetv2.common.prefs.GeneralData
import com.liskovsoft.smartyoutubetv2.common.prefs.IptvChannelVisibilityPrefs
import com.liskovsoft.smartyoutubetv2.tv.R
import com.liskovsoft.smartyoutubetv2.tv.ui.iptv.IptvPlayerActivity
import com.liskovsoft.smartyoutubetv2.tv.ui.mobile.main.MobileNavigationActivity
import com.liskovsoft.smartyoutubetv2.tv.ui.tabs.TabNavigationActivity
import com.liskovsoft.smartyoutubetv2.tv.util.LogcatLogger
import java.util.ArrayList
import java.util.LinkedHashSet

class MobileSettingsFragment : Fragment(), AppDialogView {

    private lateinit var container: LinearLayout
    private var activeMobileDialog: AlertDialog? = null

    data class SettingItemFlat(
        val iconRes: Int,
        val title: String,
        val description: String,
        val badgeText: String = "",
        val badgeColor: Int = Color.parseColor("#FF6D00"),
        val action: () -> Unit
    )

    override fun onCreateView(inflater: LayoutInflater, containerViewGroup: ViewGroup?, savedInstanceState: Bundle?): View? {
        val view = inflater.inflate(R.layout.mobile_fragment_settings, containerViewGroup, false)
        container = view.findViewById(R.id.container_mobile_settings)
        return view
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        setupSettingsList()
    }

    override fun onResume() {
        super.onResume()
        // Register MobileAppDialogView on AppDialogPresenter so all setting presenters show mobile popup dialogs
        try {
            val ctx = context
            if (ctx != null) {
                AppDialogPresenter.instance(ctx).setView(this)
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        setupSettingsList()
    }

    override fun onPause() {
        super.onPause()
        activeMobileDialog?.dismiss()
        activeMobileDialog = null
    }

    private fun setupSettingsList() {
        container.removeAllViews()

        val googleAccount = try { MediaServiceManager.instance().selectedAccount } catch (e: Exception) { null }
        val accountTitle = if (googleAccount != null) {
            googleAccount.name ?: googleAccount.email ?: "Tài khoản Google"
        } else {
            "Tài khoản Google / YouTube"
        }

        val bgEnabled = context?.let { TabNavigationActivity.isBackgroundEnabled(it) } ?: true
        val logEnabled = context?.let { LogcatLogger.isEnabled(it) } ?: false
        val appVersion = context?.let { AppInfoHelpers.getAppVersionName(it) } ?: "0.3"

        val items = listOf(
            // 1. Tài khoản Google
            SettingItemFlat(
                R.drawable.ic_google,
                accountTitle,
                "Quản lý đăng nhập Google, YouTube & đồng bộ dữ liệu",
                badgeText = if (googleAccount != null) "Đã kết nối" else "Khách",
                badgeColor = if (googleAccount != null) Color.parseColor("#4CAF50") else Color.parseColor("#888888")
            ) { context?.let { AccountSettingsPresenter.instance(it).show() } },

            // 2. Play Direct URL
            SettingItemFlat(
                R.drawable.ic_link,
                "Play Direct URL (M3U8 / Embed)",
                "Nhập trực tiếp link stream M3U8 hoặc URL nhúng để phát ngay"
            ) { showPlayUrlDialog() },

            // 3. Quản lý Nguồn Stream / IPTV
            SettingItemFlat(
                R.drawable.ic_dns,
                "Quản lý Nguồn Stream / IPTV",
                "Thêm, sửa, xóa danh sách kênh M3U & server IPTV"
            ) { context?.let { IptvSettingsPresenter.instance(it).show() } },

            // 4. Quản lý Nguồn Phim VOD
            SettingItemFlat(
                R.drawable.ic_movie,
                "Quản lý Nguồn Phim VOD",
                "Cấu hình các plugin Rhino JS (OPhim, KKPhim, Nguonc...)"
            ) { context?.let { MovieSourceSettingsPresenter.instance(it).show() } },

            // 5. Cài đặt Phụ Đề Video
            SettingItemFlat(
                R.drawable.ic_cc,
                "Cài đặt Phụ Đề Video",
                "Tùy chỉnh kiểu chữ, kích thước, màu sắc & dịch thuật phụ đề"
            ) { context?.let { SubtitleSettingsPresenter.instance(it).show() } },

            // 6. Máy Chủ DNS
            SettingItemFlat(
                R.drawable.ic_dns_settings,
                "Cài đặt Máy Chủ DNS",
                "Thay đổi hoặc cấu hình DNS tăng tốc truy cập"
            ) { context?.let { DnsSettingsPresenter.instance(it).show() } },

            // 7. Quản Lý Tab
            SettingItemFlat(
                R.drawable.ic_tab_management,
                "Quản Lý Tab",
                "Ẩn / hiện các tab trên thanh điều hướng ứng dụng"
            ) { showTabManagementDialog() },

            // 8. Chế độ UI Mode
            SettingItemFlat(
                R.drawable.ic_tv,
                "Chế độ giao diện (UI Mode)",
                "Chuyển đổi giữa Giao diện Điện thoại & Giao diện TV / TV Box",
                badgeText = "📱 PHONE",
                badgeColor = Color.parseColor("#FF6D00")
            ) { showUiModeDialog() },

            // 9. Ẩn / Hiện nhóm kênh
            SettingItemFlat(
                R.drawable.ic_visibility,
                "Ẩn / Hiện nhóm kênh IPTV",
                "Lựa chọn các nhóm kênh IPTV muốn ẩn hoặc hiển thị"
            ) { showChannelGroupVisibilityDialog() },

            // 10. Quản lý kênh ẩn
            SettingItemFlat(
                R.drawable.ic_visibility_off,
                "Quản lý kênh ẩn",
                "Xem lại và khôi phục các kênh & nhóm kênh IPTV đã ẩn"
            ) { showHiddenChannelsDialog() },

            // 11. Ngôn ngữ & Dịch Phụ đề AI
            SettingItemFlat(
                R.drawable.ic_cc,
                "Ngôn ngữ & Dịch Phụ đề AI",
                "Tùy chỉnh ngôn ngữ ứng dụng & dịch thuật AI"
            ) { context?.let { IptvSettingsPresenter.instance(it).showSubtitleTranslationOptions() } },

            // 12. Sao lưu Dữ liệu
            SettingItemFlat(
                R.drawable.ic_backup,
                "Sao lưu Dữ liệu",
                "Đồng bộ cấu hình & danh sách yêu thích lên Google Drive"
            ) { handleBackup() },

            // 13. Khôi phục Dữ liệu
            SettingItemFlat(
                R.drawable.ic_restore,
                "Khôi phục Dữ liệu",
                "Khôi phục cấu hình từ bản sao lưu trên Google Drive"
            ) { handleRestore() },

            // 14. Hình nền Wallpaper
            SettingItemFlat(
                R.drawable.ic_wallpaper,
                "Hình nền Wallpaper",
                "Bật hoặc tắt hiệu ứng hình nền nghệ thuật trong app",
                badgeText = if (bgEnabled) "Bật" else "Tắt",
                badgeColor = if (bgEnabled) Color.parseColor("#4CAF50") else Color.parseColor("#888888")
            ) {
                context?.let {
                    val cur = TabNavigationActivity.isBackgroundEnabled(it)
                    TabNavigationActivity.setBackgroundEnabled(it, !cur)
                    setupSettingsList()
                }
            },

            // 15. Kiểm tra Cập nhật
            SettingItemFlat(
                R.drawable.ic_system_update,
                "Kiểm tra Cập nhật",
                "Cập nhật ứng dụng SuperOK lên phiên bản mới nhất",
                badgeText = "v$appVersion",
                badgeColor = Color.parseColor("#FF6D00")
            ) { context?.let { AppUpdatePresenter.instance(it).start(true) } },

            // 16. Ghi Log Hệ Thống
            SettingItemFlat(
                R.drawable.ic_log_record,
                "Ghi Log Hệ Thống",
                "Ghi nhật ký sự kiện logcat hỗ trợ chẩn đoán lỗi",
                badgeText = if (logEnabled) "Bật" else "Tắt",
                badgeColor = if (logEnabled) Color.parseColor("#4CAF50") else Color.parseColor("#888888")
            ) {
                context?.let {
                    val cur = LogcatLogger.isEnabled(it)
                    LogcatLogger.setEnabled(it, !cur)
                    setupSettingsList()
                }
            },

            // 17. Xem Logcat Nhật Ký
            SettingItemFlat(
                R.drawable.ic_logcat,
                "Xem Logcat Nhật Ký",
                "Xem chi tiết và xuất file log sự kiện hệ thống"
            ) { showLogcatDialog() },

            // 18. Thông tin ứng dụng
            SettingItemFlat(
                R.drawable.ic_about,
                "Thông tin ứng dụng",
                "SmartTube SuperOK • Phiên bản dành cho Điện thoại & TV",
                badgeText = "v$appVersion",
                badgeColor = Color.parseColor("#AAAAAA")
            ) { showAppInfo() }
        )

        val inflater = LayoutInflater.from(context)
        for (item in items) {
            val itemView = inflater.inflate(R.layout.mobile_item_setting_flat, container, false)

            val imgIcon = itemView.findViewById<ImageView>(R.id.img_setting_icon)
            val txtTitle = itemView.findViewById<TextView>(R.id.txt_setting_title)
            val txtSub = itemView.findViewById<TextView>(R.id.txt_setting_subtitle)
            val txtBadge = itemView.findViewById<TextView>(R.id.txt_setting_badge)
            val btnItem = itemView.findViewById<View>(R.id.btn_setting_item)

            imgIcon.setImageResource(item.iconRes)
            txtTitle.text = item.title
            txtSub.text = item.description

            if (item.badgeText.isNotEmpty()) {
                txtBadge.visibility = View.VISIBLE
                txtBadge.text = item.badgeText
                txtBadge.setTextColor(item.badgeColor)
            } else {
                txtBadge.visibility = View.GONE
            }

            btnItem.setOnClickListener { item.action() }
            container.addView(itemView)
        }
    }

    // =========================================================================
    // AppDialogView Implementation for Mobile Popup Dialogs
    // =========================================================================

    override fun show(
        categories: MutableList<OptionCategory>?,
        title: CharSequence?,
        isExpandable: Boolean,
        isTransparent: Boolean,
        isOverlay: Boolean,
        id: Int
    ) {
        if (context == null || categories == null || categories.isEmpty()) return

        val ctx = requireContext()
        val popupInflater = LayoutInflater.from(ctx)
        val popupView = popupInflater.inflate(R.layout.dialog_mobile_popup, null)

        val txtTitle = popupView.findViewById<TextView>(R.id.txt_popup_title)
        val btnClose = popupView.findViewById<View>(R.id.btn_popup_close)
        val btnDismiss = popupView.findViewById<View>(R.id.btn_popup_dismiss)
        val containerItems = popupView.findViewById<LinearLayout>(R.id.container_popup_items)

        txtTitle.text = title ?: "Cài đặt"

        activeMobileDialog?.dismiss()

        val dialog = AlertDialog.Builder(ctx)
            .setView(popupView)
            .create()

        dialog.window?.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
        activeMobileDialog = dialog

        btnClose.setOnClickListener { dialog.dismiss() }
        btnDismiss.setOnClickListener { dialog.dismiss() }

        // Populate Categories and Options
        containerItems.removeAllViews()
        for (category in categories) {
            if (!category.title.isNullOrEmpty()) {
                val catHeader = TextView(ctx).apply {
                    text = category.title
                    setTextColor(Color.parseColor("#FF6D00"))
                    textSize = 16f
                    typeface = android.graphics.Typeface.DEFAULT_BOLD
                    setPadding(16, 18, 16, 10)
                }
                containerItems.addView(catHeader)
            }

            for (option in category.options ?: emptyList()) {
                val itemRow = LinearLayout(ctx).apply {
                    orientation = LinearLayout.HORIZONTAL
                    gravity = Gravity.CENTER_VERTICAL
                    setPadding(16, 18, 16, 18)
                    isClickable = true
                    isFocusable = true
                    setBackgroundResource(android.R.drawable.list_selector_background)
                }

                // Check mark / Radio mark
                val checkTv = TextView(ctx).apply {
                    textSize = 18f
                    setTextColor(Color.parseColor("#FF6D00"))
                    setPadding(0, 0, 12, 0)
                    text = if (option.isSelected) "✓ " else "  "
                }
                itemRow.addView(checkTv)

                val textLayout = LinearLayout(ctx).apply {
                    orientation = LinearLayout.VERTICAL
                    layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
                }

                val titleTv = TextView(ctx).apply {
                    text = option.title
                    setTextColor(Color.WHITE)
                    textSize = 17f
                    typeface = android.graphics.Typeface.DEFAULT_BOLD
                }
                textLayout.addView(titleTv)

                if (!option.description.isNullOrEmpty()) {
                    val subTv = TextView(ctx).apply {
                        text = option.description
                        setTextColor(Color.parseColor("#AAAAAA"))
                        textSize = 14f
                        setPadding(0, 3, 0, 0)
                    }
                    textLayout.addView(subTv)
                }

                itemRow.addView(textLayout)

                itemRow.setOnClickListener {
                    try {
                        option.onSelect(!option.isSelected)
                    } catch (e: Exception) {
                        e.printStackTrace()
                    }
                    dialog.dismiss()
                }

                containerItems.addView(itemRow)
            }
        }

        dialog.show()
    }

    override fun finish() {
        activeMobileDialog?.dismiss()
        activeMobileDialog = null
    }

    override fun goBack() {
        finish()
    }

    override fun clearBackstack() {}
    override fun canGoBack(): Boolean = false
    override fun isShown(): Boolean = activeMobileDialog?.isShowing == true
    override fun isTransparent(): Boolean = false
    override fun isOverlay(): Boolean = false
    override fun isPaused(): Boolean = !isResumed
    override fun getViewId(): Int = 0

    // =========================================================================
    // Setting Dialog Actions
    // =========================================================================

    private fun showTabManagementDialog() {
        val act = activity ?: return
        val dialogPresenter = AppDialogPresenter.instance(act)
        val options = ArrayList<OptionItem>()

        val updateTabVisibility = { type: TabNavigationActivity.TabType, visible: Boolean, name: String ->
            TabNavigationActivity.setTabVisible(act, type, visible)
            if (act is MobileNavigationActivity) {
                act.rebuildTabs()
            } else if (act is TabNavigationActivity) {
                act.rebuildTabs()
            }
            Toast.makeText(act, (if (visible) "Đã hiện" else "Đã ẩn") + " tab $name", Toast.LENGTH_SHORT).show()
        }

        options.add(UiOptionItem.from(
            "STREAMS",
            { option -> updateTabVisibility(TabNavigationActivity.TabType.STREAM, option.isSelected, "STREAMS") },
            TabNavigationActivity.isTabVisible(act, TabNavigationActivity.TabType.STREAM)
        ))
        options.add(UiOptionItem.from(
            "MOVIES",
            { option -> updateTabVisibility(TabNavigationActivity.TabType.MOVIES, option.isSelected, "MOVIES") },
            TabNavigationActivity.isTabVisible(act, TabNavigationActivity.TabType.MOVIES)
        ))
        options.add(UiOptionItem.from(
            "SMARTTUBE",
            { option -> updateTabVisibility(TabNavigationActivity.TabType.SMARTTUBE, option.isSelected, "SMARTTUBE") },
            TabNavigationActivity.isTabVisible(act, TabNavigationActivity.TabType.SMARTTUBE)
        ))
        options.add(UiOptionItem.from(
            "DAILYMOTION",
            { option -> updateTabVisibility(TabNavigationActivity.TabType.DAILYMOTION, option.isSelected, "DAILYMOTION") },
            TabNavigationActivity.isTabVisible(act, TabNavigationActivity.TabType.DAILYMOTION)
        ))
        options.add(UiOptionItem.from(
            "VIDEOS",
            { option -> updateTabVisibility(TabNavigationActivity.TabType.LOCAL_VIDEOS, option.isSelected, "VIDEOS") },
            TabNavigationActivity.isTabVisible(act, TabNavigationActivity.TabType.LOCAL_VIDEOS)
        ))

        dialogPresenter.appendCheckedCategory("Chọn tab để ẩn/hiện (lưu phiên làm việc)", options)
        dialogPresenter.showDialog("Quản Lý Tab")
    }

    private fun showChannelGroupVisibilityDialog() {
        val ctx = context ?: return
        val channels = loadCachedChannels()
        if (channels.isNullOrEmpty()) {
            Toast.makeText(ctx, "Chưa có dữ liệu kênh. Vào tab Stream để tải.", Toast.LENGTH_LONG).show()
            return
        }

        val groupSet = LinkedHashSet<String>()
        for (ch in channels) {
            val group = ch.groupTitle
            if (!group.isNullOrEmpty()) {
                groupSet.add(group)
            }
        }
        if (groupSet.isEmpty()) groupSet.add("Khác")

        val prefs = IptvChannelVisibilityPrefs.instance(ctx)
        val hiddenGroups = prefs.getHiddenGroupNames()

        val dialogPresenter = AppDialogPresenter.instance(ctx)
        val options = ArrayList<OptionItem>()

        for (group in groupSet) {
            val isHidden = hiddenGroups.contains(group)
            options.add(UiOptionItem.from(
                group,
                { option ->
                    val nowVisible = option.isSelected
                    prefs.setGroupHidden(group, !nowVisible)
                    Toast.makeText(ctx, (if (nowVisible) "Đã hiện" else "Đã ẩn") + " nhóm: " + group, Toast.LENGTH_SHORT).show()
                },
                !isHidden
            ))
        }

        dialogPresenter.appendCheckedCategory("Chọn nhóm kênh để ẩn/hiện", options)
        dialogPresenter.showDialog("Ẩn/Hiện nhóm kênh")
    }

    private fun showHiddenChannelsDialog() {
        val ctx = context ?: return
        val prefs = IptvChannelVisibilityPrefs.instance(ctx)
        val hiddenGroups = prefs.getHiddenGroupNames()
        val hiddenChannels = prefs.getHiddenChannelUrls()

        val allChannels = loadCachedChannels() ?: emptyList()
        val urlToName = HashMap<String, String>()
        for (ch in allChannels) {
            val url = ch.url
            if (url != null) {
                urlToName[url] = ch.name ?: url
            }
        }

        val dialogPresenter = AppDialogPresenter.instance(ctx)
        val options = ArrayList<OptionItem>()

        for (group in hiddenGroups) {
            options.add(UiOptionItem.from("[Nhóm] $group (Nhấn để hiện lại)") {
                prefs.setGroupHidden(group, false)
                Toast.makeText(ctx, "Đã hiện nhóm: $group", Toast.LENGTH_SHORT).show()
            })
        }

        for (url in hiddenChannels) {
            val name = urlToName[url] ?: url
            options.add(UiOptionItem.from("[Kênh] $name (Nhấn để hiện lại)") {
                prefs.setChannelHidden(url, false)
                Toast.makeText(ctx, "Đã hiện kênh: $name", Toast.LENGTH_SHORT).show()
            })
        }

        if (options.isEmpty()) {
            options.add(UiOptionItem.from("Không có kênh hoặc nhóm nào đang bị ẩn") {})
        }

        dialogPresenter.appendStringsCategory("Danh sách ẩn", options)
        dialogPresenter.showDialog("Quản lý kênh ẩn")
    }

    private fun loadCachedChannels(): List<M3uSource>? {
        val ctx = context ?: return null
        return try {
            M3uCache(ctx).loadChannels()
        } catch (e: Exception) {
            null
        }
    }

    private fun showPlayUrlDialog() {
        val ctx = context ?: return
        val builder = AlertDialog.Builder(ctx)
        val inflater = LayoutInflater.from(ctx)
        val contentView = inflater.inflate(R.layout.dialog_play_url, null)

        val input = contentView.findViewById<EditText>(R.id.play_url_input)
        input.hint = "Dán link M3U8 hoặc URL nhúng vào đây..."
        input.inputType = InputType.TYPE_TEXT_VARIATION_URI
        input.setSingleLine(true)

        val dialog = builder
            .setTitle("Play Direct URL")
            .setMessage("Nhập link M3U8 / Embed URL để phát ngay")
            .setView(contentView)
            .setPositiveButton("Phát", null)
            .setNegativeButton("Hủy", null)
            .create()

        dialog.window?.setBackgroundDrawable(ColorDrawable(Color.parseColor("#1A1A24")))
        dialog.show()

        val posBtn = dialog.getButton(AlertDialog.BUTTON_POSITIVE)
        val negBtn = dialog.getButton(AlertDialog.BUTTON_NEGATIVE)
        posBtn.setTextColor(Color.parseColor("#FF6D00"))
        negBtn.setTextColor(Color.parseColor("#888899"))

        posBtn.setOnClickListener {
            val url = input.text.toString().trim()
            if (url.isNotEmpty()) {
                playUrl(url)
                dialog.dismiss()
            } else {
                input.hint = "Nhập URL vào đây!"
            }
        }
    }

    private fun playUrl(url: String) {
        val ctx = context ?: return
        val video = Video()
        video.videoUrl = url
        video.title = "Phát từ URL"
        if (url.contains(".m3u8") || url.contains("m3u8")) {
            video.manifestType = "hls"
        } else if (url.contains(".mpd")) {
            video.manifestType = "dash"
        }
        IptvPlayerActivity.start(ctx, video)
    }

    private fun handleBackup() {
        val ctx = context ?: return
        performDriveAction { GDriveBackupManager.instance(ctx).backup() }
    }

    private fun handleRestore() {
        val ctx = context ?: return
        performDriveAction { GDriveBackupManager.instance(ctx).restore() }
    }

    private fun performDriveAction(driveAction: Runnable) {
        val ctx = context ?: return
        val signIn = GoogleSignInService.instance()
        val accounts = signIn.accounts ?: emptyList()
        if (accounts.isEmpty()) {
            MessageHelpers.showLongMessage(ctx, R.string.need_google_account)
        } else if (accounts.size == 1) {
            signIn.selectAccount(accounts[0])
            driveAction.run()
        } else {
            showAccountPickerDialog(accounts, driveAction)
        }
    }

    private fun showAccountPickerDialog(accounts: List<Account>, driveAction: Runnable) {
        val ctx = context ?: return
        val dialogPresenter = AppDialogPresenter.instance(ctx)
        val signIn = GoogleSignInService.instance()
        val options = ArrayList<OptionItem>()

        for (account in accounts) {
            val displayName = account.name ?: account.email ?: ("Account " + account.id)
            options.add(UiOptionItem.from(
                displayName,
                {
                    signIn.selectAccount(account)
                    driveAction.run()
                },
                account.isSelected
            ))
        }

        dialogPresenter.appendRadioCategory(getString(R.string.select_account_title), options)
        dialogPresenter.showDialog()
    }

    private fun showAppInfo() {
        val ctx = context ?: return
        val version = AppInfoHelpers.getAppVersionName(ctx) ?: "0.3"
        val appName = getString(R.string.app_name)
        val infoText = "$appName v$version\n\nTrình phát đa phương tiện chuyên nghiệp\nTác giả: OK Dev"
        val infoOption = UiOptionItem.from(infoText) {}

        val dialogPresenter = AppDialogPresenter.instance(ctx)
        dialogPresenter.appendLongTextCategory("Thông tin ứng dụng", infoOption)
        dialogPresenter.showDialog("$appName v$version")
    }

    private fun showLogcatDialog() {
        val ctx = context ?: return
        val act = activity ?: return
        Toast.makeText(ctx, "Đang đọc log...", Toast.LENGTH_SHORT).show()

        Thread({
            val full = LogcatLogger.dumpLogcat(ctx)
            act.runOnUiThread { showLogcatDialogUi(ctx, full) }
        }, "logcat-dump").start()
    }

    private fun showLogcatDialogUi(ctx: Context, full: String) {
        val body = if (full.isEmpty()) {
            "(Chưa có log. Nếu đã bật 'Ghi log', hãy dùng app một lúc rồi bấm 'Làm mới'.)"
        } else {
            buildLogcatHeader(ctx) + LogcatLogger.limitLines(full, 3000)
        }

        val logOption = UiOptionItem.from(body) {}
        val actions = ArrayList<OptionItem>()

        actions.add(UiOptionItem.from("Lưu OK-logcat.txt") {
            val path = LogcatLogger.saveLogcat(ctx, full)
            Toast.makeText(ctx, if (path != null) "Đã lưu: $path" else "Lưu file thất bại", Toast.LENGTH_LONG).show()
        })
        actions.add(UiOptionItem.from("Làm mới") { showLogcatDialog() })
        actions.add(UiOptionItem.from("Xóa log đã lưu") {
            LogcatLogger.clearLogs(ctx)
            Toast.makeText(ctx, "Đã xóa log đã lưu", Toast.LENGTH_SHORT).show()
        })

        val dialogPresenter = AppDialogPresenter.instance(ctx)
        dialogPresenter.appendLongTextCategory("Logcat", logOption)
        dialogPresenter.appendStringsCategory("Hành động", actions)
        dialogPresenter.showDialog("Logcat")
    }

    private fun buildLogcatHeader(ctx: Context): String {
        val version = AppInfoHelpers.getAppVersionName(ctx)
        return "===== THÔNG TIN =====\nApp: " + getString(R.string.app_name) + " v" + version + "\n" +
                "Thiết bị: " + android.os.Build.MODEL + " | Android " + android.os.Build.VERSION.RELEASE + "\n\n"
    }

    private fun showUiModeDialog() {
        val ctx = context ?: return
        val dialogPresenter = AppDialogPresenter.instance(ctx)
        val currentMode = GeneralData.instance(ctx).deviceMode
        val options = ArrayList<OptionItem>()

        options.add(UiOptionItem.from(
            "📺 Giao diện TV / TV Box",
            {
                GeneralData.instance(ctx).deviceMode = GeneralData.DEVICE_MODE_TV
                val intent = Intent(ctx, TabNavigationActivity::class.java).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                }
                startActivity(intent)
                activity?.finish()
            },
            currentMode == GeneralData.DEVICE_MODE_TV
        ))

        options.add(UiOptionItem.from(
            "📱 Giao diện Điện thoại (Đang dùng)",
            {
                GeneralData.instance(ctx).deviceMode = GeneralData.DEVICE_MODE_PHONE
            },
            currentMode == GeneralData.DEVICE_MODE_PHONE
        ))

        dialogPresenter.appendRadioCategory("Chọn chế độ giao diện ứng dụng", options)
        dialogPresenter.showDialog("CHỌN CHẾ ĐỘ GIAO DIỆN")
    }
}

