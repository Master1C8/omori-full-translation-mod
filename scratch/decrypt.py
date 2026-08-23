import sys
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend

def decrypt_omori_file(input_path, output_path, key_str):
    key = key_str.encode('utf-8')
    with open(input_path, 'rb') as f:
        data = f.read()

    iv = data[:16]
    encrypted_content = data[16:]

    cipher = Cipher(algorithms.AES(key), modes.CTR(iv), backend=default_backend())
    decryptor = cipher.decryptor()
    decrypted_content = decryptor.update(encrypted_content) + decryptor.finalize()

    with open(output_path, 'wb') as f:
        f.write(decrypted_content)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python3 decrypt.py <input> <output>")
        sys.exit(1)

    OMORI_KEY = "6bdb2e585882fbd48826ef9cffd4c511"
    decrypt_omori_file(sys.argv[1], sys.argv[2], OMORI_KEY)
    print(f"Decrypted {sys.argv[1]} to {sys.argv[2]}")
