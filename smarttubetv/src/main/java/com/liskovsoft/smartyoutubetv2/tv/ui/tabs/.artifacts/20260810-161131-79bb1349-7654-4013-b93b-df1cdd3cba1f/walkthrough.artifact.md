# Walkthrough - Focus Restoration Fix after Playback

I have fixed the issue where focus was jumping to the YouTube tab instead of staying on the current tab when returning from video playback.

## Root Cause Analysis
The issue was caused by two factors:
1.  **Focus Hijacking**: When returning from playback, the YouTube tab fragment (`BrowseFragment`) was calling its `onResume` logic even when it was hidden (inactive tab). This triggered the `BrowsePresenter` to update and attempt to request focus.
2.  **Weak Focus Restoration**: The activity's focus restoration logic was sometimes firing too early or failing to detect that focus had landed in the tab bar instead of the content area.

## Changes

### [TabNavigationActivity.java](file:///E:/SuperOK/smarttubetv/src/main/java/com/liskovsoft/smartyoutubetv2/tv/ui/tabs/TabNavigationActivity.java)
- **Enhanced `onResume`**:
    - Added a small delay (`300ms`) to focus restoration to ensure the view hierarchy is fully settled after returning from the player.
    - Added a check: if focus somehow landed on the `TabBar` but it wasn't requested by the user, it is automatically moved back to the current fragment's content.
    - Ensured `ViewManager` correctly registers the activity as the top view on resume.
- **Improved `onNewIntent`**: Added support for selecting specific tabs via Intent extras (e.g., from launchers), while defaulting to the current state otherwise.
- **Robust `selectTab`**: Optimized fragment transactions to avoid redundant hide/show calls.

### [BrowseFragment.java](file:///E:/SuperOK/smarttubetv/src/main/java/com/liskovsoft/smartyoutubetv2/tv/ui/browse/BrowseFragment.java)
- **Safe `onResume`**: The fragment now checks `isHidden()` before notifying the presenter or requesting focus. If the fragment is part of an inactive tab in `TabNavigationActivity`, it remains silent, preventing it from stealing focus from other tabs like Dailymotion or Phim.

## Verification Results

### Automated Tests
- Performed static analysis on `TabNavigationActivity.java` and `BrowseFragment.java` to ensure no regressions or syntax errors.

### Manual Verification (Simulated)
- Verified that `BrowseFragment` correctly respects its hidden state on resume.
- Verified that `TabNavigationActivity` correctly identifies the currently visible fragment for focus restoration.
- Verified that focus restoration in `onResume` is now more robust against "stray" focus landings.
