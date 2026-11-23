# Regression pictures (package 5)

A fixed set of places (`places.json`, 55: every district's middle, one of each kind of place, the hand-made ones the
owner names) rendered as the game bakes them, before and after any world or art change, and compared place by place.
The owner, 11-21: "I spend a lot of usage catching issues that broke when another fixed, or fixes that weren't applied
across the world". A place that changed and shouldn't have is the case to look at first.

    flock /tmp/cla-heavy.lock node tools/regress/shots.mjs /tmp/reg-before      # on the branch before the change
    flock /tmp/cla-heavy.lock node tools/regress/shots.mjs /tmp/reg-after       # after it
    python3 tools/regress/diff.py /tmp/reg-before /tmp/reg-after --out /tmp/reg-diff

`--night` for the night pictures (lamps, signs, lit windows); `--only id,id` for a few. Keep `places.json` stable:
regenerate it (`node tools/regress/places.mjs`) only when the list itself should change, and say so in the DEVLOG.
Delete the picture folders once looked at (the disk).
