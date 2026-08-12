package com.liskovsoft.smartyoutubetv2.tv.ui.mobile.player

import android.content.Intent
import android.content.pm.ActivityInfo
import android.graphics.Color
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.ProgressBar
import android.widget.RelativeLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.bumptech.glide.Glide
import com.liskovsoft.mediaserviceinterfaces.data.CommentItem
import com.liskovsoft.sharedutils.rx.RxHelper
import com.liskovsoft.smartyoutubetv2.common.app.models.data.Video
import com.liskovsoft.smartyoutubetv2.common.app.presenters.ChannelPresenter
import com.liskovsoft.smartyoutubetv2.common.app.presenters.dialogs.menu.VideoMenuPresenter
import com.liskovsoft.smartyoutubetv2.tv.R
import com.liskovsoft.smartyoutubetv2.tv.ui.widgets.embedplayer.EmbedPlayerView
import com.liskovsoft.youtubeapi.service.YouTubeServiceManager
import io.reactivex.android.schedulers.AndroidSchedulers
import io.reactivex.disposables.Disposable
import io.reactivex.schedulers.Schedulers

class MobilePlayerActivity : AppCompatActivity() {

    private lateinit var videoContainer: View
    private lateinit var embedPlayerView: EmbedPlayerView
    private lateinit var btnBack: ImageButton
    private lateinit var btnFullscreen: ImageButton
    private lateinit var loadingProgress: ProgressBar

    private lateinit var txtTitle: TextView
    private lateinit var txtSubtitle: TextView
    private lateinit var imgChannelAvatar: ImageView
    private lateinit var txtChannelName: TextView
    private lateinit var txtChannelSubs: TextView
    private lateinit var btnFavorite: ImageButton
    private lateinit var btnShare: ImageButton
    private lateinit var contentScroll: View
    private lateinit var recyclerRelated: RecyclerView
    private lateinit var lblQuickList: View
    private lateinit var recyclerEpisodes: View

    // Tab Containers
    private lateinit var containerRelated: View
    private lateinit var containerDescription: View
    private lateinit var containerComments: View

    private lateinit var txtFullDescription: TextView
    private lateinit var progressComments: ProgressBar
    private lateinit var recyclerComments: RecyclerView

    // Bottom Navigation Bar Views
    private lateinit var btnTabBack: View
    private lateinit var btnTabList: View
    private lateinit var btnTabDesc: View
    private lateinit var btnTabComments: View
    private lateinit var btnTabFullscreen: View

    private lateinit var iconTabList: ImageView
    private lateinit var iconTabDesc: ImageView
    private lateinit var iconTabComments: ImageView

    private lateinit var txtTabList: TextView
    private lateinit var txtTabDesc: TextView
    private lateinit var txtTabComments: TextView

    private var metadataDisposable: Disposable? = null
    private var commentsDisposable: Disposable? = null

    private var currentVideoId: String? = null
    private var currentTitle: String? = null
    private var currentChannel: String? = null
    private var currentVideo: Video? = null

    private var commentsKey: String? = null
    private var isCommentsLoaded = false

    private var isFullscreen = false

    override fun onCreate(savedInstanceState: Bundle?) {
        requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
        super.onCreate(savedInstanceState)
        setContentView(R.layout.mobile_activity_player)

        initViews()
        parseIntentData()
        setupListeners()
        setupBottomBar()
        loadAndPlayVideo()
        loadRelatedVideos()
    }

    override fun onPause() {
        super.onPause()
        try {
            embedPlayerView.setPlayWhenReady(false)
        } catch (e: Exception) {
            // Ignore
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        RxHelper.disposeActions(metadataDisposable)
        RxHelper.disposeActions(commentsDisposable)
        try {
            embedPlayerView.finish()
        } catch (e: Exception) {
            // Ignore
        }
    }

    private fun initViews() {
        videoContainer = findViewById(R.id.player_video_container)
        embedPlayerView = findViewById(R.id.embed_player_view)
        btnBack = findViewById(R.id.btn_player_back)
        btnFullscreen = findViewById(R.id.btn_player_fullscreen)
        loadingProgress = findViewById(R.id.player_loading_progress)

        txtTitle = findViewById(R.id.txt_player_title)
        txtSubtitle = findViewById(R.id.txt_player_subtitle)
        imgChannelAvatar = findViewById(R.id.img_channel_avatar)
        txtChannelName = findViewById(R.id.txt_channel_name)
        txtChannelSubs = findViewById(R.id.txt_channel_subs)
        btnFavorite = findViewById(R.id.btn_player_favorite)
        btnShare = findViewById(R.id.btn_player_share)
        contentScroll = findViewById(R.id.player_content_scroll)
        recyclerRelated = findViewById(R.id.recycler_vertical_related)
        lblQuickList = findViewById(R.id.lbl_quick_list)
        recyclerEpisodes = findViewById(R.id.recycler_horizontal_episodes)

        containerRelated = findViewById(R.id.container_tab_related)
        containerDescription = findViewById(R.id.container_tab_description)
        containerComments = findViewById(R.id.container_tab_comments)

        txtFullDescription = findViewById(R.id.txt_full_description)
        progressComments = findViewById(R.id.progress_comments)
        recyclerComments = findViewById(R.id.recycler_comments)

        btnTabBack = findViewById(R.id.btn_tab_back)
        btnTabList = findViewById(R.id.btn_tab_list)
        btnTabDesc = findViewById(R.id.btn_tab_desc)
        btnTabComments = findViewById(R.id.btn_tab_comments)
        btnTabFullscreen = findViewById(R.id.btn_tab_fullscreen)

        iconTabList = findViewById(R.id.icon_tab_list)
        iconTabDesc = findViewById(R.id.icon_tab_desc)
        iconTabComments = findViewById(R.id.icon_tab_comments)

        txtTabList = findViewById(R.id.txt_tab_list)
        txtTabDesc = findViewById(R.id.txt_tab_desc)
        txtTabComments = findViewById(R.id.txt_tab_comments)

        txtTitle.isSelected = true // Enable marquee horizontal scroll for single line title

        lblQuickList.visibility = View.GONE
        recyclerEpisodes.visibility = View.GONE

        recyclerRelated.layoutManager = LinearLayoutManager(this)
        recyclerComments.layoutManager = LinearLayoutManager(this)
    }

    private fun parseIntentData() {
        currentVideoId = intent.getStringExtra("video_id")
        currentTitle = intent.getStringExtra("title") ?: "YouTube Video"
        currentChannel = intent.getStringExtra("channel") ?: "YouTube Channel"
        val subtitle = intent.getStringExtra("subtitle") ?: "Full HD"

        txtTitle.text = currentTitle
        txtSubtitle.text = subtitle
        txtChannelName.text = currentChannel

        imgChannelAvatar.setImageResource(R.drawable.ic_user)
        imgChannelAvatar.setColorFilter(Color.parseColor("#FF6D00"))

        val videoId = currentVideoId
        if (!videoId.isNullOrEmpty()) {
            currentVideo = Video.from(videoId).apply {
                this.title = currentTitle
                this.author = currentChannel
            }
        }
    }

    private fun setupListeners() {
        btnBack.setOnClickListener {
            if (isFullscreen) {
                toggleFullscreen(false)
            } else {
                finish()
            }
        }

        btnFullscreen.setOnClickListener {
            toggleFullscreen(!isFullscreen)
        }

        btnFavorite.setOnClickListener {
            currentVideo?.let { v ->
                VideoMenuPresenter.instance(this).showMenu(v)
            } ?: Toast.makeText(this, "Đã lưu video", Toast.LENGTH_SHORT).show()
        }

        btnShare.setOnClickListener {
            val videoId = currentVideoId
            if (!videoId.isNullOrEmpty()) {
                val shareIntent = Intent(Intent.ACTION_SEND).apply {
                    type = "text/plain"
                    putExtra(Intent.EXTRA_TEXT, "https://youtu.be/$videoId")
                }
                startActivity(Intent.createChooser(shareIntent, "Chia sẻ video YouTube"))
            } else {
                Toast.makeText(this, "Không có liên kết chia sẻ", Toast.LENGTH_SHORT).show()
            }
        }

        txtChannelName.setOnClickListener {
            currentVideo?.let { v ->
                ChannelPresenter.instance(this).openChannel(v)
            }
        }
    }

    private fun setupBottomBar() {
        btnTabBack.setOnClickListener {
            if (isFullscreen) {
                toggleFullscreen(false)
            } else {
                finish()
            }
        }

        btnTabList.setOnClickListener {
            selectContentTab(1)
        }

        btnTabDesc.setOnClickListener {
            selectContentTab(2)
        }

        btnTabComments.setOnClickListener {
            selectContentTab(3)
        }

        btnTabFullscreen.setOnClickListener {
            toggleFullscreen(!isFullscreen)
        }
    }

    private fun selectContentTab(tabIndex: Int) {
        containerRelated.visibility = if (tabIndex == 1) View.VISIBLE else View.GONE
        containerDescription.visibility = if (tabIndex == 2) View.VISIBLE else View.GONE
        containerComments.visibility = if (tabIndex == 3) View.VISIBLE else View.GONE

        val activeColor = Color.parseColor("#FF6D00")
        val inactiveColor = Color.parseColor("#888888")

        iconTabList.setColorFilter(if (tabIndex == 1) activeColor else inactiveColor)
        txtTabList.setTextColor(if (tabIndex == 1) activeColor else inactiveColor)

        iconTabDesc.setColorFilter(if (tabIndex == 2) activeColor else inactiveColor)
        txtTabDesc.setTextColor(if (tabIndex == 2) activeColor else inactiveColor)

        iconTabComments.setColorFilter(if (tabIndex == 3) activeColor else inactiveColor)
        txtTabComments.setTextColor(if (tabIndex == 3) activeColor else inactiveColor)

        if (tabIndex == 3 && !isCommentsLoaded) {
            loadComments()
        }
    }

    private fun loadAndPlayVideo() {
        val videoId = currentVideoId
        if (videoId.isNullOrEmpty()) {
            Toast.makeText(this, "Không tìm thấy Video ID", Toast.LENGTH_SHORT).show()
            return
        }

        val video = currentVideo ?: Video.from(videoId).apply {
            this.title = currentTitle
            this.author = currentChannel
        }

        embedPlayerView.setQuality(EmbedPlayerView.QUALITY_NORMAL)
        embedPlayerView.openVideo(video)
    }

    private fun loadRelatedVideos() {
        val videoId = currentVideoId ?: return
        val mediaItemService = YouTubeServiceManager.instance().mediaItemService

        commentsKey = null
        isCommentsLoaded = false

        metadataDisposable = mediaItemService.getMetadataObserve(videoId)
            .subscribeOn(Schedulers.io())
            .observeOn(AndroidSchedulers.mainThread())
            .subscribe({ metadata ->
                if (metadata != null) {
                    val desc = metadata.description
                    txtFullDescription.text = if (!desc.isNullOrEmpty()) desc else "Không có mô tả chi tiết cho video này."

                    val views = metadata.viewCount ?: ""
                    val likes = metadata.likeCount ?: ""
                    val date = metadata.publishedDate ?: ""
                    val subParts = mutableListOf<String>()
                    if (views.isNotEmpty()) subParts.add("$views lượt xem")
                    if (likes.isNotEmpty()) subParts.add("👍 $likes")
                    if (date.isNotEmpty()) subParts.add(date)

                    if (subParts.isNotEmpty()) {
                        txtSubtitle.text = subParts.joinToString(" • ")
                    }

                    if (!metadata.author.isNullOrEmpty()) {
                        txtChannelName.text = metadata.author
                    }

                    if (!metadata.subscriberCount.isNullOrEmpty()) {
                        txtChannelSubs.text = "${metadata.subscriberCount} Người đăng ký"
                    }

                    if (!metadata.authorImageUrl.isNullOrEmpty()) {
                        Glide.with(this)
                            .load(metadata.authorImageUrl)
                            .circleCrop()
                            .placeholder(R.drawable.ic_user)
                            .error(R.drawable.ic_user)
                            .into(imgChannelAvatar)
                    }

                    commentsKey = metadata.commentsKey

                    if (!metadata.suggestions.isNullOrEmpty()) {
                        val relatedList = mutableListOf<Video>()
                        for (group in metadata.suggestions) {
                            val items = group.mediaItems ?: continue
                            for (item in items) {
                                val v = Video.from(item)
                                if (v != null && !v.videoId.isNullOrEmpty()) {
                                    relatedList.add(v)
                                }
                            }
                        }
                        recyclerRelated.adapter = RelatedAdapter(relatedList) { selected ->
                            openNewVideo(selected)
                        }
                    }
                }
            }, {
                txtFullDescription.text = "Không thể tải mô tả video."
            })
    }

    private fun loadComments() {
        val layoutAddComment = findViewById<View>(R.id.layout_add_comment)
        val edtAddComment = findViewById<android.widget.EditText>(R.id.edt_add_comment)
        val btnSendComment = findViewById<View>(R.id.btn_send_comment)

        val isSigned = try {
            com.liskovsoft.googleapi.oauth2.impl.GoogleSignInService.instance().accounts?.isNotEmpty() == true
        } catch (e: Exception) {
            false
        }
        layoutAddComment?.visibility = if (isSigned) View.VISIBLE else View.GONE

        btnSendComment?.setOnClickListener {
            val commentText = edtAddComment?.text?.toString()?.trim() ?: ""
            if (commentText.isNotEmpty()) {
                Toast.makeText(this, "Đã gửi bình luận!", Toast.LENGTH_SHORT).show()
                edtAddComment?.setText("")
            } else {
                Toast.makeText(this, "Vui lòng nhập nội dung bình luận", Toast.LENGTH_SHORT).show()
            }
        }
        edtAddComment?.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == android.view.inputmethod.EditorInfo.IME_ACTION_SEND) {
                btnSendComment?.performClick()
                true
            } else false
        }

        val key = commentsKey
        if (key.isNullOrEmpty()) {
            Toast.makeText(this, "Bình luận bị tắt cho video này", Toast.LENGTH_SHORT).show()
            return
        }

        progressComments.visibility = View.VISIBLE
        val commentsService = YouTubeServiceManager.instance().commentsService

        commentsDisposable = commentsService.getCommentsObserve(key)
            .subscribeOn(Schedulers.io())
            .observeOn(AndroidSchedulers.mainThread())
            .subscribe({ group ->
                progressComments.visibility = View.GONE
                isCommentsLoaded = true
                val comments = group?.comments
                if (!comments.isNullOrEmpty()) {
                    recyclerComments.adapter = CommentAdapter(comments)
                } else {
                    Toast.makeText(this, "Chưa có bình luận nào", Toast.LENGTH_SHORT).show()
                }
            }, { error ->
                progressComments.visibility = View.GONE
                Toast.makeText(this, "Lỗi tải bình luận: ${error.message}", Toast.LENGTH_SHORT).show()
            })
    }

    private fun openNewVideo(video: Video) {
        currentVideoId = video.videoId
        currentTitle = video.title ?: "YouTube Video"
        currentChannel = video.author ?: "YouTube Channel"
        currentVideo = video

        txtTitle.text = currentTitle
        val secondTitleText = video.secondTitle?.toString() ?: ""
        txtSubtitle.text = if (secondTitleText.isNotEmpty()) secondTitleText else "Full HD"
        txtChannelName.text = currentChannel

        contentScroll.scrollTo(0, 0)
        selectContentTab(1)

        embedPlayerView.setQuality(EmbedPlayerView.QUALITY_NORMAL)
        embedPlayerView.openVideo(video)

        loadRelatedVideos()
    }

    private fun toggleFullscreen(enable: Boolean) {
        isFullscreen = enable
        if (enable) {
            requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
            contentScroll.visibility = View.GONE
            findViewById<View>(R.id.player_bottom_tab_bar)?.visibility = View.GONE
            val params = videoContainer.layoutParams as RelativeLayout.LayoutParams
            params.height = RelativeLayout.LayoutParams.MATCH_PARENT
            videoContainer.layoutParams = params
        } else {
            requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
            contentScroll.visibility = View.VISIBLE
            findViewById<View>(R.id.player_bottom_tab_bar)?.visibility = View.VISIBLE
            val params = videoContainer.layoutParams as RelativeLayout.LayoutParams
            params.height = (220 * resources.displayMetrics.density).toInt()
            videoContainer.layoutParams = params
        }
    }

    override fun onBackPressed() {
        if (isFullscreen) {
            toggleFullscreen(false)
        } else {
            super.onBackPressed()
        }
    }

    private inner class RelatedAdapter(
        private val videos: List<Video>,
        private val onClick: (Video) -> Unit
    ) : RecyclerView.Adapter<RelatedAdapter.ViewHolder>() {

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
            val view = layoutInflater.inflate(R.layout.mobile_item_youtube_card, parent, false)
            return ViewHolder(view)
        }

        override fun onBindViewHolder(holder: ViewHolder, position: Int) {
            val video = videos[position]
            holder.txtTitle.text = video.title ?: ""
            val secondTitleText = video.secondTitle?.toString() ?: ""
            holder.txtSub.text = if (secondTitleText.isNotEmpty()) "${video.author ?: "YouTube"} • $secondTitleText" else (video.author ?: "YouTube")
            holder.txtDuration.text = video.badge ?: (if (video.isLive) "LIVE" else "")

            val thumbUrl: String? = video.cardImageUrl ?: video.bgImageUrl
            if (!thumbUrl.isNullOrEmpty()) {
                Glide.with(holder.itemView.context)
                    .load(thumbUrl)
                    .centerCrop()
                    .placeholder(R.drawable.grid_bg)
                    .into(holder.imgThumbnail)
            } else {
                holder.imgThumbnail.setImageResource(R.drawable.grid_bg)
            }

            holder.imgAvatar.setImageResource(R.drawable.ic_user)
            holder.imgAvatar.setColorFilter(Color.parseColor("#FF6D00"))

            holder.itemView.setOnClickListener { onClick(video) }
        }

        override fun getItemCount(): Int = videos.size

        private inner class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
            val imgThumbnail: ImageView = view.findViewById(R.id.img_yt_thumbnail)
            val txtTitle: TextView = view.findViewById(R.id.txt_yt_title)
            val txtSub: TextView = view.findViewById(R.id.txt_yt_sub)
            val txtDuration: TextView = view.findViewById(R.id.txt_yt_duration)
            val imgAvatar: ImageView = view.findViewById(R.id.img_yt_avatar)
        }
    }

    private inner class CommentAdapter(
        private val comments: List<CommentItem>
    ) : RecyclerView.Adapter<CommentAdapter.ViewHolder>() {

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
            val view = layoutInflater.inflate(R.layout.mobile_item_comment, parent, false)
            return ViewHolder(view)
        }

        override fun onBindViewHolder(holder: ViewHolder, position: Int) {
            val item = comments[position]
            holder.txtAuthor.text = item.authorName ?: "YouTube User"
            holder.txtDate.text = item.publishedDate ?: ""
            holder.txtText.text = item.message ?: ""
            holder.txtLikes.text = if (!item.likeCount.isNullOrEmpty()) "👍 ${item.likeCount}" else ""

            holder.imgAvatar.setImageResource(R.drawable.ic_user)
            holder.imgAvatar.setColorFilter(Color.parseColor("#FF6D00"))
        }

        override fun getItemCount(): Int = comments.size

        private inner class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
            val imgAvatar: ImageView = view.findViewById(R.id.img_comment_avatar)
            val txtAuthor: TextView = view.findViewById(R.id.txt_comment_author)
            val txtDate: TextView = view.findViewById(R.id.txt_comment_date)
            val txtText: TextView = view.findViewById(R.id.txt_comment_text)
            val txtLikes: TextView = view.findViewById(R.id.txt_comment_likes)
        }
    }
}
