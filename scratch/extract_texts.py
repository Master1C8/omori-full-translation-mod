import os
import re
import yaml
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend

OMORI_KEY = "6bdb2e585882fbd48826ef9cffd4c511"

def decrypt_omori_data(data):
    iv = data[:16]
    encrypted_content = data[16:]
    key = OMORI_KEY.encode('utf-8')
    cipher = Cipher(algorithms.AES(key), modes.CTR(iv), backend=default_backend())
    decryptor = cipher.decryptor()
    return decryptor.update(encrypted_content) + decryptor.finalize()

def extract_from_file(path):
    with open(path, 'rb') as f:
        encrypted_data = f.read()
    decrypted_data = decrypt_omori_data(encrypted_data).decode('utf-8', errors='ignore')

    # Simple regex to find text: lines, because actual YAML parsing might fail on some game-specific syntax
    texts = []
    for line in decrypted_data.split('\n'):
        match = re.search(r'^\s*text:\s*(.*)$', line)
        if match:
            text = match.group(1).strip()
            if text and text != '""' and text != "''":
                # Remove quotes if present
                if (text.startswith('"') and text.endswith('"')) or (text.startswith("'") and text.endswith("'")):
                    text = text[1:-1]
                if text:
                    texts.append(text)
    return texts

def main():
    lang_dir = "/Users/antonkrutov/Library/Application Support/Steam/steamapps/common/OMORI/OMORI.app/Contents/Resources/app.nw/languages/en/"
    all_texts = set()

    for filename in os.listdir(lang_dir):
        if filename.endswith(".HERO"):
            print(f"Processing {filename}...")
            try:
                texts = extract_from_file(os.path.join(lang_dir, filename))
                all_texts.update(texts)
            except Exception as e:
                print(f"Error processing {filename}: {e}")

    output_path = "/Users/antonkrutov/Desktop/omori_all_en_texts.txt"
    with open(output_path, 'w', encoding='utf-8') as f:
        for text in sorted(list(all_texts)):
            f.write(text + "\n")

    print(f"Extracted {len(all_texts)} unique strings to {output_path}")

if __name__ == "__main__":
    main()
