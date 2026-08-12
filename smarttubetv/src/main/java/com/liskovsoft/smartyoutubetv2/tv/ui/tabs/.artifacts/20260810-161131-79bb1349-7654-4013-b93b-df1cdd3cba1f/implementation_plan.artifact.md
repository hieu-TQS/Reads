# Implementation Plan - Fix Tab Selection Regression

Fix the issue where content becomes blank and focus jumps to the first tab when repeatedly selecting a tab in `TabNavigationActivity`.

## Proposed Changes

### Tab Navigation

#### [TabNavigationActivity.java](file:///E:/SuperOK/smarttubetv/src/main/java/com/liskovsoft/smartyoutubetv2/tv/ui/tabs/TabNavigationActivity.java)

- Correct the fragment hiding loop in `selectTab()` to compare the tab index (key) instead of the loop counter.
- Add a guard to skip visual and fragment updates if the tab is already selected, except for explicit requests (like `onNewIntent`).

## Verification Plan

### Manual Verification
- Navigate to the **Dailymotion** tab.
- Press **OK** multiple times on the "Dailymotion" tab icon.
- Verify that the content remains visible and focus stays on the tab (or moves to content if intended, but definitely doesn't jump to "Stream").
- Repeat for other tabs like **Videos** and **Settings**.
- Verify that switching between different tabs still works correctly.
