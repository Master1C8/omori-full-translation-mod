import json
import urllib.request
import urllib.parse
import time
import datetime
import os
import re

# Mod constants for compatibility
GAME_ID = "omori"
PROVIDER = "google"
TARGET_LANG = "ru" # You can change this if needed
SOURCE_FILE = "/Users/antonkrutov/Desktop/omori_all_en_texts.txt"
OUTPUT_CACHE = "/Users/antonkrutov/Desktop/omori_google_cache.jsonl"

def normalize_text(value):
    if not value: return ""
    return str(value).replace('\u00a0', ' ').replace('\t', ' ').strip()

def make_v3_key(source, lang, provider, game_id):
    normalized = normalize_text(source)
    return f"v3\n{game_id}\n{provider}\n{lang}\n{normalized}"

def google_translate(text, target="ru"):
    params = {
        "client": "gtx",
        "sl": "en",
        "tl": target,
        "dt": "t",
        "q": text
    }
    url = "https://translate.googleapis.com/translate_a/single?" + urllib.parse.urlencode(params)

    try:
        request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(request, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
            if not payload or not payload[0]:
                return None
            return "".join([part[0] for part in payload[0] if part[0]])
    except Exception as e:
        print(f"Error translating: {e}")
        return None

def main():
    if not os.path.exists(SOURCE_FILE):
        print(f"Source file {SOURCE_FILE} not found!")
        return

    with open(SOURCE_FILE, 'r', encoding='utf-8') as f:
        lines = [line.strip() for line in f if line.strip()]

    print(f"Found {len(lines)} unique strings. Starting translation...")

    header = {
        "format": "vnrevival-translator-cache",
        "version": 2,
        "gameId": GAME_ID,
        "exportedAt": datetime.datetime.utcnow().isoformat() + "Z"
    }

    translated_count = 0
    with open(OUTPUT_CACHE, 'w', encoding='utf-8') as out:
        out.write(json.dumps(header) + "\n")

        for i, source in enumerate(lines):
            # Skip very short or non-text strings to save time
            if len(source) < 2 or not any(c.isalpha() for c in source):
                continue

            translation = google_translate(source, TARGET_LANG)
            if translation:
                key = make_v3_key(source, TARGET_LANG, PROVIDER, GAME_ID)
                entry = [key, translation]
                out.write(json.dumps(entry, ensure_ascii=False) + "\n")
                translated_count += 1

            if i % 10 == 0:
                print(f"Progress: {i}/{len(lines)} ({translated_count} translated)")

            # To avoid Google blocking IP
            time.sleep(0.5)

            # Optional: break early for testing if you want
            # if translated_count > 100: break

    print(f"Finished! Translated {translated_count} strings to {OUTPUT_CACHE}")

if __name__ == "__main__":
    main()
