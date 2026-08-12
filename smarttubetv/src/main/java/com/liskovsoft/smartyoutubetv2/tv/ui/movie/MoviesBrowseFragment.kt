package com.liskovsoft.smartyoutubetv2.tv.ui.movie

import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.KeyEvent
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.*
import androidx.fragment.app.Fragment
import androidx.leanback.widget.*
import com.bumptech.glide.Glide
import com.bumptech.glide.load.resource.drawable.DrawableTransitionOptions
import com.liskovsoft.smartyoutubetv2.common.prefs.PluginManager
import com.liskovsoft.smartyoutubetv2.common.plugin.models.*
import com.liskovsoft.smartyoutubetv2.tv.R
import com.liskovsoft.smartyoutubetv2.common.plugin.models.FallbackFilters
import androidx.recyclerview.widget.RecyclerView
import com.liskovsoft.smartyoutubetv2.tv.presenter.CustomListRowPresenter
import com.liskovsoft.smartyoutubetv2.tv.presenter.MovieCardPresenter

class MoviesBrowseFragment : Fragment() {
    private var mPluginManager: PluginManager? = null
    private var mCurrentSource: PluginSource? = null
    private var mHomeSections: List<HomeSection> = emptyList()
    private val mHandler = Handler(Looper.getMainLooper())

    private var mRowsAdapter: ArrayObjectAdapter? = null
    private var mMainGrid: VerticalGridView? = null
    private var mBackdropView: ImageView? = null
    private var mLoadingProgress: ProgressBar? = null
    private var mSearchBackButton: View? = null
    private var mSearchInput: EditText? = null
    private var mSearchContainer: View? = null
    private var mSearchResultsGrid: RecyclerView? = null
    private var mSearchLoading: ProgressBar? = null
    private var mSearchEmpty: TextView? = null

    private var mSearchMode = false
    private var mSearchHasMore = false
    private var mSearchLoadingMore = false
    private var mSearchResultsList: MutableList<MovieItem> = mutableListOf()
    private var mSearchResultsAdapter: CategoryMovieAdapter? = null
    private var mFilterConfig: FilterConfig? = null
    private var mFilterState = FilterState()

    private var mCategoryContainer: View? = null
    private var mCategoryTitle: TextView? = null
    private var mCategoryBackButton: View? = null
    private var mCategoryChipsGrid: HorizontalGridView? = null
    private var mCategoryFilterChipsGrid: HorizontalGridView? = null
    private var mCategoryMoviesGrid: RecyclerView? = null
    private var mCategoryLoading: ProgressBar? = null
    
    private var mCategoryBackdrop: ImageView? = null
    private var mCategoryMode = false
    private var mCategories: List<CategoryItem> = emptyList()
    private var mCategoriesAdapter: ArrayObjectAdapter? = null
    private var mBannerInserted = false
    private var mSelectedCategory: CategoryItem? = null
    private var mCategoryMovieList: MutableList<MovieItem> = mutableListOf()
    private var mCategoryMovieRvAdapter: CategoryMovieAdapter? = null
    private var mCategoryChipsAdapter: ArrayObjectAdapter? = null
    private var mCategoryFilterChipsAdapter: ArrayObjectAdapter? = null
    private var mCategoryFilterState = FilterState()
    private var mCategoryPage = 1
    private var mCategoryHasMore = false
    private var mCategoryLoadingMore = false

    @Volatile
    private var mLoadCanceled = false
    private val mLoadTimeoutRunnable = Runnable {
        mLoadCanceled = true
        mLoadingProgress?.visibility = View.GONE

        val hasToolbar = try {
            mRowsAdapter?.let { adapter ->
                (0 until adapter.size()).any { adapter.get(it) is ToolbarRowItem }
            } == true
        } catch (e: Exception) { false }
        if (!hasToolbar) {
            mRowsAdapter?.add(0, ToolbarRowItem())
        }

        finishLoading()
        if (mMainGrid?.visibility != View.VISIBLE) {
            mMainGrid?.visibility = View.VISIBLE
        }
        mMainGrid?.requestFocus()
        Toast.makeText(context, "Nguồn phim không phản hồi, hãy thử nguồn khác", Toast.LENGTH_SHORT).show()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        mPluginManager = PluginManager.instance(requireContext())
    }

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View? {
        val root = inflater.inflate(R.layout.fragment_movies_modern, container, false)
        mBackdropView = root.findViewById(R.id.movies_backdrop)
        mMainGrid = root.findViewById(R.id.movies_main_grid)
        mLoadingProgress = root.findViewById(R.id.movies_loading_progress)
        mSearchBackButton = root.findViewById(R.id.btn_search_back)
        mSearchInput = root.findViewById(R.id.movies_search_input)
        mSearchContainer = root.findViewById(R.id.movies_search_container)
        mSearchResultsGrid = root.findViewById(R.id.movies_search_results_grid)
        mSearchLoading = root.findViewById(R.id.movies_search_loading)
        mSearchEmpty = root.findViewById(R.id.movies_search_empty)

        mCategoryContainer = root.findViewById(R.id.movies_category_container)
        mCategoryTitle = root.findViewById(R.id.category_title)
        mCategoryBackButton = root.findViewById(R.id.btn_category_back)
        mCategoryChipsGrid = root.findViewById(R.id.category_chips_grid)
        mCategoryFilterChipsGrid = root.findViewById(R.id.category_filter_chips_grid)
        mCategoryMoviesGrid = root.findViewById(R.id.category_movies_grid)
        mCategoryLoading = root.findViewById(R.id.category_loading)
        
        mCategoryBackdrop = root.findViewById(R.id.category_backdrop)

        setupRows()
        setupSearch()
        setupCategoryBrowser()

        return root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        requireActivity().onBackPressedDispatcher.addCallback(viewLifecycleOwner, object : androidx.activity.OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (mSearchMode) {
                    exitSearchMode()
                } else if (mCategoryMode) {
                    exitCategoryBrowser()
                } else {
                    isEnabled = false
                    requireActivity().onBackPressedDispatcher.onBackPressed()
                    isEnabled = true
                }
            }
        })
    }

    private fun calculateNoOfColumns(): Int {
        val displayMetrics = requireContext().resources.displayMetrics
        val screenWidthDp = displayMetrics.widthPixels / displayMetrics.density
        // Card width is 155dp. Add padding/margins ~15dp -> ~170dp per card space.
        val noOfColumns = (screenWidthDp / 170f).toInt()
        return maxOf(2, noOfColumns)
    }

    private fun setupSearch() {
        mSearchBackButton?.setOnClickListener { exitSearchMode() }

        mSearchInput?.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_SEARCH || actionId == EditorInfo.IME_ACTION_DONE) {
                val query = mSearchInput?.text.toString()
                if (query.isNotEmpty()) {
                    mFilterState.searchQuery = query
                    mFilterState.currentPage = 1
                    performSearch(query)
                }
                true
            } else false
        }

        mSearchResultsAdapter = CategoryMovieAdapter(
            mSearchResultsList,
            onItemClick = { movie -> openMovieDetail(movie) },
            onItemFocus = { movie, hasFocus -> if (hasFocus) updateCategoryBackdrop(movie) }
        )
        mSearchResultsGrid?.layoutManager = androidx.recyclerview.widget.GridLayoutManager(requireContext(), calculateNoOfColumns())
        mSearchResultsGrid?.adapter = mSearchResultsAdapter
    }

    private fun enterSearchMode() {
        mSearchMode = true
        mFilterState.clear()
        mSearchContainer?.visibility = View.VISIBLE
        mMainGrid?.visibility = View.GONE
        mSearchInput?.setText("")
        mSearchInput?.requestFocus()
        mSearchResultsAdapter?.clear()
        val imm = requireContext().getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
        imm.showSoftInput(mSearchInput, InputMethodManager.SHOW_IMPLICIT)
    }

    private fun exitSearchMode() {
        mSearchMode = false
        mSearchHasMore = false
        mSearchLoadingMore = false
        mFilterState.clear()
        mSearchContainer?.visibility = View.GONE
        mSearchLoading?.visibility = View.GONE
        mSearchEmpty?.visibility = View.GONE
        mSearchResultsGrid?.clearOnScrollListeners()
        val imm = requireContext().getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
        imm.hideSoftInputFromWindow(mSearchInput?.windowToken, 0)
        mMainGrid?.visibility = View.VISIBLE
        mMainGrid?.requestFocus()
    }

    private fun performSearch(query: String) {
        val source = mCurrentSource ?: return
        android.util.Log.d("MovieDebug", "[USER_ACTION] [SEARCH] -> Người dùng nhập từ khóa tìm kiếm: '$query'")
        mSearchResultsList.clear()
        mSearchResultsAdapter?.notifyDataSetChanged()
        mSearchLoading?.visibility = View.VISIBLE
        mSearchEmpty?.visibility = View.GONE
        mSearchHasMore = false
        mSearchLoadingMore = false
        mSearchResultsGrid?.clearOnScrollListeners()
        mFilterState.currentPage = 1
        mFilterState.searchQuery = query
        fetchSearchPage(query, 1)
    }

    private fun fetchSearchPage(query: String, page: Int) {
        val source = mCurrentSource ?: return
        val filters = if (mFilterState.hasActiveFilters()) mFilterState.toMap() else null

        mPluginManager?.fetchAndSearch(source, query, page, filters) { result ->
            mHandler.post {
                mSearchLoading?.visibility = View.GONE
                mSearchLoadingMore = false

                val items = result?.items
                if (items != null && items.isNotEmpty()) {
                    val existingIds = mSearchResultsList.map { it.slug }.toSet()
                    val newItems = items.filter { it.slug !in existingIds }
                    if (newItems.isNotEmpty()) {
                        val startPos = mSearchResultsList.size
                        mSearchResultsList.addAll(newItems)
                        mSearchResultsAdapter?.notifyItemRangeInserted(startPos, newItems.size)
                        mSearchHasMore = true
                    } else {
                        mSearchHasMore = false
                    }
                } else if (page == 1) {
                    mSearchEmpty?.visibility = View.VISIBLE
                    mSearchHasMore = false
                }
                if (mSearchHasMore) setupSearchLazyLoad(query)
            }
        }
    }

    private fun setupSearchLazyLoad(query: String) {
        val grid = mSearchResultsGrid ?: return
        grid.clearOnScrollListeners()
        grid.addOnScrollListener(object : RecyclerView.OnScrollListener() {
            override fun onScrolled(recyclerView: RecyclerView, dx: Int, dy: Int) {
                super.onScrolled(recyclerView, dx, dy)
                val layoutManager = recyclerView.layoutManager as? androidx.recyclerview.widget.GridLayoutManager ?: return
                val totalItemCount = layoutManager.itemCount
                val lastVisible = layoutManager.findLastVisibleItemPosition()

                if (!mSearchLoadingMore && mSearchHasMore && totalItemCount > 0 && lastVisible >= totalItemCount - 5) {
                    mSearchLoadingMore = true
                    mFilterState.currentPage++
                    fetchSearchPage(query, mFilterState.currentPage)
                }
            }
        })
    }

    override fun onResume() {
        super.onResume()
        if (mCurrentSource == null) loadSources()
    }

    private fun setupRows() {
        val presenterSelector = ClassPresenterSelector()
        presenterSelector.addClassPresenter(ToolbarRowItem::class.java, ToolbarRowPresenter())
        presenterSelector.addClassPresenter(BannerItem::class.java, BannerPresenter())
        presenterSelector.addClassPresenter(ListRow::class.java, CustomListRowPresenter())
        presenterSelector.addClassPresenter(LoadMoreItem::class.java, LoadMorePresenter())

        mRowsAdapter = ArrayObjectAdapter(presenterSelector)
        val bridgeAdapter = ItemBridgeAdapter(mRowsAdapter)

        bridgeAdapter.setAdapterListener(object : ItemBridgeAdapter.AdapterListener() {
            override fun onBind(viewHolder: ItemBridgeAdapter.ViewHolder) {
                val item = viewHolder.item
                if (item is BannerItem) {
                    viewHolder.itemView.isFocusable = true
                    viewHolder.itemView.isClickable = true
                    viewHolder.itemView.setOnClickListener { openMovieDetail(item.movie) }
                } else if (item is ListRow) {
                    viewHolder.itemView.isFocusable = false
                }

                val existingListener = viewHolder.itemView.onFocusChangeListener
                viewHolder.itemView.onFocusChangeListener = View.OnFocusChangeListener { v, hasFocus ->
                    existingListener?.onFocusChange(v, hasFocus)
                    if (hasFocus && item is BannerItem) updateBackdrop(item.movie)
                }
            }

            override fun onUnbind(viewHolder: ItemBridgeAdapter.ViewHolder) {
                viewHolder.itemView.setOnClickListener(null)
            }
        })

        mMainGrid?.adapter = bridgeAdapter
    }

    private fun loadSources() {
        val sources = mPluginManager?.getSources() ?: emptyList()
        if (sources.isNotEmpty()) {
            mCurrentSource = mPluginManager?.getActiveSource() ?: sources.first()
            loadHomeContent()
        }
    }

    private fun loadHomeContent() {
        val source = mCurrentSource ?: return
        mLoadCanceled = false
        mLoadingProgress?.visibility = View.VISIBLE
        mRowsAdapter?.clear()
        mRowsAdapter?.add(ToolbarRowItem())
        mFilterState.clear()
        mBannerInserted = false

        mHandler.removeCallbacks(mLoadTimeoutRunnable)
        mHandler.postDelayed(mLoadTimeoutRunnable, 20000)

        Thread {
            try {
                if (mLoadCanceled) return@Thread
                val categories = mPluginManager?.getPrimaryCategories(source) ?: emptyList()
                if (mLoadCanceled) return@Thread
                val sections = mPluginManager?.getHomeSections(source) ?: emptyList()
                if (mLoadCanceled) return@Thread
                mFilterConfig = mPluginManager?.getFilterConfig(source)

                val catAdapter = ArrayObjectAdapter(CategoryPresenter())
                catAdapter.addAll(0, categories)

                mHandler.post {
                    if (mLoadCanceled) return@post
                    mHandler.removeCallbacks(mLoadTimeoutRunnable)
                    mHomeSections = sections
                    mCategoriesAdapter = catAdapter
                    loadAllRows()
                }
            } catch (e: Exception) {
                android.util.Log.e("MoviesBrowse", "loadHomeContent thread error", e)
                mHandler.post {
                    mLoadCanceled = true
                    mLoadingProgress?.visibility = View.GONE
                    mMainGrid?.visibility = View.VISIBLE
                    mMainGrid?.requestFocus()
                    Toast.makeText(context, "Lỗi tải dữ liệu nguồn phim", Toast.LENGTH_SHORT).show()
                }
            }
        }.start()
    }

    private fun loadAllRows() {
        val source = mCurrentSource ?: return
        var loadedCount = 0
        var totalSections = 0

        for (section in mHomeSections) {
            totalSections++

            mPluginManager?.getUrlList(source, section.slug, section.path, 1, mFilterState.toMap()) { url ->
                if (mLoadCanceled) {
                    mHandler.post {
                        loadedCount++
                        if (loadedCount >= totalSections) {
                            mLoadingProgress?.visibility = View.GONE
                        }
                    }
                    return@getUrlList
                }
                if (url != null) {
                    mPluginManager?.fetchAndParseList(source, url) { result ->
                        if (mLoadCanceled) {
                            mHandler.post {
                                loadedCount++
                                if (loadedCount >= totalSections) {
                                    mLoadingProgress?.visibility = View.GONE
                                }
                            }
                            return@fetchAndParseList
                        }
                        mHandler.post {
                            if (mLoadCanceled) {
                                loadedCount++
                                if (loadedCount >= totalSections) {
                                    mLoadingProgress?.visibility = View.GONE
                                }
                                return@post
                            }
                            result?.items?.let { if (it.isNotEmpty()) addSectionRow(section, it) }
                            loadedCount++
                            if (loadedCount >= totalSections) {
                                finishLoading()
                                mLoadingProgress?.visibility = View.GONE
                                if (mMainGrid?.hasFocus() == false) mMainGrid?.requestFocus()
                            }
                        }
                    }
                } else {
                    mHandler.post {
                        loadedCount++
                        if (loadedCount >= totalSections) {
                            finishLoading()
                            mLoadingProgress?.visibility = View.GONE
                            if (mMainGrid?.hasFocus() == false) mMainGrid?.requestFocus()
                        }
                    }
                }
            }
        }

        if (totalSections == 0) {
            finishLoading()
            mLoadingProgress?.visibility = View.GONE
        }
    }

    private fun addSectionRow(section: HomeSection, items: List<MovieItem>) {
        if (!mBannerInserted && items.isNotEmpty()) {
            mBannerInserted = true
            val featuredMovie = items.first()
            if (featuredMovie.source.isNullOrEmpty()) featuredMovie.source = mCurrentSource?.url
            val bannerItem = BannerItem(featuredMovie)
            mRowsAdapter?.add(bannerItem)
            updateBackdrop(featuredMovie)

            mCurrentSource?.let { source ->
                mPluginManager?.getDetailUrl(source, featuredMovie.slug)?.let { url ->
                    mPluginManager?.fetchAndParseDetail(source, url) { detail ->
                        if (detail != null) mHandler.post {
                            if (mLoadCanceled) return@post
                            featuredMovie.description = detail.description
                            featuredMovie.quality = detail.quality
                            featuredMovie.year = detail.year.toString()
                            featuredMovie.episodeCurrent = detail.episodeCurrent
                            if (featuredMovie.backdropUrl == null) featuredMovie.backdropUrl = detail.backdropUrl
                            val idx = mRowsAdapter?.indexOf(bannerItem) ?: -1
                            if (idx != -1) mRowsAdapter?.replace(idx, bannerItem)
                        }
                    }
                }
            }

            // Insert categories after banner
            mCategoriesAdapter?.let { catAdapter ->
                if (catAdapter.size() > 0) {
                    mRowsAdapter?.add(ListRow(HeaderItem("Th\u1EC3 lo\u1EA1i"), catAdapter))
                }
            }
        }

        val presenter = MovieCardPresenter(requireContext())
        presenter.setOnItemClickListener { item ->
            if (item is MovieItem) openMovieDetail(item)
        }
        val listRowAdapter = ArrayObjectAdapter(presenter)
        listRowAdapter.addAll(0, items)
        mRowsAdapter?.add(ListRow(HeaderItem(section.title), listRowAdapter))
    }

    private fun updateBackdrop(movie: MovieItem) {
        val backdropUrl = movie.backdropUrl ?: movie.posterUrl ?: movie.thumbnailUrl
        backdropUrl?.let {
            Glide.with(this).load(it).transition(DrawableTransitionOptions.withCrossFade()).into(mBackdropView!!)
        }
    }

    private fun setupCategoryBrowser() {
        mCategoryBackButton?.setOnClickListener { exitCategoryBrowser() }

        val spacingPx = (10 * resources.displayMetrics.density).toInt()
        mCategoryFilterChipsGrid?.setItemSpacing(spacingPx)
        mCategoryFilterChipsGrid?.setGravity(android.view.Gravity.CENTER_VERTICAL)
        mCategoryChipsGrid?.setItemSpacing(spacingPx)
        mCategoryChipsGrid?.setGravity(android.view.Gravity.CENTER_VERTICAL)

        val chipPresenter = CategoryChipPresenter()
        mCategoryChipsAdapter = ArrayObjectAdapter(chipPresenter)
        mCategoryChipsGrid?.adapter = ItemBridgeAdapter(mCategoryChipsAdapter)

        // Filter chips in category browser
        val filterChipPresenter = CategoryFilterChipPresenter()
        mCategoryFilterChipsAdapter = ArrayObjectAdapter(filterChipPresenter)
        mCategoryFilterChipsGrid?.adapter = ItemBridgeAdapter(mCategoryFilterChipsAdapter)

        mCategoryMovieRvAdapter = CategoryMovieAdapter(
            mCategoryMovieList,
            onItemClick = { movie -> openMovieDetail(movie) },
            onItemFocus = { movie, hasFocus -> if (hasFocus) updateCategoryBackdrop(movie) }
        )
        mCategoryMoviesGrid?.layoutManager = androidx.recyclerview.widget.GridLayoutManager(requireContext(), calculateNoOfColumns())
        mCategoryMoviesGrid?.adapter = mCategoryMovieRvAdapter
    }
    
    private fun updateCategoryBackdrop(movie: MovieItem) {
        val bgUrl = movie.backdropUrl?.ifEmpty { null } ?: movie.posterUrl
        if (!bgUrl.isNullOrEmpty() && mCategoryBackdrop != null) {
            Glide.with(this)
                .load(bgUrl)
                .transition(DrawableTransitionOptions.withCrossFade())
                .into(mCategoryBackdrop!!)
        }
    }

    private fun exitCategoryBrowser() {
        mCategoryMode = false
        mCategoryHasMore = false
        mCategoryLoadingMore = false
        mCategoryFilterState.clear()
        mCategoryContainer?.visibility = View.GONE
        mCategoryMoviesGrid?.clearOnScrollListeners()
        mMainGrid?.visibility = View.VISIBLE
        mMainGrid?.requestFocus()
    }

    private fun openCategoryBrowser(cat: CategoryItem) {
        android.util.Log.d("MovieDebug", "[USER_ACTION] [CATEGORY] -> Người dùng chọn Thể loại: '${cat.name}' (Slug: '${cat.slug}')")
        mSelectedCategory = cat
        mCategoryPage = 1
        mCategoryHasMore = false
        mCategoryLoadingMore = false
        mCategoryMode = true
        mCategoryMovieList.clear()
        mCategoryMovieRvAdapter?.notifyDataSetChanged()
        mCategoryMoviesGrid?.clearOnScrollListeners()
        mMainGrid?.visibility = View.GONE
        mCategoryContainer?.visibility = View.VISIBLE
        mCategoryTitle?.text = "Thể loại: ${cat.name}"
        loadCategories()
        loadCategoryFilterChips()
        loadCategoryMovies(cat.slug, 1)
        mCategoryChipsGrid?.requestFocus()
    }

    private fun loadCategoryFilterChips() {
        val source = mCurrentSource ?: return
        mCategoryFilterChipsAdapter?.clear()

        val sorts = mFilterConfig?.sort?.map { CategoryItem(it.name, it.value) } ?: emptyList()
        val sortLabel = if (mCategoryFilterState.selectedSort != null)
            "S\u1EAFp x\u1EBFp: ${mCategoryFilterState.selectedSort!!.name}" else "S\u1EAFp x\u1EBFp"
        mCategoryFilterChipsAdapter?.add(FilterChipData("sort", sortLabel, sorts, mCategoryFilterState.selectedSort?.let { CategoryItem(it.name, it.value) }))

        val genreLabel = if (mCategoryFilterState.selectedGenre != null)
            "Th\u1EC3 lo\u1EA1i: ${mCategoryFilterState.selectedGenre!!.name}" else "Th\u1EC3 lo\u1EA1i"
        mCategoryFilterChipsAdapter?.add(FilterChipData("genre", genreLabel,
            mFilterConfig?.effectiveGenres()?.ifEmpty { null } ?: FallbackFilters.defaultGenres,
            mCategoryFilterState.selectedGenre))

        val countryLabel = if (mCategoryFilterState.selectedCountry != null)
            "Qu\u1ED1c gia: ${mCategoryFilterState.selectedCountry!!.name}" else "Qu\u1ED1c gia"
        mCategoryFilterChipsAdapter?.add(FilterChipData("country", countryLabel,
            mFilterConfig?.effectiveCountries()?.ifEmpty { null } ?: FallbackFilters.defaultCountries,
            mCategoryFilterState.selectedCountry))

        val yearLabel = if (mCategoryFilterState.selectedYear != null)
            "N\u0103m: ${mCategoryFilterState.selectedYear!!.name}" else "N\u0103m"
        mCategoryFilterChipsAdapter?.add(FilterChipData("year", yearLabel,
            mFilterConfig?.effectiveYears()?.ifEmpty { null } ?: FallbackFilters.defaultYears,
            mCategoryFilterState.selectedYear))

        val types = mFilterConfig?.effectiveTypes()?.ifEmpty { null }
            ?: listOf(CategoryItem("T\u1EA5t c\u1EA3", ""), CategoryItem("Phim b\u1ED9", "series"), CategoryItem("Phim l\u1EBB", "single"))
        val typeLabel = if (mCategoryFilterState.selectedType != null)
            "Lo\u1EA1i: ${mCategoryFilterState.selectedType!!.name}" else "Lo\u1EA1i"
        mCategoryFilterChipsAdapter?.add(FilterChipData("type", typeLabel, types, mCategoryFilterState.selectedType))
    }

    private fun onCategoryFilterChanged() {
        android.util.Log.d("MovieDebug", "[USER_ACTION] [FILTER] -> Người dùng thay đổi bộ lọc: Sort='${mCategoryFilterState.selectedSort?.name}', Genre='${mCategoryFilterState.selectedGenre?.name}', Country='${mCategoryFilterState.selectedCountry?.name}', Year='${mCategoryFilterState.selectedYear?.name}', Type='${mCategoryFilterState.selectedType?.name}'")
        mCategoryPage = 1
        mCategoryHasMore = false
        mCategoryLoadingMore = false
        mCategoryMovieList.clear()
        mCategoryMovieRvAdapter?.notifyDataSetChanged()
        val slug = mSelectedCategory?.slug ?: return
        loadCategoryFilterChips()
        loadCategoryMovies(slug, 1)
    }

    private inner class FilterChipData(
        val kind: String,
        val label: String,
        val options: List<CategoryItem>,
        val current: CategoryItem?
    )

    private inner class CategoryFilterChipPresenter : Presenter() {
        override fun onCreateViewHolder(parent: ViewGroup): ViewHolder {
            val density = parent.context.resources.displayMetrics.density
            val chip = TextView(parent.context).apply {
                val pxMarginEnd = (10 * density).toInt()
                val pxHeight = (34 * density).toInt()
                val lp = FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    pxHeight
                ).apply {
                    marginEnd = pxMarginEnd
                    gravity = android.view.Gravity.CENTER_VERTICAL
                }
                layoutParams = lp
                val pxPaddingHorizontal = (14 * density).toInt()
                setPadding(pxPaddingHorizontal, 0, pxPaddingHorizontal, 0)
                textSize = 14f
                gravity = android.view.Gravity.CENTER
                isFocusable = true
                isClickable = true
                setBackgroundResource(R.drawable.filter_chip_bg)
            }
            return ViewHolder(chip)
        }
        override fun onBindViewHolder(viewHolder: ViewHolder, item: Any) {
            val data = item as FilterChipData
            val chip = viewHolder.view as TextView
            chip.text = data.label
            chip.setTextColor(if (data.current != null) 0xFF000000.toInt() else 0xFFAAAAAA.toInt())
            chip.setOnClickListener {
                showFilterOptionDialog(data.label.substringBefore(":"), data.options, data.current) { sel ->
                    val cat: CategoryItem? = sel
                    when (data.kind) {
                        "sort" -> mCategoryFilterState.selectedSort = if (sel != null) FilterSortItem(sel.name, sel.slug) else null
                        "genre" -> mCategoryFilterState.selectedGenre = cat
                        "country" -> mCategoryFilterState.selectedCountry = cat
                        "year" -> mCategoryFilterState.selectedYear = cat
                        "type" -> mCategoryFilterState.selectedType = cat
                    }
                    onCategoryFilterChanged()
                }
            }
        }
        override fun onUnbindViewHolder(viewHolder: ViewHolder) {}
    }

    private fun loadCategories() {
        val source = mCurrentSource ?: return
        if (mCategories.isNotEmpty()) {
            mCategoryChipsAdapter?.clear()
            mCategoryChipsAdapter?.addAll(0, mCategories)
            return
        }
        Thread {
            val cats = mPluginManager?.getPrimaryCategories(source) ?: emptyList()
            mCategories = cats
            mHandler.post {
                mCategoryChipsAdapter?.clear()
                mCategoryChipsAdapter?.addAll(0, cats)
            }
        }.start()
    }

    private fun loadCategoryMovies(slug: String, page: Int) {
        android.util.Log.d("MoviesBrowse", "loadCategoryMovies: slug=$slug page=$page source=${mCurrentSource?.name}")
        val source = mCurrentSource ?: run {
            android.util.Log.e("MoviesBrowse", "loadCategoryMovies: mCurrentSource is NULL!")
            return
        }
        if (page == 1) {
            mCategoryLoading?.visibility = View.VISIBLE
            mCategoryLoadingMore = false
        }
        val filters = if (mCategoryFilterState.hasActiveFilters()) mCategoryFilterState.toMap() else null
        mPluginManager?.getUrlList(source, slug, "", page, filters) { url ->
            android.util.Log.d("MoviesBrowse", "getUrlList callback: url=$url")
            if (url != null) {
                mPluginManager?.fetchAndParseList(source, url) { result ->
                    android.util.Log.d("MoviesBrowse", "fetchAndParseList callback: result is ${if (result != null) "not null" else "null"}, items=${result?.items?.size}")
                    mHandler.post {
                        mCategoryLoading?.visibility = View.GONE
                        mCategoryLoadingMore = false
                        val items = result?.items
                        if (items != null && items.isNotEmpty()) {
                            val existingIds = mCategoryMovieList.map { it.slug }.toSet()
                            val newItems = items.filter { it.slug !in existingIds }
                            android.util.Log.d("MoviesBrowse", "Adding ${newItems.size} new items. List size before: ${mCategoryMovieList.size}")
                            if (newItems.isNotEmpty()) {
                                if (page == 1) {
                                    mCategoryMovieList.clear()
                                    mCategoryMovieRvAdapter?.notifyDataSetChanged()
                                }
                                val startPos = mCategoryMovieList.size
                                mCategoryMovieList.addAll(newItems)
                                mCategoryMovieRvAdapter?.notifyItemRangeInserted(startPos, newItems.size)
                                android.util.Log.d("MoviesBrowse", "List size after: ${mCategoryMovieList.size}, adapter itemCount: ${mCategoryMovieRvAdapter?.itemCount}")
                                
                                mCategoryMoviesGrid?.post {
                                    android.util.Log.d("MoviesBrowse", "RecyclerView dimensions AFTER post: w=${mCategoryMoviesGrid?.width}, h=${mCategoryMoviesGrid?.height}")
                                    android.util.Log.d("MoviesBrowse", "RecyclerView visibility AFTER post: RV=${mCategoryMoviesGrid?.visibility}, Container=${mCategoryContainer?.visibility}")
                                    val childCount = mCategoryMoviesGrid?.childCount ?: 0
                                    android.util.Log.d("MoviesBrowse", "RecyclerView childCount AFTER post: $childCount")
                                }
                                mCategoryHasMore = true
                            } else {
                                mCategoryHasMore = false
                            }
                        } else {
                            if (page == 1) {
                                android.util.Log.e("MoviesBrowse", "No items for slug=$slug url=$url")
                            }
                            mCategoryHasMore = false
                        }
                        mCategoryPage = page
                        if (mCategoryHasMore) setupCategoryLazyLoad(slug)
                    }
                }
            } else {
                android.util.Log.e("MoviesBrowse", "getUrlList returned null for slug=$slug")
                mHandler.post {
                    mCategoryLoading?.visibility = View.GONE
                    mCategoryLoadingMore = false
                    mCategoryHasMore = false
                }
            }
        }
    }

    private fun setupCategoryLazyLoad(slug: String) {
        val grid = mCategoryMoviesGrid ?: return
        grid.clearOnScrollListeners()
        grid.addOnScrollListener(object : RecyclerView.OnScrollListener() {
            override fun onScrolled(recyclerView: RecyclerView, dx: Int, dy: Int) {
                super.onScrolled(recyclerView, dx, dy)
                val lm = recyclerView.layoutManager as? androidx.recyclerview.widget.GridLayoutManager ?: return
                val totalItemCount = lm.itemCount
                val lastVisible = lm.findLastVisibleItemPosition()
                if (!mCategoryLoadingMore && mCategoryHasMore && totalItemCount > 0 && lastVisible >= totalItemCount - 5) {
                    mCategoryLoadingMore = true
                    mCategoryPage++
                    android.util.Log.d("MovieDebug", "[PAGINATION] [LOAD_MORE] -> Người dùng cuộn xuống gần cuối -> Tải thêm trang $mCategoryPage cho thể loại '$slug'")
                    loadCategoryMovies(slug, mCategoryPage)
                }
            }
        })
    }

    private inner class CategoryChipPresenter : Presenter() {
        override fun onCreateViewHolder(parent: ViewGroup): ViewHolder {
            val density = parent.context.resources.displayMetrics.density
            val chip = TextView(parent.context).apply {
                val pxMarginEnd = (10 * density).toInt()
                val pxHeight = (34 * density).toInt()
                val lp = FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    pxHeight
                ).apply {
                    marginEnd = pxMarginEnd
                    gravity = android.view.Gravity.CENTER_VERTICAL
                }
                layoutParams = lp
                val pxPaddingHorizontal = (14 * density).toInt()
                setPadding(pxPaddingHorizontal, 0, pxPaddingHorizontal, 0)
                textSize = 14f
                gravity = android.view.Gravity.CENTER
                isFocusable = true
                isClickable = true
                setBackgroundResource(R.drawable.filter_chip_bg)
            }
            return ViewHolder(chip)
        }
        override fun onBindViewHolder(viewHolder: ViewHolder, item: Any) {
            val cat = item as CategoryItem
            val chip = viewHolder.view as TextView
            val isSelected = cat.slug == mSelectedCategory?.slug
            chip.text = cat.name
            chip.setTextColor(if (isSelected) 0xFF000000.toInt() else 0xFFFFFFFF.toInt())
            chip.setBackgroundResource(R.drawable.filter_chip_bg)
            chip.setOnClickListener {
                openCategory(cat)
            }
        }
        override fun onUnbindViewHolder(viewHolder: ViewHolder) {}
    }

    private fun showSourceSelectorDialog() {
        val allSources = mPluginManager?.getSources() ?: return
        val sources = allSources.filter {
            it.enabled || (mCurrentSource != null && it.url == mCurrentSource?.url && it.id == mCurrentSource?.id)
        }
        val currentIndex = sources.indexOfFirst { it.url == mCurrentSource?.url && it.id == mCurrentSource?.id }.coerceAtLeast(0)
        
        val dialog = AlertDialog.Builder(requireContext(), android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle("Ch\u1ECDn ngu\u1ED3n phim")
            .setSingleChoiceItems(sources.map { if (it.isJsPlugin) "\uD83C\uDFAC " + it.name else "\uD83D\uDCCB " + it.name }.toTypedArray(), currentIndex) { dialogInterface, which ->
                val selectedSource = sources[which]
                if (mCurrentSource?.url != selectedSource.url || mCurrentSource?.id != selectedSource.id) {
                    mLoadCanceled = true
                    mHandler.removeCallbacks(mLoadTimeoutRunnable)
                    mLoadingProgress?.visibility = View.GONE
                    mCurrentSource = selectedSource
                    mPluginManager?.setActiveSource(selectedSource)
                    mPluginManager?.clearCaches()
                    mPluginManager?.destroyPluginEngine(mCurrentSource?.url)
                    loadHomeContent()
                }
                dialogInterface.dismiss()
            }.create()
            
        dialog.setOnShowListener {
            dialog.listView?.let { listView ->
                listView.post {
                    listView.setSelection(currentIndex)
                    val child = listView.getChildAt(currentIndex - listView.firstVisiblePosition)
                    child?.requestFocus()
                }
            }
        }
        dialog.show()
    }

    private fun showFilterOptionDialog(title: String, options: List<CategoryItem>,
                                       currentSelection: CategoryItem?,
                                       onSelected: (CategoryItem?) -> Unit) {
        val items = listOf(CategoryItem("T\u1EA5t c\u1EA3", "")) + options
        val names = items.map { it.name }.toTypedArray()

        AlertDialog.Builder(requireContext(), android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle(title)
            .setItems(names) { _, which ->
                val selected = items[which]
                onSelected(if (selected.slug.isEmpty()) null else selected)
            }
            .setOnKeyListener { _, keyCode, _ ->
                if (keyCode == KeyEvent.KEYCODE_BACK) {
                    onSelected(null)
                    true
                } else false
            }
            .show()
    }

    private fun finishLoading() {
        // Fallback: insert categories if banner never appeared (all sections empty)
        if (!mBannerInserted) {
            mCategoriesAdapter?.let { catAdapter ->
                if (catAdapter.size() > 0) {
                    mRowsAdapter?.add(ListRow(HeaderItem("Th\u1EC3 lo\u1EA1i"), catAdapter))
                }
            }
        }
    }

    // --- Load More Presenter ---

    private inner class LoadMorePresenter : Presenter() {
        override fun onCreateViewHolder(parent: ViewGroup): ViewHolder {
            val button = Button(parent.context).apply {
                text = "T\u1EA3i th\u00EAm..."
                setTextColor(0xFFFFFFFF.toInt())
                setBackgroundColor(0x66FFC107.toInt())
                textSize = 16f
                isFocusable = true
                isClickable = true
                setOnClickListener {
                    loadAllRows()
                }
            }
            return ViewHolder(button)
        }

        override fun onBindViewHolder(viewHolder: ViewHolder, item: Any) {}
        override fun onUnbindViewHolder(viewHolder: ViewHolder) {}
    }

    // --- Other Presenters ---

    private inner class BannerPresenter : Presenter() {
        override fun onCreateViewHolder(parent: ViewGroup) = ViewHolder(
            LayoutInflater.from(parent.context).inflate(R.layout.item_movie_banner, parent, false)
        )
        override fun onBindViewHolder(viewHolder: ViewHolder, item: Any) {
            val movie = (item as BannerItem).movie
            val v = viewHolder.view
            v.findViewById<TextView>(R.id.banner_title).text = movie.name
            v.findViewById<TextView>(R.id.banner_year).text = movie.year
            v.findViewById<TextView>(R.id.banner_quality).text = movie.quality ?: "FHD"
            v.findViewById<TextView>(R.id.banner_status).text = movie.episodeCurrent ?: "Ho\u00E0n t\u1EA5t"
            v.findViewById<TextView>(R.id.banner_desc).text = movie.description
            val watchBtn = v.findViewById<View>(R.id.btn_banner_watch)
            val watchText = watchBtn.findViewById<TextView>(R.id.banner_watch_text)
            val watchIcon = watchBtn.findViewById<ImageView>(R.id.banner_watch_icon)
            watchBtn.setOnClickListener { openMovieDetail(movie) }
            watchBtn.onFocusChangeListener = View.OnFocusChangeListener { view, hasFocus ->
                val color = if (hasFocus) 0xFF000000.toInt() else 0xFFFFFFFF.toInt()
                watchText.setTextColor(color)
                watchIcon.setColorFilter(color, android.graphics.PorterDuff.Mode.SRC_IN)
            }
        }
        override fun onUnbindViewHolder(viewHolder: ViewHolder) {}
    }

    private inner class CategoryPresenter : Presenter() {
        override fun onCreateViewHolder(parent: ViewGroup) = ViewHolder(
            LayoutInflater.from(parent.context).inflate(R.layout.item_category_chip, parent, false)
        )
        override fun onBindViewHolder(viewHolder: ViewHolder, item: Any) {
            val cat = item as CategoryItem
            viewHolder.view.findViewById<TextView>(R.id.category_name).text = cat.name
            viewHolder.view.setOnClickListener { openCategory(cat) }
        }
        override fun onUnbindViewHolder(viewHolder: ViewHolder) {}
    }

    private fun openMovieDetail(movie: MovieItem) {
        android.util.Log.d("MovieDebug", "[USER_ACTION] [OPEN_MOVIE] -> Người dùng bấm xem chi tiết phim: '${movie.name}' (Slug: '${movie.slug}')")
        val intent = Intent(requireContext(), MovieDetailActivity::class.java)
        intent.putExtra("movie_json", com.google.gson.Gson().toJson(movie))
        intent.putExtra("movie_slug", movie.slug)
        intent.putExtra("source_url", mCurrentSource?.url)
        startActivity(intent)
    }

    private fun openCategory(cat: CategoryItem) {
        openCategoryBrowser(cat)
    }

    private class BannerItem(val movie: MovieItem)
    private inner class LoadMoreItem
    private inner class ToolbarRowItem

    private inner class ToolbarRowPresenter : Presenter() {
        override fun onCreateViewHolder(parent: ViewGroup): ViewHolder {
            val layout = LinearLayout(parent.context).apply {
                orientation = LinearLayout.HORIZONTAL
                setPadding(48, 8, 48, 4)
                descendantFocusability = ViewGroup.FOCUS_AFTER_DESCENDANTS
            }
            return ViewHolder(layout)
        }

        override fun onBindViewHolder(viewHolder: ViewHolder, item: Any) {
            val layout = viewHolder.view as LinearLayout
            layout.removeAllViews()
            val ctx = layout.context

            val sourceBtn = TextView(ctx).apply {
                text = "Ngu\u1ED3n: ${mCurrentSource?.name ?: "Ch\u1ECDn ngu\u1ED3n"}"
                setTextColor(0xFFFFFFFF.toInt())
                setBackgroundResource(R.drawable.filter_chip_bg)
                gravity = android.view.Gravity.CENTER
                setPadding(28, 10, 28, 10)
                minHeight = 52
                textSize = 15f
                isFocusable = true
                isClickable = true
                setOnClickListener { showSourceSelectorDialog() }
            }
            layout.addView(sourceBtn, LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { marginEnd = 12 })

            val searchBtn = TextView(ctx).apply {
                text = "T\u00ECm phim"
                setTextColor(0xFFFFFFFF.toInt())
                setBackgroundResource(R.drawable.filter_chip_bg)
                gravity = android.view.Gravity.CENTER
                setPadding(28, 10, 28, 10)
                minHeight = 52
                textSize = 15f
                isFocusable = true
                isClickable = true
                setOnClickListener { enterSearchMode() }
            }
            layout.addView(searchBtn, LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ))
        }

        override fun onUnbindViewHolder(viewHolder: ViewHolder) {}
    }

    /**
     * Called when tab is selected - no reload needed since fragment is preserved via show/hide.
     */
    fun onTabSelected() {
        // Data already in memory from first load — do nothing
    }

    /**
     * Full reload (e.g. after changing source in settings).
     */
    fun refresh() {
        if (mSearchMode) exitSearchMode()
        loadHomeContent()
    }

    /**
     * Plain RecyclerView.Adapter for the category movies grid.
     * Replaces Leanback ItemBridgeAdapter which has rendering bugs when container toggles GONE/VISIBLE.
     */
    private inner class CategoryMovieAdapter(
        private val items: List<MovieItem>,
        private val onItemClick: (MovieItem) -> Unit,
        private val onItemFocus: (MovieItem, Boolean) -> Unit
    ) : RecyclerView.Adapter<CategoryMovieAdapter.MovieVH>() {

        inner class MovieVH(val view: View) : RecyclerView.ViewHolder(view) {
            val imageView: android.widget.ImageView = view.findViewById(R.id.movie_poster)
            val titleText: TextView = view.findViewById(R.id.movie_title)
            val yearText: TextView = view.findViewById(R.id.movie_year)
            val qualityText: TextView = view.findViewById(R.id.movie_quality_badge)
            val infoContainer: View? = view.findViewById(R.id.movie_info_container)
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): MovieVH {
            android.util.Log.d("MoviesBrowse", "CategoryMovieAdapter.onCreateViewHolder called")
            val view = LayoutInflater.from(parent.context).inflate(R.layout.movie_card, parent, false)
            return MovieVH(view)
        }

        override fun onBindViewHolder(holder: MovieVH, position: Int) {
            val movie = items[position]
            android.util.Log.d("MoviesBrowse", "CategoryMovieAdapter.onBindViewHolder called for pos=$position, name=${movie.name}")
            holder.titleText.text = movie.name

            if (!movie.year.isNullOrEmpty()) {
                holder.yearText.visibility = View.VISIBLE
                holder.yearText.text = movie.year
            } else {
                holder.yearText.visibility = View.GONE
            }

            if (!movie.quality.isNullOrEmpty()) {
                holder.qualityText.visibility = View.VISIBLE
                holder.qualityText.text = movie.quality
            } else {
                holder.qualityText.visibility = View.GONE
            }

            val thumbnailUrl = movie.thumbnailUrl?.ifEmpty { null } ?: movie.posterUrl
            if (!thumbnailUrl.isNullOrEmpty()) {
                Glide.with(holder.imageView.context)
                    .load(thumbnailUrl)
                    .placeholder(R.drawable.ic_movie_placeholder)
                    .error(R.drawable.ic_movie_placeholder)
                    .centerCrop()
                    .transition(DrawableTransitionOptions.withCrossFade())
                    .into(holder.imageView)
            } else {
                holder.imageView.setImageResource(R.drawable.ic_movie_placeholder)
            }

            holder.view.isFocusable = true
            holder.view.isClickable = true
            holder.view.setOnClickListener { onItemClick(movie) }
            
            holder.view.setOnFocusChangeListener { v, hasFocus ->
                holder.titleText.isSelected = hasFocus // Enable marquee effect
                if (hasFocus) {
                    v.bringToFront()
                    v.animate().scaleX(1.06f).scaleY(1.06f).setDuration(150).start()
                    holder.infoContainer?.setBackgroundColor(0xFFFFFFFF.toInt())
                    holder.titleText.setTextColor(0xFF000000.toInt())
                    holder.yearText.setTextColor(0xFF333333.toInt())
                } else {
                    v.animate().scaleX(1.0f).scaleY(1.0f).setDuration(150).start()
                    holder.infoContainer?.setBackgroundColor(0x00000000)
                    holder.titleText.setTextColor(0xFFFFFFFF.toInt())
                    holder.yearText.setTextColor(0xFFAAAAAA.toInt())
                }
                onItemFocus(movie, hasFocus)
            }
        }

        override fun getItemCount(): Int = items.size
    }
}
