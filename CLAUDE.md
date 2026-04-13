# Guidelines For Agents

## What this project is

Space Rabbit is a macOS menu bar utility that removes the slide animation when switching Spaces (virtual desktops). It makes space transitions instant.

It is a single-file Swift app (`App/SpaceRabbit.swift`) compiled with `swiftc` via a hand-written `Makefile`. There is no Xcode project, no SPM manifest, and no third-party dependencies. The entire application is ~1170 lines of Swift.

## How it works

The core trick: macOS's Dock processes high-velocity `DockSwipe` gesture events and switches spaces immediately without animation when the velocity is high enough. Space Rabbit posts synthetic `CGEvent` pairs (Began + Ended) with extreme velocity/progress values directly into the session event tap, bypassing the normal animated space switch.

This technique is borrowed from [InstantSpaceSwitcher](https://github.com/jurplel/InstantSpaceSwitcher).

## Private APIs in use

Because there is no public API for querying or switching Spaces, the app uses:

- **Undocumented `CGEvent` field IDs** (raw integer values 55, 110, 119, 123, 124, 129, 130, 132, 135, 139) to construct the synthetic gesture events.
- **Private CGS functions** resolved at runtime via `dlsym` / `RTLD_DEFAULT`:
  - `CGSMainConnectionID` — gets the current CGS connection
  - `CGSGetActiveSpace` — returns the active space ID
  - `CGSCopyManagedDisplaySpaces` — lists all displays and their spaces
  - `SLSCopySpacesForWindows` — maps window IDs to space IDs (used for auto-follow)
- **`CFPreferencesCopyAppValue`** on `com.apple.symbolichotkeys` to read the user's configured space-switch keyboard shortcuts (hotkey IDs 79 = left, 81 = right).

These are the main fragility points — they may break on future macOS updates.

## Two core features

### Feature 1: Instant space switch (`eventTapCallback`)

A `CGEvent` tap is installed at `.cgSessionEventTap` / `.headInsertEventTap` listening for `keyDown` events. When the user's configured modifier+arrow shortcut is detected:

1. The original key event is **swallowed** (returns `nil`).
2. `postSwitchGesture(direction:)` posts a Began+Ended gesture pair with high velocity.
3. The Dock handles the gesture and switches the space with no animation.

The tap is re-enabled on `tapDisabledByTimeout` / `tapDisabledByUserInput` to stay alive.

### Feature 2: Auto-follow on Cmd+Tab (`SwoopObserver`)

Listens for `NSWorkspace.didActivateApplicationNotification`. When an app is activated:

1. `findSpaceForPid(_:)` walks `CGWindowListCopyWindowInfo` to find a normal, on-screen window belonging to that PID, then uses `SLSCopySpacesForWindows` to locate its space.
2. If the space is not already a current space on any display, `switchToSpace(_:)` computes the minimum number of directional steps and calls `switchNSpaces(direction:steps:)`.
3. 100 ms later, the activated app's windows are brought to front.

## Global state

All runtime state is stored in module-level globals (not a singleton class):

| Variable | Purpose |
|---|---|
| `gTap` | The active `CFMachPort` event tap |
| `gEnabled` | Master on/off toggle |
| `gInstantSwitchEnabled` | Feature 1 toggle |
| `gAutoFollowEnabled` | Feature 2 toggle |
| `gSwitchCount` | Lifetime switch counter (persisted in UserDefaults) |
| `gKeyLeft` / `gKeyRight` | Keycode for left/right space switch (loaded from system prefs) |
| `gModMask` | Required modifier flags (loaded from system prefs) |
| `gMenu` | The `SwoopMenu` instance |

UserDefaults keys: `spacerabbit.enabled`, `spacerabbit.instantSwitch`, `spacerabbit.autoFollow`, `spacerabbit.switchCount`.

## UI structure

```
SwoopMenu (NSStatusItem)
  └─ NSMenu
       ├─ Launch-at-login warning banner (hidden when OK)
       ├─ Enable/Disable toggle
       ├─ Instant space switch toggle
       ├─ Auto-follow on Cmd+Tab toggle
       ├─ Switch count / time-saved stats
       ├─ Preferences… → SettingsWindowController
       └─ Quit

SettingsWindowController (singleton NSWindowController)
  └─ PreferencesTabViewController (NSTabViewController, toolbar style)
       ├─ GeneralViewController  — Launch at Login + feature toggles
       └─ AboutViewController    — icon, version, authors, update notice
```

Right-clicking the menu bar icon toggles the master enable/disable without opening the menu.

## Build system

Everything goes through the `Makefile`. There is no Xcode project.

| Target | What it does |
|---|---|
| `make build` | Compiles `App/SpaceRabbit.swift` → `spacerabbit` binary |
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
  SpaceRabbit.swift   — entire application (~1170 lines)
  Info.plist          — bundle metadata (version placeholder: __VERSION__)
Icon/
  AppIcon.icns        — compiled icon
  CreateIcon.swift    — generates the icns programmatically
Makefile
README.md
local.env             — git-ignored; signing credentials
Space Rabbit.app/     — built artifact (committed for convenience)
Space-Rabbit.dmg      — distribution artifact (committed for convenience)
```

## Authors

Yaël Guilloux (@tahul) and Valerian Saliou.

## Known limitations

- Trackpad swipe gestures still animate (they bypass the event tap entirely).
- Finder without open windows always animates to the first space — native behavior.
- Cmd+Tab to fullscreen apps may briefly flicker.
- Uses undocumented CGEvent fields and private CGS symbols — may break on macOS updates.
