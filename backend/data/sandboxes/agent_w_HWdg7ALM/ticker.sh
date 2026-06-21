#!/bin/bash
# 10-Second Ticker - writes a timestamp every 10 seconds
LOGFILE="/home/workspace/Projects/ai-automation-lab/backend/data/sandboxes/agent_w_HWdg7ALM/automation_log.txt"
COUNTER=1

while true; do
  TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
  echo "[$TIMESTAMP] Tick #$COUNTER" >> "$LOGFILE"
  echo "[$TIMESTAMP] Tick #$COUNTER"
  COUNTER=$((COUNTER + 1))
  sleep 10
done
