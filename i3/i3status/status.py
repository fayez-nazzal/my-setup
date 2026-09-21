#!/usr/bin/env python3
"""Minimal modern i3bar status line: date/time, wifi, memory, CPU."""
import json
import subprocess
import sys
import time

# Nord-ish accent palette, brightened for stronger contrast against the
# bar's #1b1f27 background (see bar {} block in ../config).
COLOR_TEXT = "#eceff4"
COLOR_ACCENT = "#8fe0ef"
COLOR_GOOD = "#b8e59a"
COLOR_BAD = "#ff7a8a"
COLOR_WARN = "#f5d879"

# Glyphs below are verified present in the installed GeistMono Nerd Font
# Mono charset (fc-scan confirmed coverage; several common alternatives,
# e.g. nf-fa-memory's usual f538 slot and nf-fa-wifi-slash, are NOT in this
# font's patched subset and render as blank boxes).
ICON_CLOCK = "\uf017"        #  nf-fa-clock_o
ICON_WIFI_UP = "\uf1eb"      #  nf-fa-wifi
ICON_WIFI_DOWN = "\U000f05aa"  #  nf-md-wifi_off
ICON_MEM = "\uefc5"          #  nf-fa-memory
ICON_CPU = "\uf2db"          #  nf-fa-microchip


def read_cpu_times():
    with open("/proc/stat") as f:
        parts = f.readline().split()[1:]
    vals = list(map(int, parts))
    idle = vals[3] + vals[4]
    total = sum(vals)
    return idle, total


def cpu_percent(prev_idle, prev_total):
    idle, total = read_cpu_times()
    d_idle = idle - prev_idle
    d_total = total - prev_total
    pct = 0.0 if d_total <= 0 else (1 - d_idle / d_total) * 100
    return pct, idle, total


def mem_used_gb():
    info = {}
    with open("/proc/meminfo") as f:
        for line in f:
            k, v = line.split(":", 1)
            info[k] = int(v.strip().split()[0])  # kB
    total = info["MemTotal"]
    avail = info.get("MemAvailable", info["MemFree"])
    used_kb = total - avail
    return used_kb / (1024 * 1024), total / (1024 * 1024)


def wifi_status():
    try:
        out = subprocess.run(
            ["nmcli", "-t", "-f", "active,ssid,signal", "dev", "wifi"],
            capture_output=True, text=True, timeout=1,
        ).stdout
    except Exception:
        return None, None
    for line in out.splitlines():
        parts = line.split(":")
        if len(parts) >= 3 and parts[0] == "yes":
            return parts[1], parts[2]
    return None, None


def block(full_text, color, name, separator_block_width=None):
    b = {"full_text": full_text, "color": color, "name": name}
    if separator_block_width is not None:
        b["separator_block_width"] = separator_block_width
    return b


WIFI_POLL_EVERY = 5  # seconds; nmcli spawns a process, so poll it less often


def main():
    print('{"version":1}')
    print("[")
    print("[]")
    sys.stdout.flush()

    prev_idle, prev_total = read_cpu_times()
    ssid, signal = wifi_status()
    tick = 0

    while True:
        time.sleep(1)
        tick += 1
        pct, prev_idle, prev_total = cpu_percent(prev_idle, prev_total)
        used_gb, total_gb = mem_used_gb()
        if tick % WIFI_POLL_EVERY == 0:
            ssid, signal = wifi_status()
        now = time.strftime("%a %d %b  %H:%M:%S")

        cpu_color = COLOR_BAD if pct >= 85 else COLOR_WARN if pct >= 60 else COLOR_TEXT
        mem_ratio = used_gb / total_gb if total_gb else 0
        mem_color = COLOR_BAD if mem_ratio >= 0.85 else COLOR_WARN if mem_ratio >= 0.6 else COLOR_TEXT

        blocks = []
        blocks.append(block(f"{ICON_CPU} {pct:4.1f}%", cpu_color, "cpu"))
        blocks.append(block(f"{ICON_MEM} {used_gb:.1f} GB", mem_color, "mem"))
        if ssid:
            blocks.append(block(f"{ICON_WIFI_UP} {ssid} ({signal}%)", COLOR_GOOD, "wifi"))
        else:
            blocks.append(block(f"{ICON_WIFI_DOWN} disconnected", COLOR_BAD, "wifi"))
        blocks.append(block(f"{ICON_CLOCK} {now}", COLOR_ACCENT, "time"))

        print("," + json.dumps(blocks))
        sys.stdout.flush()


if __name__ == "__main__":
    try:
        main()
    except (BrokenPipeError, KeyboardInterrupt):
        pass
