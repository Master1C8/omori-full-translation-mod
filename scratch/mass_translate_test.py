import json
import urllib.request
import urllib.parse
import time
import datetime
import os

# Mod constants for compatibility
GAME_ID = "omori"
PROVIDER = "google"
TARGET_LANG = "ru"
SOURCE_FILE = "/Users/antonkrutov/Desktop/omori_all_en_texts.txt"
OUTPUT_CACHE = "/Users/antonkrutov/Desktop/omori_test_cache.jsonl"
BATCH_SIZE_CHARS = 1000

def normalize_text(value):
    if not value: return ""
    return str(value).replace('\u00a0', ' ').replace('\t', ' ').strip()

def make_v3_key(source, lang, provider, game_id):
    normalized = normalize_text(source)
    return f"v3\n{game_id}\n{provider}\n{lang}\n{normalized}"

def google_translate_batch(texts, target="ru"):
    # Using a safer separator
    separator = " \n[VNSPLIT]\n "
    full_text = separator.join(texts)

    params = {
        "client": "gtx",
        "sl": "en",
        "tl": target,
        "dt": "t",
        "q": full_text
    }
    url = "https://translate.googleapis.com/translate_a/single?" + urllib.parse.urlencode(params)

    try:
        request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(request, timeout=20) as response:
            data = response.read().decode("utf-8")
            payload = json.loads(data)
            if not payload or not payload[0]:
                return None

            # Google splits long text into internal segments in the response
            translated_full = "".join([part[0] for part in payload[0] if part[0]])

            # Print for debugging
            # print(f"DEBUG: Response length: {len(translated_full)}")

            # Split back
            translated_parts = translated_full.split("[VNSPLIT]")
            cleaned_parts = [p.strip() for p in translated_parts]

            if len(cleaned_parts) != len(texts):
                print(f"DEBUG: Expected {len(texts)} parts, got {len(cleaned_parts)}")
                # If mismatch, maybe Google merged separators or changed them.
                # Let's try a different approach if this fails.

            return cleaned_parts
    except Exception as e:
        print(f"Error translating batch: {e}")
        return None

def main():
    if not os.path.exists(SOURCE_FILE):
        print(f"Source file {SOURCE_FILE} not found!")
        return

    with open(SOURCE_FILE, 'r', encoding='utf-8') as f:
        all_lines = [line.strip() for line in f if line.strip() and any(c.isalpha() for c in line)]

    # Take only first 10 lines for testing
    test_lines = all_lines[:10]
    print(f"Testing with {len(test_lines)} strings...")

    header = {
        "format": "vnrevival-translator-cache",
        "version": 2,
        "gameId": GAME_ID,
        "exportedAt": datetime.datetime.utcnow().isoformat() + "Z"
    }

    translated_count = 0
    with open(OUTPUT_CACHE, 'w', encoding='utf-8') as out:
        out.write(json.dumps(header) + "\n")

        for i, source in enumerate(test_lines):
            print(f"Translating {i+1}/10: {source[:30]}...")
            translation = google_translate_batch([source], TARGET_LANG)

            if translation and len(translation) == 1:
                key = make_v3_key(source, TARGET_LANG, PROVIDER, GAME_ID)
                out.write(json.dumps([key, translation[0]], ensure_ascii=False) + "\n")
                translated_count += 1
                print(f"Success!")
            else:
                print(f"Failed.")

            time.sleep(0.5)

    print(f"Finished test! Translated {translated_count} strings.")

if __name__ == "__main__":
    main()
