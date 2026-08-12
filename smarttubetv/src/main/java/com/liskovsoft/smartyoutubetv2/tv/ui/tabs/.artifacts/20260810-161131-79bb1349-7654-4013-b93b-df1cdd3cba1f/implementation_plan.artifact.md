# Implementation Plan - Fix Focus Loss after Playback in Tab Navigation

Fix the issue where focus jumps to the YouTube tab instead of staying on the current tab when returning from playback in `TabNavigationActivity`.

## Proposed Changes

### Tab Navigation

#### [TabNavigationActivity.java](file:///E:/SuperOK/smarttubetv/src/main/java/com/liskovsoft/smartyoutubetv2/tv/ui/tabs/TabNavigationActivity.java)

- In `onResume()`, ensure that `BrowsePresenter` is "set up" to believe that `TabNavigationActivity` is already the current view, to prevent it from trying to `startView(BrowseView.class)` which might trigger a tab switch.
- Enhance the focus restoration logic to specifically check if the selected tab is still valid and re-select it visually if needed.
- Add a check to prevent `onNewIntent` or `onResume` from triggering a tab switch unless explicitly requested.

## Verification Plan

### Manual Verification
- Navigate to the "Dailymotion" or "Phim" tab.
- Start a video playback (using `IptvPlayerActivity` or similar).
- Press the **BACK** button to exit playback.
- Verify that the app returns to the same tab (Dailymotion/Phim) and focus is correctly placed on the content, not jumping to the YouTube tab.
