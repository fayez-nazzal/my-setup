# Amphetamine

Keeps the Mac awake. The installer gets it from the App Store through
Homebrew's `mas`, so sign in to the App Store first.

## Settings

[`amphetamine.plist`](amphetamine.plist) lists the settings this setup wants:

- Start a session when Amphetamine opens and when the Mac wakes
- Hide the Dock icon
- Skip the welcome window

Sessions last until you end them, which is Amphetamine's default.

The installer copies each setting into Amphetamine with `defaults`, only where
it differs. It also adds Amphetamine to your login items and starts a session.
Edit the file and rerun the installer to change a setting.

## Why not a symlink

macOS will not read or save a settings file that is a symlink, so a linked
file would leave Amphetamine with no settings at all.

## If the settings step is blocked

Amphetamine keeps its settings in a protected app folder. The first time,
macOS asks whether your terminal may access data from other apps. Allow it,
or turn on Full Disk Access for the terminal in System Settings → Privacy &
Security, then rerun.
