# Space Rabbit

🐇 Instant space switching on macOS.

Remove animations when switching macOS Spaces. Reclaim hours of your time every month.

## Features

- **Instant space switch** - your keyboard shortcut switches spaces with zero animation
- **Auto-follow on Cmd+Tab** - switching to an app on another space takes you there instantly
- **Reads your shortcuts** - picks up your bindings from System Settings automatically
- **No SIP changes needed** - just classic accessibility permissions

## Install

Download the latest release from [GitHub Releases](https://github.com/Tahul/space-rabbit/releases) and drag **Space Rabbit.app** into your Applications folder.

Grant Accessibility access when prompted (System Settings → Privacy & Security → Accessibility).

## Setup

For the Cmd+Tab feature, turn off macOS's built-in animated space switching:

> **System Settings → Desktop & Dock** → disable **"When switching to an application, switch to a Space with open windows for the application"**

## Uninstall

Quit Space Rabbit from the menu bar, then delete **Space Rabbit.app** from your Applications folder.

## Build from source

```bash
make app
```

Requires Xcode command line tools and a valid Developer ID for signing.

You can configure your signing key by creating a `local.env` file and using:

```bash
export SIGN_ID=Developer ID Application: Your Developer Name (IDENTIFIER_HERE)
```

If you don't, you will be asked for your signature key identifier when building the app. 

## Release & notarize

Prior to distributing a release, it needs to be packaged and notarized as such:

```bash
make dmg
make notarize
```

## How it works

Posts synthetic high-velocity DockSwipe gesture events.

The Dock processes these as a completed trackpad swipe and switches instantly.

Based on the technique from [InstantSpaceSwitcher](https://github.com/jurplel/InstantSpaceSwitcher).

## Known limitations

- Trackpad swipe gestures still animate (they bypass the event tap)
- While it skips apps present in Cmd+Tab list, it will still animate to first space when selecting Finder without opened windows — native behavior that can't be bypassed
- Cmd+Tab to fullscreen apps may briefly flicker
- May break on future macOS updates (uses undocumented CGEvent fields)
