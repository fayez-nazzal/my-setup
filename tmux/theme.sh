#!/bin/sh
# Called by tmux at startup and from its status line. No persistent daemon.
socket=$1
export TMUX="$socket,0,0"

case $(uname -s) in
  Darwin)
    if [ "$(defaults read -g AppleInterfaceStyle 2>/dev/null)" = Dark ]; then mode=dark; else mode=light; fi
    ;;
  Linux)
    preference=$(gsettings get org.gnome.desktop.interface color-scheme 2>/dev/null || true)
    case "$preference" in
      *prefer-light*) mode=light ;;
      *prefer-dark*) mode=dark ;;
      *) case $(gsettings get org.gnome.desktop.interface gtk-theme 2>/dev/null || true) in *[Dd]ark*) mode=dark ;; *) mode=light ;; esac ;;
    esac
    ;;
  *) mode=dark ;;
esac

[ "${2:-}" = force ] || [ "$(tmux show-option -gqv @system-theme)" != "$mode" ] || exit 0

if [ "$mode" = dark ]; then
  theme=onedark/deep text='#f5f5f5' bar='#1e2127' pane='#282c34' selection='#3b4252' highlight='#ffffff' muted='#d7dae0'
else
  theme=solarized/light text='#1F2328' bar='#E4E7EB' pane='#F6F8FA' selection='#8B98A5' highlight='#0969DA' muted='#57606A'
fi

tmux set-option -g @ukiyo-theme "$theme" \; \
  set-option -g @ukiyo-color-text "$text" \; \
  set-option -g @ukiyo-color-bg-bar "$bar" \; \
  set-option -g @ukiyo-color-bg-pane "$pane" \; \
  set-option -g @ukiyo-color-selection "$selection" \; \
  set-option -g @ukiyo-color-highlight "$highlight" \; \
  set-option -g @ukiyo-color-muted "$muted" \; \
  set-option -g @ukiyo-left-icon-bg bg_bar \; \
  set-option -g @ukiyo-left-icon-fg text \; \
  set-option -g @ukiyo-left-icon-prefix-on-bg selection \; \
  set-option -g @ukiyo-left-icon-prefix-on-fg text \; \
  set-option -g @ukiyo-border-contrast true

if [ -x "$HOME/.tmux/plugins/tmux-ukiyo/ukiyo.tmux" ]; then
  "$HOME/.tmux/plugins/tmux-ukiyo/ukiyo.tmux"
else
  tmux set-option -g status-style "fg=$text,bg=$bar" \; set-window-option -g window-style "fg=$text,bg=$pane" \; set-option -g status-right ""
fi
tmux set-option -g pane-border-style "fg=$muted,bg=$pane" \; \
  set-option -g pane-active-border-style "fg=$highlight,bg=$pane" \; \
  set-option -g @system-theme "$mode" \; \
  set-option -ga status-right '#(sh "$(dirname "$(realpath "$HOME/.tmux.conf")")/tmux/theme.sh" "#{socket_path}")'
