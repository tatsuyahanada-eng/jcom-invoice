#!/usr/bin/env bash
# Builds ServerChecklist.apk with plain Android SDK tools (no Gradle).
# Needs: JDK 17+, ANDROID_HOME with platforms;android-34 and build-tools;34.0.0
set -euo pipefail
cd "$(dirname "$0")"

SDK="${ANDROID_HOME:-/opt/android-sdk}"
BT="$SDK/build-tools/34.0.0"
JAR="$SDK/platforms/android-34/android.jar"
OUT=build
APP=app
KS=release.keystore

rm -rf "$OUT" && mkdir -p "$OUT/gen" "$OUT/classes" "$OUT/res"

"$BT/aapt2" compile --dir "$APP/res" -o "$OUT/res.zip"
"$BT/aapt2" link -I "$JAR" --manifest "$APP/AndroidManifest.xml" \
  --min-sdk-version 24 --target-sdk-version 34 \
  -A "$APP/assets" --java "$OUT/gen" -o "$OUT/base.apk" "$OUT/res.zip"

javac -nowarn -source 11 -target 11 -Xlint:-options -classpath "$JAR" -d "$OUT/classes" \
  $(find "$APP/src" "$OUT/gen" -name '*.java')
"$BT/d8" --release --min-api 24 --lib "$JAR" --output "$OUT" $(find "$OUT/classes" -name '*.class')

cp "$OUT/base.apk" "$OUT/unsigned.apk"
(cd "$OUT" && zip -q -j unsigned.apk classes.dex)
"$BT/zipalign" -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"

if [ ! -f "$KS" ]; then
  keytool -genkeypair -keystore "$KS" -alias checklist -storepass checklist -keypass checklist \
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Server Checklist" >/dev/null
fi
"$BT/apksigner" sign --ks "$KS" --ks-pass pass:checklist --key-pass pass:checklist \
  --out ServerChecklist.apk "$OUT/aligned.apk"
"$BT/apksigner" verify ServerChecklist.apk
echo "Built: $(pwd)/ServerChecklist.apk"
