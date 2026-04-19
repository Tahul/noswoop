# Guidelines For Agents

## What this project is

Space Rabbit is a macOS menu bar utility that removes the slide animation when switching Spaces (virtual desktops). It makes space transitions instant.

It is a multi-file Swift app (in `App/`) compiled with `swiftc` via a hand-written `Makefile`. There is no Xcode project, no SPM manifest, and no third-party dependencies.

## How it works

The core trick: macOS's Dock processes high-velocity `DockSwipe` gesture events and switches spaces immediately without animation when the velocity is high enough. Space Rabbit posts synthetic `CGEvent` pairs (Began + Ended) with extreme velocity/progress values directly into the session event tap, bypassing the normal animated space switch.

This technique is borrowed from [InstantSpaceSwitcher](https://github.com/jurplel/InstantSpaceSwitcher).

## Private APIs in use

Because there is no public API for querying or switching Spaces, the app uses:

- **Undocumented `CGEvent` field IDs** (raw integer values 55, 110, 119, 123, 124, 129, 130, 132, 135, 139) to construct the synthetic gesture events. Defined as named constants in `PrivateAPI.swift`.
- **Private CGS functions** resolved at runtime via `dlsym` / `RTLD_DEFAULT` (see `loadSymbol()` in `PrivateAPI.swift`):
  - `CGSMainConnectionID` → `cgsMainConnection` — gets the current CGS connection
  - `CGSGetActiveSpace` → `cgsGetActiveSpace` — returns the active space ID
  - `CGSCopyManagedDisplaySpaces` → `cgsCopyDisplaySpaces` — lists all displays and their spaces
  - `SLSCopySpacesForWindows` → `slsCopySpacesForWindows` — maps window IDs to space IDs (used for auto-follow)
- **`CFPreferencesCopyAppValue`** on `com.apple.symbolichotkeys` to read the user's configured space-switch keyboard shortcuts (hotkey IDs 79 = left, 81 = right, defined as `kHotkeyMoveLeftSpace`/`kHotkeyMoveRightSpace` in `Shortcuts.swift`).

These are the main fragility points — they may break on future macOS updates.

## Two core features

### Feature 1: Instant space switch (`eventTapCallback` in `EventTap.swift`)

A `CGEvent` tap is installed at `.cgSessionEventTap` / `.headInsertEventTap` listening for `keyDown` events. When the user's configured modifier+arrow shortcut is detected:

1. The original key event is **swallowed** (returns `nil`).
2. `postSwitchGesture(direction:)` posts a Began+Ended gesture pair with high velocity.
3. The Dock handles the gesture and switches the space with no animation.

The tap is re-enabled on `tapDisabledByTimeout` / `tapDisabledByUserInput` to stay alive.

### Feature 2: Auto-follow on Cmd+Tab (`SwoopObserver` in `AutoFollow.swift`)

Listens for `NSWorkspace.didActivateApplicationNotification`. When an app is activated:

1. `findSpaceForPid(_:)` uses `visibleWindowSpaces(for:)` to get the space IDs of the app's normal, on-screen windows, then checks against `getAllCurrentSpaces()`.
2. If the space is not already visible on any display, `switchToSpace(_:)` computes the minimum number of directional steps and calls `switchNSpaces(direction:steps:)`.
3. After `kPostSwitchActivationDelay` (100ms), the activated app's windows are brought to front.

### Feature interaction

The two features have a suppression mechanism to prevent them from fighting. After instant-switch fires, `gLastSpaceSwitchTime` is stamped. Auto-follow checks this timestamp and suppresses itself within `kAutoFollowSuppressionWindow` (300ms). The `activeSpaceDidChangeNotification` observer in `main.swift` also stamps this time for trackpad-initiated switches.

The `appWindowsConfinedToSpace()` check determines whether it's safe to use `.activateAllWindows` after switching (which would cause a native cross-space switch if the app has windows on multiple spaces).

## Key functions by file

### SpaceSwitching.swift (core mechanics)
- `getSpaceList() -> (ids:, currentIdx:)` — space IDs on the active display + current index
- `visibleWindowSpaces(for: pid_t) -> [CGSSpaceID]` — maps a process's visible windows to their space IDs (shared helper for `findSpaceForPid` and `appWindowsConfinedToSpace`)
- `findSpaceForPid(_:) -> CGSSpaceID` — finds which space to switch to for a PID (returns 0 if already reachable)
- `appWindowsConfinedToSpace(_:_:) -> Bool` — checks if all windows are on a single space
- `switchToSpace(_:)` — navigates to a target space by computing direction + steps
- `postSwitchGesture(direction:) -> Bool` — posts a Began+Ended synthetic gesture pair
- `postGesturePair(...)` — posts a single gesture+dock-control event pair (private)

### EventTap.swift
- `eventTapCallback(...)` — the C-compatible CGEvent tap callback; matches shortcuts, swallows events, posts gestures

### AutoFollow.swift
- `SwoopObserver.appActivated(_:)` — the notification handler; finds target space, switches, activates app

### MenuBar.swift
- `SwoopMenu` — manages the status item, dropdown menu, toggles, stats display
- `SwoopMenu.recordSwitch()` — increments counter and refreshes stats (called by both features)
- `SwoopMenu.syncMenuItems()` — syncs checkmarks after settings window changes a toggle
- `SwoopMenu.showUpdateBanner(downloadURL:)` — shows the update-available banner

### Settings.swift
- `SettingsWindowController.shared.show()` — shows the preferences window (singleton)
- `PreferencesTabViewController` — manages tab switching and window resizing
- `GeneralViewController` — all toggle controls, launch-at-login, Dock instant-hide
- `AboutViewController` — app info, version, authors, update notice
- `Layout` enum — centralizes all spacing/sizing constants for the settings UI

### State.swift
- `Defaults` enum — all UserDefaults key strings (`spacerabbit.*`)
- `flushSwitchCount()` — writes switch count to disk if changed

### Shortcuts.swift
- `loadSpaceSwitchShortcuts()` — reads system hotkey prefs into `gKeyLeft`/`gKeyRight`/`gModMask`
- `CarbonModifier` enum — legacy Carbon modifier bitmask values

### PrivateAPI.swift
- `loadSymbol(_:)` — resolves a private C symbol via `dlsym` and casts to the requested function type
- All `kCG*` / `kCGS*` / `kIOHID*` constants for gesture event construction

### UpdateCheck.swift
- `checkForUpdates()` — fetches latest GitHub release, compares versions, shows banner if newer

## Global state (`State.swift`)

All runtime state is stored in module-level globals (not a singleton class):

| Variable | Purpose |
|---|---|
| `gTap` | The active `CFMachPort` event tap |
| `gEnabled` | Master on/off toggle |
| `gInstantSwitchEnabled` | Feature 1 toggle |
| `gAutoFollowEnabled` | Feature 2 toggle |
| `gSoundsEnabled` | Sound effect on toggle |
| `gLastSpaceSwitchTime` | Timestamp for auto-follow suppression |
| `gSwitchCount` / `gSwitchCountSaved` | Lifetime switch counter + last-persisted value |
| `gKeyLeft` / `gKeyRight` | Keycode for left/right space switch (loaded from system prefs) |
| `gModMask` | Required modifier flags (loaded from system prefs) |
| `gMenu` | The `SwoopMenu` instance |

UserDefaults keys (in `Defaults` enum): `spacerabbit.enabled`, `spacerabbit.instantSwitch`, `spacerabbit.autoFollow`, `spacerabbit.sounds`, `spacerabbit.switchCount`.

## Key named constants

| Constant | File | Value | Purpose |
|---|---|---|---|
| `kSLSSpaceTypeAll` | SpaceSwitching.swift | `7` | Bitmask for "all space types" in SLS calls |
| `kInstantSwitchProgress` | SpaceSwitching.swift | `2.0` | Swipe progress that triggers instant switch |
| `kInstantSwitchVelocity` | SpaceSwitching.swift | `400.0` | Velocity above Dock's instant-switch threshold |
| `kAutoFollowSuppressionWindow` | AutoFollow.swift | `0.3s` | Grace period after instant-switch before auto-follow kicks in |
| `kPostSwitchActivationDelay` | AutoFollow.swift | `0.1s` | Delay after space switch before activating app windows |
| `kRelevantModifiers` | EventTap.swift | Control/Cmd/Alt/Shift | Modifier keys checked when matching shortcuts |
| `kMenuIconSize` | MenuBar.swift | `16pt` | Size for tinted SF Symbol menu item icons |
| `kDisabledIconAlpha` | MenuBar.swift | `0.25` | Menu bar icon opacity when disabled |
| `Layout` enum | Settings.swift | various | All spacing, sizing, and padding values for the preferences window |

## Data flow: toggle state changes

Toggles can be changed from two places (menu bar dropdown or settings window). The sync works as follows:

1. **Menu bar toggle** (`SwoopMenu.toggleInstantSwitch`/`toggleAutoFollow`): updates `gXxxEnabled` global → writes to `UserDefaults` → updates menu item checkmark state.
2. **Settings window toggle** (`GeneralViewController.toggleInstantSwitch`/`toggleAutoFollow`): updates `gXxxEnabled` global → writes to `UserDefaults` → calls `gMenu?.syncMenuItems()` to update menu checkmarks.
3. **Settings window appears** (`viewWillAppear`): refreshes all switch controls from globals (in case the menu bar changed them while the window was closed).

The master enable/disable (`gEnabled`) is only togglable from the menu bar (via the menu item or right-click on the status icon).

## UI structure

```
SwoopMenu (NSStatusItem)
  └─ NSMenu
       ├─ Update-available banner (hidden by default)
       ├─ Launch-at-login warning banner (hidden when OK)
       ├─ Enable/Disable toggle
       ├─ Instant space switch toggle
       ├─ Auto-follow on Cmd+Tab toggle
       ├─ Switch count / time-saved stats
       ├─ Version label
       ├─ Preferences… → SettingsWindowController
       └─ Quit

SettingsWindowController (singleton NSWindowController)
  └─ PreferencesTabViewController (NSTabViewController, toolbar style)
       ├─ GeneralViewController  — Launch at Login, feature toggles, sounds, Dock instant-hide
       └─ AboutViewController    — icon, version, authors, update notice
```

Right-clicking the menu bar icon toggles the master enable/disable without opening the menu.

Custom controls: `LinkTextField` (pointing-hand cursor for links), `LinkButton` (pointing-hand cursor for buttons).

## Build system

Everything goes through the `Makefile`. There is no Xcode project.

| Target | What it does |
|---|---|
| `make build` | Compiles `App/*.swift` → `spacerabbit` binary |
| `make icon` | Regenerates `Icon/AppIcon.icns` from `Icon/CreateIcon.swift` |
| `make app` | Assembles `Space Rabbit.app` bundle, optionally code-signs |
| `make dmg` | Creates `Space-Rabbit.dmg` with an Applications symlink |
| `make notarize` | Submits DMG to Apple notarytool and staples the ticket |
| `make release` | `dmg` + `notarize` in sequence |
| `make clean` | Removes binary, icns, and app bundle |

Signing credentials go in `local.env` (git-ignored):

```bash
export SIGN_ID=Developer ID Application: Your Name (TEAMID)
export APPLE_ID=you@example.com
export APPLE_TEAM_ID=TEAMID
export APPLE_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
```

Version is derived from `git describe --tags --abbrev=0` and substituted into `App/Info.plist` (`__VERSION__` placeholder).

## Project layout

```
App/
  main.swift            — entry point: permissions, event tap, observers, run loop (144 lines)
  PrivateAPI.swift      — undocumented CGEvent fields, CGS types, dlsym resolution (158 lines)
  State.swift           — global runtime state, UserDefaults keys, persistence (110 lines)
  Shortcuts.swift       — reads macOS space-switch keyboard shortcuts (130 lines)
  SpaceSwitching.swift  — space queries, synthetic gesture posting, navigation (373 lines)
  EventTap.swift        — CGEvent tap callback (Feature 1: instant switch) (101 lines)
  AutoFollow.swift      — app-activation observer (Feature 2: auto-follow) (84 lines)
  MenuBar.swift         — SwoopMenu status item and dropdown menu (488 lines)
  Settings.swift        — preferences window, General + About tabs (884 lines, largest file)
  UpdateCheck.swift     — GitHub release version checking (79 lines)
  Info.plist            — bundle metadata (version placeholder: __VERSION__)
Icon/
  AppIcon.icns          — compiled icon
  CreateIcon.swift      — generates the icns programmatically
Makefile
README.md
local.env               — git-ignored; signing credentials
Space Rabbit.app/       — built artifact (committed for convenience)
Space-Rabbit.dmg        — distribution artifact (committed for convenience)
```

## Coding conventions

- **No classes for state** — all mutable state is module-level globals prefixed with `g` (e.g. `gEnabled`, `gTap`). Appropriate because the app is single-threaded.
- **Named constants** — magic numbers are extracted into `let` constants (prefixed with `k`) or enums at the top of each file.
- **`MARK` sections** — every file uses `// MARK: -` to organize code into logical sections.
- **Doc comments** — all public/internal functions use `///` doc comments with `- Parameter:` and `- Returns:` annotations.
- **Private API isolation** — all undocumented symbols are confined to `PrivateAPI.swift`. Other files only use the typed function pointers and named constants exported from it.
- **UI built programmatically** — no nibs, storyboards, or SwiftUI. All views use NSStackView + Auto Layout.
- **Settings layout constants** — all sizing/spacing values for Settings.swift are in the `Layout` enum at the top of the file.

## Authors

Yaël Guilloux (@tahul) and Valerian Saliou.

## Known limitations

- Trackpad swipe gestures still animate (they bypass the event tap entirely).
- Finder without open windows always animates to the first space — native behavior.
- Cmd+Tab to fullscreen apps may briefly flicker.
- Uses undocumented CGEvent fields and private CGS symbols — may break on macOS updates.
