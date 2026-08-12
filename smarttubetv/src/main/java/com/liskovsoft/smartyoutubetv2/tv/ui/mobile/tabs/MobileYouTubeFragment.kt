package com.liskovsoft.smartyoutubetv2.tv.ui.mobile.tabs

import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.bumptech.glide.Glide
import com.liskovsoft.mediaserviceinterfaces.data.MediaGroup
import com.liskovsoft.sharedutils.rx.RxHelper
import com.liskovsoft.smartyoutubetv2.common.app.models.data.Playlist
import com.liskovsoft.smartyoutubetv2.common.app.models.data.Video
import com.liskovsoft.smartyoutubetv2.common.app.presenters.ChannelPresenter
import com.liskovsoft.smartyoutubetv2.common.app.presenters.SearchPresenter
import com.liskovsoft.smartyoutubetv2.common.app.presenters.dialogs.menu.VideoMenuPresenter
import com.liskovsoft.smartyoutubetv2.common.app.presenters.settings.AccountSettingsPresenter
import com.liskovsoft.smartyoutubetv2.common.misc.MediaServiceManager
import com.liskovsoft.smartyoutubetv2.common.prefs.BlockedChannelData
import com.liskovsoft.smartyoutubetv2.tv.R
import com.liskovsoft.smartyoutubetv2.tv.ui.mobile.player.MobilePlayerActivity
import com.liskovsoft.youtubeapi.service.YouTubeServiceManager
import io.reactivex.Observable
import io.reactivex.android.schedulers.AndroidSchedulers
import io.reactivex.disposables.Disposable
import io.reactivex.schedulers.Schedulers

class MobileYouTubeFragment : Fragment() {

    private lateinit var chipContainer: LinearLayout
    private lateinit var recyclerFeed: RecyclerView
    private lateinit var progressLoading: ProgressBar
    private lateinit var btnSearch: ImageButton
    private lateinit var btnCast: ImageButton
    private lateinit var imgProfile: ImageView

    private val categories = listOf(
        "Trang chủ",
        "Shorts",
        "Trẻ em",
        "Thịnh hành",
        "Thể thao",
        "Trực tiếp",
        "Trò chơi",
        "Tin tức",
        "Âm nhạc",
        "Kênh",
        "Kênh đăng ký",
        "Lịch sử",
        "Kênh đã chặn",
        "Danh sách phát",
        "Video của bạn",
        "Hàng chờ phát lại",
        "Cài đặt SmartTube"
    )
    private var selectedCategory = "Trang chủ"

    private lateinit var feedAdapter: YouTubeAdapter
    private var feedDisposable: Disposable? = null
    private var continuationDisposable: Disposable? = null

    private var lastMediaGroup: MediaGroup? = null
    private var isLoadingMore = false

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View? {
        val view = inflater.inflate(R.layout.mobile_fragment_youtube, container, false)
        initViews(view)
        setupCategories()
        setupFeed()
        loadFeedForCategory(selectedCategory)
        return view
    }

    override fun onResume() {
        super.onResume()
        loadProfileAvatar()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        RxHelper.disposeActions(feedDisposable)
        RxHelper.disposeActions(continuationDisposable)
    }

    private fun initViews(view: View) {
        chipContainer = view.findViewById(R.id.container_yt_chips)
        recyclerFeed = view.findViewById(R.id.recycler_yt_feed)
        progressLoading = view.findViewById(R.id.progress_yt_loading)
        btnSearch = view.findViewById(R.id.btn_yt_search)
        btnCast = view.findViewById(R.id.btn_yt_cast)
        imgProfile = view.findViewById(R.id.img_yt_profile)

        btnSearch.setOnClickListener {
            context?.let { ctx ->
                SearchPresenter.instance(ctx).startSearch(null)
            }
        }

        btnCast.setOnClickListener {
            Toast.makeText(context, "Thiết bị đang kết nối phát TV", Toast.LENGTH_SHORT).show()
        }

        imgProfile.setOnClickListener {
            context?.let { ctx ->
                AccountSettingsPresenter.instance(ctx).show()
            }
        }

        loadProfileAvatar()
    }

    private fun loadProfileAvatar() {
        val account = try {
            MediaServiceManager.instance().selectedAccount
        } catch (e: Exception) {
            null
        }

        val avatarUrl = account?.avatarImageUrl
        if (!avatarUrl.isNullOrEmpty()) {
            imgProfile.clearColorFilter()
            Glide.with(this)
                .load(avatarUrl)
                .circleCrop()
                .placeholder(R.drawable.ic_user)
                .error(R.drawable.ic_user)
                .into(imgProfile)
        } else {
            imgProfile.setImageResource(R.drawable.ic_user)
            imgProfile.setColorFilter(Color.parseColor("#FF6D00"))
        }
    }

    private fun setupCategories() {
        chipContainer.removeAllViews()
        for (cat in categories) {
            val chip = TextView(context).apply {
                text = cat
                textSize = 13f
                setPadding(32, 16, 32, 16)
                val params = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                )
                params.setMargins(8, 0, 8, 0)
                layoutParams = params

                val isSelected = cat == selectedCategory
                val bg = GradientDrawable().apply {
                    cornerRadius = 32f
                    if (isSelected) {
                        setColor(Color.parseColor("#000000"))
                        setStroke(3, Color.parseColor("#FFD700"))
                    } else {
                        setColor(Color.parseColor("#1C1C1E"))
                    }
                }
                background = bg
                setTextColor(Color.parseColor(if (isSelected) "#FFD700" else "#AAAAAA"))

                setOnClickListener {
                    if (selectedCategory != cat) {
                        selectedCategory = cat
                        setupCategories()
                        loadFeedForCategory(cat)
                    }
                }
            }
            chipContainer.addView(chip)
        }
    }

    private fun setupFeed() {
        feedAdapter = YouTubeAdapter(
            videos = mutableListOf(),
            onClick = { openPlayer(it) },
            onChannelClick = { openChannel(it) }
        )
        recyclerFeed.layoutManager = LinearLayoutManager(context)
        recyclerFeed.adapter = feedAdapter

        recyclerFeed.addOnScrollListener(object : RecyclerView.OnScrollListener() {
            override fun onScrolled(recyclerView: RecyclerView, dx: Int, dy: Int) {
                super.onScrolled(recyclerView, dx, dy)
                if (dy <= 0) return
                val layoutManager = recyclerView.layoutManager as? LinearLayoutManager ?: return
                val totalItemCount = layoutManager.itemCount
                val lastVisibleItem = layoutManager.findLastVisibleItemPosition()
                if (!isLoadingMore && totalItemCount <= (lastVisibleItem + 4)) {
                    loadMoreFeed()
                }
            }
        })
    }

    private fun loadFeedForCategory(category: String) {
        RxHelper.disposeActions(feedDisposable)
        RxHelper.disposeActions(continuationDisposable)
        lastMediaGroup = null
        isLoadingMore = false

        progressLoading.visibility = View.VISIBLE

        val contentService = YouTubeServiceManager.instance().contentService

        when (category) {
            "Trang chủ" -> observeGroupList(contentService.homeObserve)
            "Shorts" -> observeSingleGroup(contentService.shortsObserve)
            "Trẻ em" -> observeGroupList(contentService.kidsHomeObserve)
            "Thịnh hành" -> observeGroupList(contentService.trendingObserve)
            "Thể thao" -> observeGroupList(contentService.sportsObserve)
            "Trực tiếp" -> observeGroupList(contentService.liveObserve)
            "Trò chơi" -> observeGroupList(contentService.gamingObserve)
            "Tin tức" -> observeGroupList(contentService.newsObserve)
            "Âm nhạc" -> observeGroupList(contentService.musicObserve)
            "Kênh" -> observeSingleGroup(contentService.subscribedChannelsByNewContentObserve)
            "Kênh đăng ký" -> observeSingleGroup(contentService.subscriptionsObserve)
            "Lịch sử" -> observeSingleGroup(contentService.historyObserve)
            "Kênh đã chặn" -> loadBlockedChannels()
            "Danh sách phát" -> observeGroupList(contentService.playlistRowsObserve)
            "Video của bạn" -> observeSingleGroup(contentService.myVideosObserve)
            "Hàng chờ phát lại" -> loadPlaybackQueue()
            "Cài đặt SmartTube" -> openSmartTubeSettings()
            else -> observeGroupList(contentService.homeObserve)
        }
    }

    private fun loadBlockedChannels() {
        val ctx = context ?: return
        progressLoading.visibility = View.GONE
        val blockedList = mutableListOf<Video>()
        for (pair in BlockedChannelData.instance(ctx).channelIdsWithNames) {
            val v = Video()
            v.channelId = pair.first
            v.title = pair.second
            blockedList.add(v)
        }
        feedAdapter.setVideos(blockedList)
    }

    private fun loadPlaybackQueue() {
        progressLoading.visibility = View.GONE
        val queue = Playlist.instance().allReversed
        feedAdapter.setVideos(queue)
    }

    private fun openSmartTubeSettings() {
        progressLoading.visibility = View.GONE
        context?.let { ctx ->
            AccountSettingsPresenter.instance(ctx).show()
        }
    }

    private fun observeGroupList(observable: Observable<List<MediaGroup>>) {
        feedDisposable = observable
            .subscribeOn(Schedulers.io())
            .observeOn(AndroidSchedulers.mainThread())
            .subscribe({ groupList ->
                progressLoading.visibility = View.GONE
                if (!groupList.isNullOrEmpty()) {
                    lastMediaGroup = groupList.firstOrNull { !it.mediaItems.isNullOrEmpty() }
                    val videos = extractVideosFromGroupList(groupList)
                    feedAdapter.setVideos(videos)
                } else {
                    feedAdapter.setVideos(emptyList())
                }
            }, { error ->
                progressLoading.visibility = View.GONE
                Toast.makeText(context, "Lỗi tải dữ liệu: ${error.message}", Toast.LENGTH_SHORT).show()
            })
    }

    private fun observeSingleGroup(observable: Observable<MediaGroup>) {
        feedDisposable = observable
            .subscribeOn(Schedulers.io())
            .observeOn(AndroidSchedulers.mainThread())
            .subscribe({ group ->
                progressLoading.visibility = View.GONE
                if (group != null) {
                    lastMediaGroup = group
                    val videos = extractVideosFromGroup(group)
                    feedAdapter.setVideos(videos)
                } else {
                    feedAdapter.setVideos(emptyList())
                }
            }, { error ->
                progressLoading.visibility = View.GONE
                Toast.makeText(context, "Lỗi tải dữ liệu: ${error.message}", Toast.LENGTH_SHORT).show()
            })
    }

    private fun loadMoreFeed() {
        val group = lastMediaGroup ?: return
        isLoadingMore = true
        val contentService = YouTubeServiceManager.instance().contentService
        continuationDisposable = contentService.continueGroupObserve(group)
            .subscribeOn(Schedulers.io())
            .observeOn(AndroidSchedulers.mainThread())
            .subscribe({ newGroup ->
                isLoadingMore = false
                if (newGroup != null) {
                    lastMediaGroup = newGroup
                    val newVideos = extractVideosFromGroup(newGroup)
                    if (newVideos.isNotEmpty()) {
                        feedAdapter.addVideos(newVideos)
                    }
                }
            }, {
                isLoadingMore = false
            })
    }

    private fun extractVideosFromGroupList(groupList: List<MediaGroup>): List<Video> {
        val list = mutableListOf<Video>()
        for (group in groupList) {
            list.addAll(extractVideosFromGroup(group))
        }
        return list
    }

    private fun extractVideosFromGroup(group: MediaGroup): List<Video> {
        val list = mutableListOf<Video>()
        val items = group.mediaItems ?: return list
        for (item in items) {
            val video = Video.from(item)
            if (video != null && !video.videoId.isNullOrEmpty()) {
                list.add(video)
            }
        }
        return list
    }

    private fun openPlayer(video: Video) {
        val intent = Intent(context, MobilePlayerActivity::class.java).apply {
            putExtra("video_id", video.videoId)
            putExtra("title", video.title ?: "")
            putExtra("channel", video.author ?: "")
            putExtra("subtitle", video.secondTitle?.toString() ?: "")
            putExtra("card_url", (video.cardImageUrl ?: video.bgImageUrl ?: "") as String)
        }
        startActivity(intent)
    }

    private fun openChannel(video: Video) {
        context?.let { ctx ->
            ChannelPresenter.instance(ctx).openChannel(video)
        }
    }

    private fun showVideoOptions(video: Video) {
        context?.let { ctx ->
            VideoMenuPresenter.instance(ctx).showMenu(video)
        }
    }

    private inner class YouTubeAdapter(
        private val videos: MutableList<Video>,
        private val onClick: (Video) -> Unit,
        private val onChannelClick: (Video) -> Unit
    ) : RecyclerView.Adapter<YouTubeAdapter.ViewHolder>() {

        fun setVideos(newVideos: List<Video>) {
            videos.clear()
            videos.addAll(newVideos)
            notifyDataSetChanged()
        }

        fun addVideos(newVideos: List<Video>) {
            val startPos = videos.size
            videos.addAll(newVideos)
            notifyItemRangeInserted(startPos, newVideos.size)
        }

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

            val context = holder.itemView.context

            val thumbUrl: String? = video.cardImageUrl ?: video.bgImageUrl
            if (!thumbUrl.isNullOrEmpty()) {
                Glide.with(context)
                    .load(thumbUrl)
                    .centerCrop()
                    .placeholder(R.drawable.grid_bg)
                    .into(holder.imgThumbnail)
            } else {
                holder.imgThumbnail.setImageResource(R.drawable.grid_bg)
            }

            holder.imgAvatar.setImageResource(R.drawable.ic_user)

            holder.imgAvatar.setOnClickListener { onChannelClick(video) }
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
}
