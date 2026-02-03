#!/bin/bash
# Multi-stream relay script for Claudecraft
# Receives stream from OBS locally, relays to PumpFun + Twitter

# ============================================
# CONFIGURE THESE WITH YOUR ACTUAL KEYS
# ============================================
PUMPFUN_RTMP="rtmp://rtmp.livepeer.com/live"
PUMPFUN_KEY="your-pumpfun-stream-key"

TWITTER_RTMP="rtmp://va.pscp.tv:80/x"
TWITTER_KEY="your-twitter-stream-key"

# Local input from OBS
LOCAL_INPUT="rtmp://localhost:1935/live/claudecraft"

# ============================================
# START MULTI-STREAM
# ============================================
echo "🎬 Claudecraft Multi-Stream Relay"
echo "=================================="
echo "Waiting for OBS to connect to rtmp://localhost:1935/live/claudecraft"
echo ""

# Wait for OBS to start streaming
while ! curl -s http://localhost:8888/live/claudecraft/index.m3u8 > /dev/null 2>&1; do
  sleep 2
done

echo "✅ OBS stream detected! Starting relay..."
echo ""
echo "📡 Relaying to:"
echo "   - PumpFun: $PUMPFUN_RTMP"
echo "   - Twitter: $TWITTER_RTMP"
echo ""

# FFmpeg command to relay to both platforms
# Uses tee muxer to send to multiple outputs
ffmpeg -re -i "$LOCAL_INPUT" \
  -c:v libx264 -preset veryfast -maxrate 3000k -bufsize 6000k -pix_fmt yuv420p -g 50 \
  -c:a aac -b:a 128k -ar 44100 \
  -f flv "${PUMPFUN_RTMP}/${PUMPFUN_KEY}" \
  -c:v libx264 -preset veryfast -maxrate 3000k -bufsize 6000k -pix_fmt yuv420p -g 50 \
  -c:a aac -b:a 128k -ar 44100 \
  -f flv "${TWITTER_RTMP}/${TWITTER_KEY}"

echo ""
echo "Stream ended."
