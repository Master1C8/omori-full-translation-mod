import json
import urllib.request
import urllib.parse
import time
import datetime
import os
import sys

# Mod constants for compatibility
GAME_ID = "omori"
PROVIDER = "google"
TARGET_LANG = "ru"
SOURCE_FILE = "/Users/antonkrutov/Desktop/omori_all_en_texts.txt"
OUTPUT_CACHE = "/Users/antonkrutov/Desktop/omori_google_cache.jsonl"
BATCH_COUNT = 15 # Number of strings per request

def normalize_text(value):
    if not value: return ""
    return str(value).replace('\u00a0', ' ').replace('\t', ' ').strip()

def make_v3_key(source, lang, provider, game_id):
    normalized = normalize_text(source)
    return f"v3\n{game_id}\n{provider}\n{lang}\n{normalized}"

def google_translate_batch(texts, target="ru"):
    # Google is very good at preserving specific numeric/symbol markers
    # We use a marker that is unlikely to be in the text or translated
    marker = " 99999 "
    full_text = marker.join(texts)

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
        with urllib.request.urlopen(request, timeout=30) as response:
            data = response.read().decode("utf-8")
            payload = json.loads(data)
            if not payload or not payload[0]:
                return None

            translated_full = "".join([part[0] for part in payload[0] if part[0]])

            # Split back using the marker
            # We use regex to be flexible about spaces around the marker
            import re
            translated_parts = re.split(r'\s*99999\s*', translated_full.strip())

            # Filter out empty results if Google added any
            cleaned_parts = [p.strip() for p in translated_parts if p.strip()]

            return cleaned_parts
    except Exception as e:
        print(f"Error translating batch: {e}")
        return None

def main():
    if not os.path.exists(SOURCE_FILE):
        print(f"Source file {SOURCE_FILE} not found!")
        return

    # Load all strings
    with open(SOURCE_FILE, 'r', encoding='utf-8') as f:
        all_lines = [line.strip() for line in f if line.strip() and any(c.isalpha() for c in line)]

    # Load existing progress if any
    existing_keys = set()
    if os.path.exists(OUTPUT_CACHE):
        with open(OUTPUT_CACHE, 'r', encoding='utf-8') as f:
            for line in f:
                try:
                    entry = json.loads(line)
                    if isinstance(entry, list):
                        # The first part of key is the original text (normalized)
                        # v3\nomori\ngoogle\nru\nORIGINAL_TEXT
                        orig_text = entry[0].split('\n')[-1]
                        existing_keys.add(orig_text)
                except: continue
        print(f"Found existing cache with {len(existing_keys)} entries. Resuming...")

    # Filter out already translated
    to_translate = [l for l in all_lines if normalize_text(l) not in existing_keys]
    print(f"Total strings: {len(all_lines)}, Remaining: {len(to_translate)}")

    if not to_translate:
        print("Everything is already translated!")
        return

    # Write header only if new file
    if not os.path.exists(OUTPUT_CACHE) or os.path.getsize(OUTPUT_CACHE) == 0:
        header = {
            "format": "vnrevival-translator-cache",
            "version": 2,
            "gameId": GAME_ID,
            "exportedAt": datetime.datetime.utcnow().isoformat() + "Z"
        }
        with open(OUTPUT_CACHE, 'w', encoding='utf-8') as out:
            out.write(json.dumps(header) + "\n")

    translated_count = 0
    start_time = time.time()

    # Process in batches
    for i in range(0, len(to_translate), BATCH_COUNT):
        batch = to_translate[i : i + BATCH_COUNT]
        print(f"Processing batch {i//BATCH_COUNT + 1}... ({i}/{len(to_translate)})")

        translations = google_translate_batch(batch, TARGET_LANG)

        if translations and len(translations) == len(batch):
            with open(OUTPUT_CACHE, 'a', encoding='utf-8') as out:
                for src, trans in zip(batch, translations):
                    key = make_v3_key(src, TARGET_LANG, PROVIDER, GAME_ID)
                    out.write(json.dumps([key, trans], ensure_ascii=False) + "\n")
                out.flush() # Ensure it's written to disk
                os.fsync(out.fileno())

            translated_count += len(batch)
            elapsed = time.time() - start_time
            rate = translated_count / elapsed
            remaining = (len(to_translate) - translated_count) / rate if rate > 0 else 0
            print(f"Batch success! Speed: {rate:.2f} strings/sec. Est. remaining: {remaining/60:.1f} min")
        else:
            print(f"Batch failed (size mismatch: expected {len(batch)}, got {len(translations) if translations else 0}). Retrying individually...")
            # Fallback to individual for this batch
            for src in batch:
                trans_list = google_translate_batch([src], TARGET_LANG)
                if trans_list and len(trans_list) == 1:
                    with open(OUTPUT_CACHE, 'a', encoding='utf-8') as out:
                        key = make_v3_key(src, TARGET_LANG, PROVIDER, GAME_ID)
                        out.write(json.dumps([key, trans_list[0]], ensure_ascii=False) + "\n")
                        out.flush()
                        os.fsync(out.fileno())
                    translated_count += 1
                time.sleep(1)

        time.sleep(1.5) # Anti-ban delay

    print(f"Finished! Translated {translated_count} new strings to {OUTPUT_CACHE}")

if __name__ == "__main__":
    main()
