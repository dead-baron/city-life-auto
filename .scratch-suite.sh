#!/bin/bash
cd /home/claude/cla-b7c
timeout 1800 node --test --test-timeout=900000 test/music.test.js 2>&1 | grep -E "^not ok|^# (pass|fail)|error:" | head; for t in shoprooms gameplay npcpeople lights world3shops world3world; do
  echo "=== $t $(date +%T)"
  timeout 1800 env NODE_OPTIONS=--max-old-space-size=5200 node --test --test-timeout=900000 test/$t.test.js 2>&1 | grep -E "^not ok|^# (pass|fail)|error:" | head -20
done
echo "=== world3server $(date +%T)"
timeout 2400 env NODE_OPTIONS=--max-old-space-size=5200 node --test --test-timeout=1800000 test/world3server.test.js 2>&1 | grep -E "^not ok|^# (pass|fail)|error:|^ok" | tail -40
echo ALLDONE
