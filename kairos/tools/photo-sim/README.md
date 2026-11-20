# Photographs of a calendar, simulated

Measures the photo route of the calendar reader (`packages/core/src/import/photo*.ts`) without a phone.

```bash
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
W=tools/photo-sim/.work; mkdir -p $W

# 1. Render the fixtures as camera photos: 3 levels × 2 each × 11 fixtures (needs python3 with opencv, numpy)
python3 tools/photo-sim/sim.py $W/out 2

# 2. Build the Vision command-line tool (the same Swift file the app uses), read the words in every photo
swiftc -O -o $W/vision-cli tools/vision-cli/main.swift apps/app/modules/tender-vision/ios/VisionCore.swift
$W/vision-cli 3000 $W/out/photos/*.jpg > $W/tokens.jsonl

# 3. Score
export PHOTO_SIM_DIR=$PWD/$W
cd packages/core
npx tsx ../../tools/photo-sim/score.mts baseline   # the old route: shape reader on the shrunk photo
npx tsx ../../tools/photo-sim/score.mts photo      # Vision → homography → flatten → text-driven reader
npx tsx ../../tools/photo-sim/score.mts clean      # the same route on the flat screenshot fixtures
```

`.work/` is ignored by git. The recorded words and flattened images that the unit tests use are in
`packages/core/test/fixtures/photos/`.
