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
OUTPUT_CACHE = "/Users/antonkrutov/Desktop/omori_google_cache.jsonl"
BATCH_SIZE_CHARS = 2500 # Keep it safe below 3500

def normalize_text(value):
    if not value: return ""
    return str(value).replace('\u00a0', ' ').replace('\t', ' ').strip()

def make_v3_key(source, lang, provider, game_id):
    normalized = normalize_text(source)
    return f"v3\n{game_id}\n{provider}\n{lang}\n{normalized}"

def google_translate_batch(texts, target="ru"):
    # We use a unique separator that Google usually preserves
    separator = " |VNSPLIT| "
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
            payload = json.loads(response.read().decode("utf-8"))
            if not payload or not payload[0]:
                return None
            translated_full = "".join([part[0] for part in payload[0] if part[0]])

            # Split back
            translated_parts = translated_full.split("|VNSPLIT|")
            return [p.strip() for p in translated_parts]
    except Exception as e:
        print(f"Error translating batch: {e}")
        return None

def main():
    if not os.path.exists(SOURCE_FILE):
        print(f"Source file {SOURCE_FILE} not found!")
        return

    with open(SOURCE_FILE, 'r', encoding='utf-8') as f:
        all_lines = [line.strip() for line in f if line.strip() and any(c.isalpha() for c in line)]

    print(f"Found {len(all_lines)} translatable strings. Starting batched translation...")

    header = {
        "format": "vnrevival-translator-cache",
        "version": 2,
        "gameId": GAME_ID,
        "exportedAt": datetime.datetime.utcnow().isoformat() + "Z"
    }

    translated_count = 0
    with open(OUTPUT_CACHE, 'w', encoding='utf-8') as out:
        out.write(json.dumps(header) + "\n")

        current_batch = []
        current_batch_len = 0

        for i, source in enumerate(all_lines):
            current_batch.append(source)
            current_batch_len += len(source)

            if current_batch_len >= BATCH_SIZE_CHARS or i == len(all_lines) - 1:
                print(f"Translating batch of {len(current_batch)} items... ({i}/{len(all_lines)})")
                translations = google_translate_batch(current_batch, TARGET_LANG)

                if translations and len(translations) == len(current_batch):
                    for src, trans in zip(current_batch, translations):
                        key = make_v3_key(src, TARGET_LANG, PROVIDER, GAME_ID)
                        out.write(json.dumps([key, trans], ensure_ascii=False) + "\n")
                        translated_count += 1
                else:
                    print(f"Batch failed or size mismatch. Skipping {len(current_batch)} items.")

                current_batch = []
                current_batch_len = 0
                time.sleep(2) # Delay between batches to avoid rate limit

    print(f"Finished! Translated {translated_count} strings to {OUTPUT_CACHE}")

if __name__ == "__main__":
    main()
