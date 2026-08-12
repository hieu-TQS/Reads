# Implementation Plan - In-place Search for Dailymotion

Change the search behavior in the Dailymotion tab to perform searching directly within the search bar on the screen, instead of showing a separate overlay.

## User Review Required

> [!IMPORTANT]
> The `SearchBar` widget from Leanback will be moved from a hidden overlay directly into the main fragment layout. This will make it permanently visible (or visible when focused at the top) and eliminate the "overlay" feel.

## Proposed Changes

### Dailymotion UI

#### [fragment_dailymotion_browse.xml](file:///E:/SuperOK/smarttubetv/src/main/res/layout/fragment_dailymotion_browse.xml)

- Remove `dailymotion_search_bar_row` (the static search bar placeholder).
- Move `search_bar` from `dailymotion_search_overlay` into the main `dailymotion_main_content` layout.
- Remove `dailymotion_search_overlay`.
- Adjust `search_bar` layout parameters to match the previous placeholder's position.

#### [DailymotionBrowseFragment.java](file:///E:/SuperOK/smarttubetv/src/main/java/com/liskovsoft/smartyoutubetv2/tv/ui/dailymotion/DailymotionBrowseFragment.java)

- Remove references to `mSearchOverlay` and `mSearchBarRow`.
- Simplify `onViewCreated` to initialize `mSearchBar` directly in the main layout.
- Remove `showSearch()` and `hideSearch()` methods.
- Update `performSearch()` to remove the `hideSearch()` call.
- Update focus management logic (DPAD_UP from grid) to focus directly on `mSearchBar`.
- Ensure the `SearchBar` is properly initialized with a `SpeechRecognizer` and listener.

## Verification Plan

### Manual Verification
- Navigate to the Dailymotion tab.
- Verify that the search bar is visible at the top.
- Click on the search bar (or focus it and press OK) and verify that it allows typing directly without a full-screen overlay appearing.
- Perform a search and verify that results are loaded in the grid below.
- Test voice search via the speech orb.
- Test navigation between the search bar and the video grid using DPAD UP/DOWN.
