#!/bin/sh
# Tests the Android app's Java core on a desktop JVM.
# Needs: java 17+, python3 with pyftpdlib + pyopenssl (pip install pyftpdlib pyopenssl), openssl, curl
set -e
cd "$(dirname "$0")"
W=$(mktemp -d)
trap 'kill $P1 $P2 $P3 2>/dev/null; rm -rf "$W"' EXIT
[ -f "$W/net.jar" ] || curl -sSLo "$W/net.jar" https://repo.maven.apache.org/maven2/commons-net/commons-net/3.11.1/commons-net-3.11.1.jar
openssl req -x509 -newkey rsa:2048 -nodes -keyout "$W/k.pem" -out "$W/c.pem" -days 1 -subj /CN=127.0.0.1 2>/dev/null
mkdir -p "$W/root" "$W/src"
cp "$W/k.pem" "$W/c.pem" .  # server reads them from cwd
python3 ftps_server.py "$W/root" 2521 plain & P1=$!
python3 ftps_server.py "$W/root" 2522 tls & P2=$!
python3 ftps_server.py "$W/root" 2523 tls-reuse & P3=$!
sleep 1.5
rm -f k.pem c.pem
# a UTF-8 zip with folders
(cd "$W/src" && mkdir -p src/sub && printf 'x' > "src/日本語.txt" && head -c 1649847 /dev/zero > src/big.txt && printf 'y' > src/sub/b.txt && python3 -c "import zipfile,os
z=zipfile.ZipFile('$W/u.zip','w',zipfile.ZIP_DEFLATED)
[z.write(os.path.join(d,f)) for d,_,fs in os.walk('src') for f in fs]")
javac -encoding UTF-8 -cp "$W/net.jar" -d "$W/classes" ../android/app/src/main/java/jp/appup/ftpmanager/core/*.java CoreTest.java
java -Dfile.encoding=UTF-8 -cp "$W/classes:$W/net.jar" CoreTest ../../server/test/fixtures 2521 2522 "$W/root" "$W/u.zip" 2523
