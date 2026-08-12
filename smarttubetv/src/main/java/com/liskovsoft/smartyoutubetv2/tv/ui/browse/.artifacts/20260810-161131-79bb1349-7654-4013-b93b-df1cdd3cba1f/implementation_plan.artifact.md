# Implementation Plan - YouTube Tab Header Customization

Customize the YouTube (SmartTube) tab header to have a fixed long search bar and a login button aligned horizontally, matching the "Stream" tab style.

## User Review Required

> [!IMPORTANT]
> This change will affect all fragments using the Leanback `TitleView` with the `lb_title_view.xml` layout, primarily the YouTube tab. Other tabs like Stream/Movies use custom headers and won't be affected.

## Proposed Changes

### UI Customization

#### [lb_title_view.xml](file:///E:/SuperOK/smarttubetv/src/main/res/layout/lb_title_view.xml)

- Replace the root `FrameLayout` with a horizontal `LinearLayout` to align items horizontally.
- Set `search_bar_container` to `width="0dp"` and `weight="1"` to make it stretch.
- Change `title_orb` from `SearchOrbView` to a plain `ImageView` (24dp) to remove the circular orb background.
- Move `account_orb` (login button), `language_orb`, `exit_pip`, and `pip_title` directly into the horizontal `LinearLayout`.
- Set `android:addStatesFromChildren="true"` on `search_bar_container` so its background reflects the `search_input` focus.

#### [NavigateTitleView.java](file:///E:/SuperOK/smarttubetv/src/main/java/com/liskovsoft/smartyoutubetv2/tv/ui/widgets/browse/NavigateTitleView.java)

- Update `mSearchOrbView` type to `View` (or keep it and handle it as `ImageView` if changed).
- In `updateComponentsVisibility`, adjust visibility logic for the new horizontal layout.
- Ensure `account_orb` is correctly initialized and managed.

#### [BrowseFragment.java](file:///E:/SuperOK/smarttubetv/src/main/java/com/liskovsoft/smartyoutubetv2/tv/ui/browse/BrowseFragment.java)

- In `setupUi()`, remove `setSearchAffordanceColor(ContextCompat.getColor(getContext(), brandAccentColorRes))` to prevent the search bar from turning red.
- Ensure `setTitleView(null)` or similar is NOT called, so the custom title remains visible.

## Verification Plan

### Manual Verification
- Navigate to the **YouTube** tab.
- Verify that the search bar is long and stretches across the top.
- Verify that the **Login/Account** button is to the right of the search bar, on the same line.
- Verify that the **red background** is gone from the search icon.
- Open the **left sidebar** and verify that the header moves/pushes to the right consistently with the content cards below.
- Test **D-pad navigation** between the search bar and the login button.
