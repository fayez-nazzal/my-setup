if command -v gpg >/dev/null 2>&1; then
  # Required on every platform, but the common failure mode ("Inappropriate
  # ioctl for device" / "No pinentry" during `git commit -S`) mostly shows up
  # on Linux terminals and inside tmux, where GPG_TTY isn't inherited and
  # each pane/tab needs its own tty registered with the agent.
  export GPG_TTY=$(tty)

  if command -v gpgconf >/dev/null 2>&1; then
    gpgconf --launch gpg-agent 2>/dev/null
  fi

  if [[ -o interactive ]] && command -v gpg-connect-agent >/dev/null 2>&1; then
    gpg-connect-agent updatestartuptty /bye >/dev/null 2>&1
  fi
fi
