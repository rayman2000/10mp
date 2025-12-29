#!/bin/bash

# Enable logging
exec > /tmp/kiosk.log 2>&1
set -x

echo "$(date): Kiosk script starting..."

# Test network connectivity
if ping -c 1 google.com; then
    echo "Network is working"
else
    echo "No network connection!"
fi

# Setup audio
echo "Setting up audio..."
export PULSE_RUNTIME_PATH=/run/user/$(id -u)/pulse

# Start PulseAudio
pulseaudio --start --verbose
sleep 2

# Test audio setup
echo "Testing audio..."
pactl info
amixer set Master 80%
amixer set PCM 80%

# Disable screen blanking
echo "Setting display options..."
xset s noblank
xset s off
xset -dpms

# Hide cursor
echo "Starting unclutter..."
unclutter -idle 0.5 -root &

# Start window manager
echo "Starting openbox..."
openbox-session &

# Wait for window manager
echo "Waiting for window manager..."
sleep 5

echo "Loading emoji fonts..."
fc-cache -f -v

python gamestate_server_with_leds.py & 

# Wait for it to be ready
echo "Waiting for gamestate server..."
for i in {1..30}; do
  if curl -s http://localhost:3333/health > /dev/null 2>&1; then
    echo "✓ Gamestate server is ready!"
    break
  fi
  sleep 1
done

# Start Chromium with audio support
echo "Starting firefox..."
# --no-sandbox \
#  --kiosk \
#chromium-browser \
#  --noerrdialogs \
#  --disable-infobars \
#  --disable-session-crashed-bubble \
#  --disable-restore-session-state \
#  --disable-web-security \
#  --disable-features=TranslateUI \
#  --disable-ipc-flooding-protection \
#  --disable-session-crashed-bubble \
#  --enable-widevine-cdm \
#  --enable-features=VaapiVideoDecoder,SharedArrayBuffer \
#  --enable-audio-service-sandbox \
#  --alsa-output-device=default \
#  --audio-buffer-size=2048 \
#  --autoplay-policy=no-user-gesture-required \
#  --allow-running-insecure-content \
#  --start-fullscreen \
#  "https://10mp.zhbase.ch" & 
  #--use-fake-ui-for-media-stream \

firefox-esr \
  --kiosk \
  "https://10mp.zhbase.ch" &

echo "Firefox started with PID: $!"

# Keep script running
wait
