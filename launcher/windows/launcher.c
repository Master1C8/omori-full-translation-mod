#ifndef UNICODE
#define UNICODE
#endif
#ifndef _UNICODE
#define _UNICODE
#endif
#define _WIN32_WINNT 0x0602

#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <winhttp.h>
#include <commdlg.h>
#include <shlobj.h>
#include <tlhelp32.h>
#include <objbase.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <wchar.h>

#define APP_TITLE L"__PRODUCT_NAME_C__"
#define GAME_TITLE L"__GAME_TITLE_C__"
#define GAME_EXECUTABLE L"__WINDOWS_EXECUTABLE_C__"
#define LOCAL_DATA_DIRECTORY L"__DATA_DIRECTORY_WINDOWS_C__"
#define SOURCE_LABEL "__GAME_ID_C__-translator.bundle.js"
#define GAME_ID_W L"__GAME_ID_C__"
#define TARGET_TITLE_HINT "__DEBUG_TARGET_TITLE_C__"
#define TARGET_URL_HINT "__DEBUG_TARGET_URL_C__"
#define RESELECT_MARKER L".reselect-game-executable"
#define APP_ID __STEAM_APP_ID__
#define APP_VERSION L"__VERSION__"
#define PATH_CAP 32768
#define HTTP_CAP (8 * 1024 * 1024)

static HANDLE g_local_service_process = NULL;
static HANDLE g_game_process = NULL;
static HINTERNET g_http_session = NULL;
static BOOL g_winsock_started = FALSE;
static BOOL g_com_initialized = FALSE;
static BOOL g_stop_game_on_cleanup = FALSE;

static BOOL path_join(WCHAR *out, size_t cap, const WCHAR *left, const WCHAR *right)
{
    size_t length = wcslen(left);
    const WCHAR *separator = length && left[length - 1] != L'\\' && left[length - 1] != L'/' ? L"\\" : L"";
    int written = _snwprintf(out, cap, L"%ls%ls%ls", left, separator, right);
    return written >= 0 && (size_t)written < cap;
}

static BOOL file_exists(const WCHAR *path)
{
    DWORD attributes = GetFileAttributesW(path);
    return attributes != INVALID_FILE_ATTRIBUTES && !(attributes & FILE_ATTRIBUTE_DIRECTORY);
}

static BOOL dir_exists(const WCHAR *path)
{
    DWORD attributes = GetFileAttributesW(path);
    return attributes != INVALID_FILE_ATTRIBUTES && (attributes & FILE_ATTRIBUTE_DIRECTORY);
}

static void parent_dir(const WCHAR *path, WCHAR *out)
{
    WCHAR *slash;
    wcsncpy(out, path, PATH_CAP - 1);
    out[PATH_CAP - 1] = L'\0';
    slash = wcsrchr(out, L'\\');
    if (slash) *slash = L'\0';
}

static void show_error(const WCHAR *message)
{
    MessageBoxW(NULL, message, APP_TITLE, MB_OK | MB_ICONERROR | MB_SETFOREGROUND);
}

static BOOL ensure_directory(const WCHAR *path)
{
    int result = SHCreateDirectoryExW(NULL, path, NULL);
    return result == ERROR_SUCCESS || result == ERROR_ALREADY_EXISTS || dir_exists(path);
}

static char *read_file_utf8(const WCHAR *path, DWORD *size_out)
{
    HANDLE file = CreateFileW(path, GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
    LARGE_INTEGER size;
    DWORD read_count = 0;
    char *buffer;
    if (file == INVALID_HANDLE_VALUE) return NULL;
    if (!GetFileSizeEx(file, &size) || size.QuadPart <= 0 || size.QuadPart > HTTP_CAP) {
        CloseHandle(file);
        return NULL;
    }
    buffer = (char *)malloc((size_t)size.QuadPart + 1);
    if (!buffer) {
        CloseHandle(file);
        return NULL;
    }
    if (!ReadFile(file, buffer, (DWORD)size.QuadPart, &read_count, NULL)) {
        free(buffer);
        CloseHandle(file);
        return NULL;
    }
    CloseHandle(file);
    buffer[read_count] = '\0';
    if (size_out) *size_out = read_count;
    return buffer;
}

static BOOL utf8_to_wide(const char *input, WCHAR *output, size_t cap)
{
    return MultiByteToWideChar(CP_UTF8, 0, input, -1, output, (int)cap) > 0;
}

static BOOL wide_to_utf8(const WCHAR *input, char *output, size_t cap)
{
    return WideCharToMultiByte(CP_UTF8, 0, input, -1, output, (int)cap, NULL, NULL) > 0;
}

static BOOL quoted_value_after(const char *start, const char *key, char *out, size_t cap)
{
    const char *cursor = strstr(start, key);
    const char *quote;
    const char *end;
    size_t length;
    if (!cursor) return FALSE;
    cursor += strlen(key);
    quote = strchr(cursor, '"');
    if (!quote) return FALSE;
    end = strchr(quote + 1, '"');
    if (!end) return FALSE;
    length = (size_t)(end - quote - 1);
    if (!length || length >= cap) return FALSE;
    memcpy(out, quote + 1, length);
    out[length] = '\0';
    return TRUE;
}

static BOOL steam_root(WCHAR *result)
{
    HKEY key;
    DWORD type = 0;
    DWORD bytes = PATH_CAP * sizeof(WCHAR);
    if (RegOpenKeyExW(HKEY_CURRENT_USER, L"Software\\Valve\\Steam", 0, KEY_READ, &key) != ERROR_SUCCESS)
        return FALSE;
    if (RegQueryValueExW(key, L"SteamPath", NULL, &type, (BYTE *)result, &bytes) != ERROR_SUCCESS
        || (type != REG_SZ && type != REG_EXPAND_SZ)) {
        RegCloseKey(key);
        return FALSE;
    }
    RegCloseKey(key);
    for (WCHAR *cursor = result; *cursor; cursor++) if (*cursor == L'/') *cursor = L'\\';
    return dir_exists(result);
}

static char *read_small_file(const WCHAR *path)
{
    DWORD size = 0;
    return read_file_utf8(path, &size);
}

static BOOL game_from_library(const WCHAR *library, WCHAR *result)
{
    WCHAR manifest[PATH_CAP];
    WCHAR common[PATH_CAP];
    WCHAR game_dir[PATH_CAP];
    WCHAR candidate[PATH_CAP];
    char install_utf8[1024];
    WCHAR install_name[1024];
    char *contents;
    _snwprintf(manifest, PATH_CAP, L"%ls\\steamapps\\appmanifest_%u.acf", library, (unsigned int)APP_ID);
    contents = read_small_file(manifest);
    if (!contents) return FALSE;
    if (!quoted_value_after(contents, "\"installdir\"", install_utf8, sizeof(install_utf8))
        || !utf8_to_wide(install_utf8, install_name, sizeof(install_name) / sizeof(install_name[0]))) {
        free(contents);
        return FALSE;
    }
    free(contents);
    path_join(common, PATH_CAP, library, L"steamapps\\common");
    path_join(game_dir, PATH_CAP, common, install_name);
    path_join(candidate, PATH_CAP, game_dir, GAME_EXECUTABLE);
    if (!file_exists(candidate)) return FALSE;
    wcsncpy(result, candidate, PATH_CAP - 1);
    result[PATH_CAP - 1] = L'\0';
    return TRUE;
}

static BOOL find_steam_game(WCHAR *game_path, WCHAR *steam_path)
{
    WCHAR root[PATH_CAP];
    WCHAR libraries[PATH_CAP];
    char *contents;
    const char *cursor;
    if (!steam_root(root)) return FALSE;
    path_join(steam_path, PATH_CAP, root, L"steam.exe");
    if (!file_exists(steam_path)) return FALSE;
    if (game_from_library(root, game_path)) return TRUE;
    path_join(libraries, PATH_CAP, root, L"steamapps\\libraryfolders.vdf");
    contents = read_small_file(libraries);
    if (!contents) return FALSE;
    cursor = contents;
    while ((cursor = strstr(cursor, "\"path\"")) != NULL) {
        char library_utf8[PATH_CAP];
        WCHAR library[PATH_CAP];
        if (quoted_value_after(cursor + strlen("\"path\""), "", library_utf8, sizeof(library_utf8))
            && utf8_to_wide(library_utf8, library, PATH_CAP)) {
            WCHAR *src = library;
            WCHAR *dst = library;
            while (*src) {
                if (src[0] == L'\\' && src[1] == L'\\') src++;
                *dst++ = *src++;
            }
            *dst = L'\0';
            if (game_from_library(library, game_path)) {
                free(contents);
                return TRUE;
            }
        }
        cursor += strlen("\"path\"");
    }
    free(contents);
    return FALSE;
}

static BOOL find_steam_executable(WCHAR *steam_path)
{
    WCHAR root[PATH_CAP];
    if (!steam_root(root)) return FALSE;
    path_join(steam_path, PATH_CAP, root, L"steam.exe");
    return file_exists(steam_path);
}

static void game_registry_key(WCHAR *result, size_t cap)
{
    _snwprintf(result, cap, L"Software\\VN Revival\\Translator Paths\\%ls", GAME_ID_W);
}

static BOOL load_saved_game_path(WCHAR *result)
{
    HKEY key;
    WCHAR key_path[1024];
    DWORD type = 0;
    DWORD bytes = PATH_CAP * sizeof(WCHAR);
    game_registry_key(key_path, sizeof(key_path) / sizeof(key_path[0]));
    if (RegOpenKeyExW(HKEY_CURRENT_USER, key_path, 0, KEY_READ, &key) != ERROR_SUCCESS) return FALSE;
    if (RegQueryValueExW(key, L"Executable", NULL, &type, (BYTE *)result, &bytes) != ERROR_SUCCESS || type != REG_SZ) {
        RegCloseKey(key);
        return FALSE;
    }
    RegCloseKey(key);
    return file_exists(result);
}

static void save_game_path(const WCHAR *path)
{
    HKEY key;
    WCHAR key_path[1024];
    DWORD disposition;
    game_registry_key(key_path, sizeof(key_path) / sizeof(key_path[0]));
    if (RegCreateKeyExW(HKEY_CURRENT_USER, key_path, 0, NULL, 0, KEY_WRITE, NULL, &key, &disposition) == ERROR_SUCCESS) {
        RegSetValueExW(key, L"Executable", 0, REG_SZ, (const BYTE *)path, (DWORD)((wcslen(path) + 1) * sizeof(WCHAR)));
        RegCloseKey(key);
    }
}

static BOOL choose_game_executable(WCHAR *result)
{
    OPENFILENAMEW dialog;
    WCHAR title[1024];
    ZeroMemory(&dialog, sizeof(dialog));
    result[0] = L'\0';
    _snwprintf(title, sizeof(title) / sizeof(title[0]), L"Locate the Windows executable for %ls", GAME_TITLE);
    dialog.lStructSize = sizeof(dialog);
    dialog.lpstrFilter = L"Windows executable (*.exe)\0*.exe\0All files\0*.*\0\0";
    dialog.lpstrFile = result;
    dialog.nMaxFile = PATH_CAP;
    dialog.lpstrTitle = title;
    dialog.Flags = OFN_FILEMUSTEXIST | OFN_PATHMUSTEXIST | OFN_NOCHANGEDIR;
    if (!GetOpenFileNameW(&dialog) || !file_exists(result)) return FALSE;
    {
        const WCHAR *extension = wcsrchr(result, L'.');
        return extension && _wcsicmp(extension, L".exe") == 0;
    }
}

static BOOL consume_reselect_marker(void)
{
    WCHAR local_app_data[PATH_CAP], data_dir[PATH_CAP], marker[PATH_CAP];
    if (SHGetFolderPathW(NULL, CSIDL_LOCAL_APPDATA, NULL, SHGFP_TYPE_CURRENT, local_app_data) != S_OK) return FALSE;
    path_join(data_dir, PATH_CAP, local_app_data, LOCAL_DATA_DIRECTORY);
    path_join(marker, PATH_CAP, data_dir, RESELECT_MARKER);
    if (!file_exists(marker)) return FALSE;
    DeleteFileW(marker);
    return TRUE;
}

static BOOL process_path_matches(DWORD pid, const WCHAR *expected_path, DWORD access, HANDLE *process_out)
{
    HANDLE process = OpenProcess(access, FALSE, pid);
    WCHAR actual_path[PATH_CAP];
    DWORD path_length = PATH_CAP;
    BOOL matches = FALSE;
    if (!process) return FALSE;
    if (QueryFullProcessImageNameW(process, 0, actual_path, &path_length)
        && _wcsicmp(actual_path, expected_path) == 0) {
        matches = TRUE;
    }
    if (matches && process_out) *process_out = process;
    else CloseHandle(process);
    return matches;
}

static BOOL process_running(const WCHAR *expected_path, HANDLE *process_out)
{
    PROCESSENTRY32W entry;
    HANDLE snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    BOOL found = FALSE;
    if (snapshot == INVALID_HANDLE_VALUE) return FALSE;
    ZeroMemory(&entry, sizeof(entry));
    entry.dwSize = sizeof(entry);
    if (Process32FirstW(snapshot, &entry)) {
        do {
            if (process_path_matches(entry.th32ProcessID, expected_path,
                    PROCESS_QUERY_LIMITED_INFORMATION | (process_out ? PROCESS_TERMINATE | SYNCHRONIZE : 0), process_out)) {
                found = TRUE;
                break;
            }
        } while (Process32NextW(snapshot, &entry));
    }
    CloseHandle(snapshot);
    return found;
}

static USHORT free_loopback_port(USHORT start, USHORT end)
{
    SOCKET socket_handle;
    struct sockaddr_in address;
    for (USHORT port = start; port <= end; port++) {
        socket_handle = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
        if (socket_handle == INVALID_SOCKET) return 0;
        ZeroMemory(&address, sizeof(address));
        address.sin_family = AF_INET;
        address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
        address.sin_port = htons(port);
        if (bind(socket_handle, (struct sockaddr *)&address, sizeof(address)) == 0) {
            closesocket(socket_handle);
            return port;
        }
        closesocket(socket_handle);
    }
    return 0;
}

static BOOL wait_for_port(USHORT port, DWORD timeout_ms)
{
    DWORD start = GetTickCount();
    while (GetTickCount() - start < timeout_ms) {
        SOCKET socket_handle = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
        struct sockaddr_in address;
        if (socket_handle != INVALID_SOCKET) {
            ZeroMemory(&address, sizeof(address));
            address.sin_family = AF_INET;
            address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
            address.sin_port = htons(port);
            if (connect(socket_handle, (struct sockaddr *)&address, sizeof(address)) == 0) {
                closesocket(socket_handle);
                return TRUE;
            }
            closesocket(socket_handle);
        }
        Sleep(100);
    }
    return FALSE;
}

static BOOL make_token(WCHAR *wide_token, size_t cap, char *utf8_token, size_t utf8_cap)
{
    GUID guid;
    if (CoCreateGuid(&guid) != S_OK) return FALSE;
    if (_snwprintf(
            wide_token,
            cap,
            L"%08lX%04X%04X%02X%02X%02X%02X%02X%02X%02X%02X",
            guid.Data1, guid.Data2, guid.Data3,
            guid.Data4[0], guid.Data4[1], guid.Data4[2], guid.Data4[3],
            guid.Data4[4], guid.Data4[5], guid.Data4[6], guid.Data4[7]) < 0)
        return FALSE;
    return wide_to_utf8(wide_token, utf8_token, utf8_cap);
}

static BOOL start_hidden_process(const WCHAR *command, const WCHAR *working_dir, HANDLE log_file, PROCESS_INFORMATION *process)
{
    STARTUPINFOW startup;
    WCHAR *mutable_command = _wcsdup(command);
    BOOL result;
    if (!mutable_command) return FALSE;
    ZeroMemory(&startup, sizeof(startup));
    ZeroMemory(process, sizeof(*process));
    startup.cb = sizeof(startup);
    if (log_file && log_file != INVALID_HANDLE_VALUE) {
        startup.dwFlags = STARTF_USESTDHANDLES;
        startup.hStdOutput = log_file;
        startup.hStdError = log_file;
        startup.hStdInput = GetStdHandle(STD_INPUT_HANDLE);
        if (startup.hStdInput == INVALID_HANDLE_VALUE) startup.hStdInput = NULL;
    }
    result = CreateProcessW(
        NULL, mutable_command, NULL, NULL, TRUE,
        CREATE_NO_WINDOW | CREATE_UNICODE_ENVIRONMENT,
        NULL, working_dir, &startup, process);
    free(mutable_command);
    return result;
}

static BOOL start_local_service(
    const WCHAR *resources,
    const WCHAR *game_path,
    USHORT port,
    const WCHAR *token,
    WCHAR *base_url,
    size_t base_url_cap)
{
    WCHAR python[PATH_CAP], service[PATH_CAP];
    WCHAR local_app_data[PATH_CAP], data_dir[PATH_CAP], log_path[PATH_CAP];
    WCHAR command[PATH_CAP * 4];
    HANDLE log_file;
    PROCESS_INFORMATION process;
    path_join(python, PATH_CAP, resources, L"python\\python.exe");
    path_join(service, PATH_CAP, resources, L"local_service.py");
    if (!file_exists(python) || !file_exists(service)) return FALSE;
    if (SHGetFolderPathW(NULL, CSIDL_LOCAL_APPDATA | CSIDL_FLAG_CREATE, NULL, SHGFP_TYPE_CURRENT, local_app_data) != S_OK)
        return FALSE;
    path_join(data_dir, PATH_CAP, local_app_data, LOCAL_DATA_DIRECTORY);
    if (!ensure_directory(data_dir)) return FALSE;
    path_join(log_path, PATH_CAP, data_dir, L"local-service.log");
    log_file = CreateFileW(log_path, FILE_APPEND_DATA, FILE_SHARE_READ | FILE_SHARE_WRITE,
        NULL, OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
    if (log_file == INVALID_HANDLE_VALUE) return FALSE;
    if (!SetHandleInformation(log_file, HANDLE_FLAG_INHERIT, HANDLE_FLAG_INHERIT)) {
        CloseHandle(log_file);
        return FALSE;
    }
    if (_snwprintf(
        command,
        sizeof(command) / sizeof(command[0]),
        L"\"%ls\" -s \"%ls\" --port %u --token %ls --data-dir \"%ls\" --credential-id %ls --game-path \"%ls\"",
        python, service, (unsigned int)port, token, data_dir, GAME_ID_W, game_path) < 0) {
        CloseHandle(log_file);
        return FALSE;
    }
    if (!start_hidden_process(command, resources, log_file, &process)) {
        if (log_file != INVALID_HANDLE_VALUE) CloseHandle(log_file);
        return FALSE;
    }
    if (log_file != INVALID_HANDLE_VALUE) CloseHandle(log_file);
    CloseHandle(process.hThread);
    g_local_service_process = process.hProcess;
    if (!wait_for_port(port, 15000)) {
        TerminateProcess(g_local_service_process, 1);
        CloseHandle(g_local_service_process);
        g_local_service_process = NULL;
        return FALSE;
    }
    _snwprintf(base_url, base_url_cap, L"http://127.0.0.1:%u", (unsigned int)port);
    return TRUE;
}

static BOOL launch_game(const WCHAR *steam_path, const WCHAR *game_path, USHORT debug_port)
{
    WCHAR steam_command[PATH_CAP * 2];
    WCHAR game_command[PATH_CAP * 2];
    WCHAR game_dir[PATH_CAP];
    PROCESS_INFORMATION process;
    if (steam_path[0] && file_exists(steam_path)) {
            if (_snwprintf(
                steam_command,
                sizeof(steam_command) / sizeof(steam_command[0]),
                L"\"%ls\" -applaunch %lu \"--remote-debugging-address=127.0.0.1\" \"--remote-debugging-port=%u\"",
                steam_path, (unsigned long)APP_ID, (unsigned int)debug_port) < 0) return FALSE;
        parent_dir(steam_path, game_dir);
        if (start_hidden_process(steam_command, game_dir, NULL, &process)) {
            CloseHandle(process.hThread);
            for (int attempt = 0; attempt < 40; attempt++) {
                if (process_running(game_path, &g_game_process)) {
                    g_stop_game_on_cleanup = TRUE;
                    CloseHandle(process.hProcess);
                    return TRUE;
                }
                Sleep(250);
            }
            CloseHandle(process.hProcess);
        }
    }
    parent_dir(game_path, game_dir);
    if (_snwprintf(
        game_command,
        sizeof(game_command) / sizeof(game_command[0]),
        L"\"%ls\" --remote-debugging-address=127.0.0.1 --remote-debugging-port=%u",
        game_path, (unsigned int)debug_port) < 0) return FALSE;
    if (!start_hidden_process(game_command, game_dir, NULL, &process)) return FALSE;
    CloseHandle(process.hThread);
    for (int attempt = 0; attempt < 40; attempt++) {
        if (process_path_matches(process.dwProcessId, game_path,
                PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_TERMINATE | SYNCHRONIZE, &g_game_process)) {
            g_stop_game_on_cleanup = TRUE;
            CloseHandle(process.hProcess);
            return TRUE;
        }
        Sleep(250);
    }
    TerminateProcess(process.hProcess, 1);
    WaitForSingleObject(process.hProcess, 3000);
    CloseHandle(process.hProcess);
    return FALSE;
}

static char *http_get_local(USHORT port, const WCHAR *path)
{
    HINTERNET connection = NULL, request = NULL;
    DWORD available = 0, read_count = 0;
    size_t length = 0, capacity = 8192;
    char *buffer = NULL;
    connection = WinHttpConnect(g_http_session, L"127.0.0.1", port, 0);
    if (!connection) goto cleanup;
    request = WinHttpOpenRequest(connection, L"GET", path, NULL, WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, 0);
    if (!request || !WinHttpSendRequest(request, WINHTTP_NO_ADDITIONAL_HEADERS, 0, NULL, 0, 0, 0)
        || !WinHttpReceiveResponse(request, NULL)) goto cleanup;
    buffer = (char *)malloc(capacity);
    if (!buffer) goto cleanup;
    while (WinHttpQueryDataAvailable(request, &available) && available) {
        if (length + available + 1 > HTTP_CAP) { free(buffer); buffer = NULL; goto cleanup; }
        if (length + available + 1 > capacity) {
            while (length + available + 1 > capacity) capacity *= 2;
            char *grown = (char *)realloc(buffer, capacity);
            if (!grown) { free(buffer); buffer = NULL; goto cleanup; }
            buffer = grown;
        }
        if (!WinHttpReadData(request, buffer + length, available, &read_count)) { free(buffer); buffer = NULL; goto cleanup; }
        length += read_count;
    }
    if (buffer) buffer[length] = '\0';
cleanup:
    if (request) WinHttpCloseHandle(request);
    if (connection) WinHttpCloseHandle(connection);
    return buffer;
}

static const char *json_skip_space(const char *cursor, const char *end)
{
    while (cursor < end && (*cursor == ' ' || *cursor == '\t' || *cursor == '\r' || *cursor == '\n')) cursor++;
    return cursor;
}

static const char *json_string(const char *cursor, const char *end, char *out, size_t cap)
{
    size_t length = 0;
    char *destination = out;
    BOOL overflow = FALSE;
    if (cursor >= end || *cursor++ != '"') return NULL;
    while (cursor < end) {
        unsigned char ch = (unsigned char)*cursor++;
        if (ch == '"') {
            if (destination) destination[overflow ? 0 : length] = '\0';
            return cursor;
        }
        if (ch == '\\') {
            if (cursor >= end) return NULL;
            ch = (unsigned char)*cursor++;
            if (ch == 'b') ch = '\b';
            else if (ch == 'f') ch = '\f';
            else if (ch == 'n') ch = '\n';
            else if (ch == 'r') ch = '\r';
            else if (ch == 't') ch = '\t';
            else if (ch == 'u') {
                unsigned int code = 0;
                if (end - cursor < 4) return NULL;
                for (int digit = 0; digit < 4; digit++) {
                    unsigned char hex = (unsigned char)*cursor++;
                    if (hex >= '0' && hex <= '9') code = code * 16 + hex - '0';
                    else if (hex >= 'a' && hex <= 'f') code = code * 16 + hex - 'a' + 10;
                    else if (hex >= 'A' && hex <= 'F') code = code * 16 + hex - 'A' + 10;
                    else return NULL;
                }
                ch = code <= 0x7f ? (unsigned char)code : '?';
            } else if (ch != '"' && ch != '\\' && ch != '/') return NULL;
        } else if (ch < 0x20) return NULL;
        if (destination && !overflow) {
            if (length + 1 >= cap) overflow = TRUE;
            else destination[length] = (char)ch;
        }
        length++;
    }
    return NULL;
}

static const char *json_value_end(const char *cursor, const char *end)
{
    char stack[64];
    size_t depth = 0;
    cursor = json_skip_space(cursor, end);
    if (cursor >= end) return NULL;
    if (*cursor == '"') return json_string(cursor, end, NULL, 0);
    if (*cursor != '{' && *cursor != '[') {
        while (cursor < end && *cursor != ',' && *cursor != '}' && *cursor != ']'
            && *cursor != ' ' && *cursor != '\t' && *cursor != '\r' && *cursor != '\n') cursor++;
        return cursor;
    }
    while (cursor < end) {
        if (*cursor == '"') {
            cursor = json_string(cursor, end, NULL, 0);
            if (!cursor) return NULL;
            continue;
        }
        if (*cursor == '{' || *cursor == '[') {
            if (depth >= sizeof(stack)) return NULL;
            stack[depth++] = *cursor == '{' ? '}' : ']';
        } else if (*cursor == '}' || *cursor == ']') {
            if (!depth || *cursor != stack[depth - 1]) return NULL;
            if (--depth == 0) return cursor + 1;
        }
        cursor++;
    }
    return NULL;
}

static const char *json_member(const char *object, const char *object_end, const char *wanted, const char **value_end)
{
    const char *cursor = json_skip_space(object, object_end);
    if (cursor >= object_end || *cursor++ != '{') return NULL;
    for (;;) {
        char key[64];
        const char *value;
        cursor = json_skip_space(cursor, object_end);
        if (cursor >= object_end || *cursor == '}') return NULL;
        cursor = json_string(cursor, object_end, key, sizeof(key));
        if (!cursor) return NULL;
        cursor = json_skip_space(cursor, object_end);
        if (cursor >= object_end || *cursor++ != ':') return NULL;
        value = json_skip_space(cursor, object_end);
        cursor = json_value_end(value, object_end);
        if (!cursor) return NULL;
        if (strcmp(key, wanted) == 0) {
            *value_end = cursor;
            return value;
        }
        cursor = json_skip_space(cursor, object_end);
        if (cursor < object_end && *cursor == ',') cursor++;
        else if (cursor >= object_end || *cursor != '}') return NULL;
    }
}

static BOOL json_string_member(
    const char *object, const char *object_end, const char *key, char *out, size_t cap)
{
    const char *value_end;
    const char *value = json_member(object, object_end, key, &value_end);
    return value && json_string(value, value_end, out, cap) == value_end;
}

static BOOL extract_websocket_path(const char *json, WCHAR *path, size_t cap)
{
    const char *end = json + strlen(json);
    const char *cursor = json_skip_space(json, end);
    const char *slash;
    char type[64], title[2048], url[8192], websocket[4096];
    char utf8_path[4096];
    size_t length;
    if (cursor >= end || *cursor++ != '[') return FALSE;
    for (;;) {
        const char *object_end;
        cursor = json_skip_space(cursor, end);
        if (cursor >= end || *cursor == ']') return FALSE;
        object_end = json_value_end(cursor, end);
        if (!object_end) return FALSE;
        type[0] = title[0] = url[0] = websocket[0] = '\0';
        if (json_string_member(cursor, object_end, "type", type, sizeof(type)) && strcmp(type, "page") == 0
            && json_string_member(cursor, object_end, "webSocketDebuggerUrl", websocket, sizeof(websocket))) {
            json_string_member(cursor, object_end, "title", title, sizeof(title));
            json_string_member(cursor, object_end, "url", url, sizeof(url));
            if ((TARGET_TITLE_HINT[0] && strstr(title, TARGET_TITLE_HINT))
                || (TARGET_URL_HINT[0] && strstr(url, TARGET_URL_HINT))) {
                slash = strstr(websocket, "/devtools/");
                if (slash) {
                    length = strlen(slash);
                    if (!length || length >= sizeof(utf8_path)) return FALSE;
                    memcpy(utf8_path, slash, length + 1);
                    return utf8_to_wide(utf8_path, path, cap);
                }
            }
        }
        cursor = json_skip_space(object_end, end);
        if (cursor < end && *cursor == ',') cursor++;
        else if (cursor >= end || *cursor != ']') return FALSE;
    }
}

static char *json_escape(const char *text)
{
    size_t input_length = strlen(text);
    size_t capacity = input_length * 2 + 64;
    size_t length = 0;
    char *result = (char *)malloc(capacity);
    if (!result) return NULL;
    for (size_t i = 0; i < input_length; i++) {
        unsigned char ch = (unsigned char)text[i];
        const char *escape = NULL;
        char unicode[7];
        if (ch == '"') escape = "\\\"";
        else if (ch == '\\') escape = "\\\\";
        else if (ch == '\b') escape = "\\b";
        else if (ch == '\f') escape = "\\f";
        else if (ch == '\n') escape = "\\n";
        else if (ch == '\r') escape = "\\r";
        else if (ch == '\t') escape = "\\t";
        else if (ch < 0x20) {
            snprintf(unicode, sizeof(unicode), "\\u%04x", ch);
            escape = unicode;
        }
        size_t add = escape ? strlen(escape) : 1;
        if (length + add + 1 > capacity) {
            capacity = (capacity + add + 1) * 2;
            char *grown = (char *)realloc(result, capacity);
            if (!grown) { free(result); return NULL; }
            result = grown;
        }
        if (escape) { memcpy(result + length, escape, add); length += add; }
        else result[length++] = (char)ch;
    }
    result[length] = '\0';
    return result;
}

static BOOL websocket_wait_for_id(HINTERNET socket_handle, int id)
{
    BYTE chunk[16384];
    char *message = NULL;
    size_t length = 0, capacity = 0;
    for (;;) {
        DWORD read_count = 0;
        WINHTTP_WEB_SOCKET_BUFFER_TYPE type;
        DWORD result = WinHttpWebSocketReceive(socket_handle, chunk, sizeof(chunk), &read_count, &type);
        if (result != NO_ERROR || type == WINHTTP_WEB_SOCKET_CLOSE_BUFFER_TYPE) { free(message); return FALSE; }
        if (length + read_count + 1 > capacity) {
            capacity = (length + read_count + 1) * 2;
            char *grown = (char *)realloc(message, capacity);
            if (!grown) { free(message); return FALSE; }
            message = grown;
        }
        memcpy(message + length, chunk, read_count);
        length += read_count;
        message[length] = '\0';
        if (type == WINHTTP_WEB_SOCKET_UTF8_MESSAGE_BUFFER_TYPE
            || type == WINHTTP_WEB_SOCKET_BINARY_MESSAGE_BUFFER_TYPE) {
            const char *message_end = message + length;
            const char *value_end;
            const char *value = json_member(message, message_end, "id", &value_end);
            BOOL matched = FALSE;
            BOOL failed = FALSE;
            if (value) {
                char *end;
                long response_id = strtol(value, &end, 10);
                if (end == value_end && response_id == id) {
                    matched = TRUE;
                    failed = json_member(message, message_end, "error", &value_end) != NULL;
                    if (!failed) {
                        const char *result = json_member(message, message_end, "result", &value_end);
                        failed = result && json_member(result, value_end, "exceptionDetails", &value) != NULL;
                    }
                }
            }
            free(message);
            message = NULL;
            length = capacity = 0;
            if (matched) return !failed;
        }
    }
}

static BOOL websocket_command(HINTERNET socket_handle, int id, const char *method, const char *params)
{
    size_t length = strlen(method) + strlen(params) + 80;
    char *command = (char *)malloc(length);
    DWORD result;
    if (!command) return FALSE;
    snprintf(command, length, "{\"id\":%d,\"method\":\"%s\",\"params\":%s}", id, method, params);
    result = WinHttpWebSocketSend(
        socket_handle,
        WINHTTP_WEB_SOCKET_UTF8_MESSAGE_BUFFER_TYPE,
        command,
        (DWORD)strlen(command));
    free(command);
    return result == NO_ERROR && websocket_wait_for_id(socket_handle, id);
}

static BOOL inject_script(USHORT port, const WCHAR *socket_path, const char *source)
{
    HINTERNET connection = NULL, request = NULL, websocket = NULL;
    char *escaped = NULL, *params = NULL;
    BOOL success = FALSE;
    connection = WinHttpConnect(g_http_session, L"127.0.0.1", port, 0);
    if (!connection) goto cleanup;
    request = WinHttpOpenRequest(connection, L"GET", socket_path, NULL, WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, 0);
    if (!request || !WinHttpSetOption(request, WINHTTP_OPTION_UPGRADE_TO_WEB_SOCKET, NULL, 0)
        || !WinHttpSendRequest(request, WINHTTP_NO_ADDITIONAL_HEADERS, 0, NULL, 0, 0, 0)
        || !WinHttpReceiveResponse(request, NULL)) goto cleanup;
    websocket = WinHttpWebSocketCompleteUpgrade(request, 0);
    if (!websocket) goto cleanup;
    WinHttpCloseHandle(request);
    request = NULL;
    escaped = json_escape(source);
    if (!escaped) goto cleanup;
    params = (char *)malloc(strlen(escaped) + 128);
    if (!params) goto cleanup;
    if (!websocket_command(websocket, 1, "Page.enable", "{}")) goto cleanup;
    snprintf(params, strlen(escaped) + 128, "{\"source\":\"%s\"}", escaped);
    if (!websocket_command(websocket, 2, "Page.addScriptToEvaluateOnNewDocument", params)) goto cleanup;
    snprintf(params, strlen(escaped) + 128,
        "{\"expression\":\"%s\",\"awaitPromise\":true,\"returnByValue\":true}", escaped);
    if (!websocket_command(websocket, 3, "Runtime.evaluate", params)) goto cleanup;
    success = TRUE;
cleanup:
    free(params);
    free(escaped);
    if (websocket) {
        WinHttpWebSocketClose(websocket, WINHTTP_WEB_SOCKET_SUCCESS_CLOSE_STATUS, NULL, 0);
        WinHttpCloseHandle(websocket);
    }
    if (request) WinHttpCloseHandle(request);
    if (connection) WinHttpCloseHandle(connection);
    return success;
}

static BOOL connect_and_inject(USHORT debug_port, const WCHAR *bundle_path, const WCHAR *local_service_url, const char *token)
{
    DWORD bundle_size = 0;
    char *bundle = read_file_utf8(bundle_path, &bundle_size);
    char local_service_url_utf8[128];
    char *source;
    size_t source_size;
    DWORD start;
    if (!bundle || !wide_to_utf8(local_service_url, local_service_url_utf8, sizeof(local_service_url_utf8))) {
        free(bundle);
        return FALSE;
    }
    source_size = strlen(bundle) + strlen(local_service_url_utf8) + strlen(token) + 160;
    source = (char *)malloc(source_size);
    if (!source) { free(bundle); return FALSE; }
    snprintf(
        source,
        source_size,
        "window.__vnRevivalLocalBridge={baseURL:\"%s\",token:\"%s\"};\n%s\n//# sourceURL=%s",
        local_service_url_utf8, token, bundle, SOURCE_LABEL);
    free(bundle);
    start = GetTickCount();
    while (GetTickCount() - start < 120000) {
        char *targets = http_get_local(debug_port, L"/json/list");
        if (targets) {
            WCHAR socket_path[4096];
            if (extract_websocket_path(targets, socket_path, sizeof(socket_path) / sizeof(socket_path[0]))
                && inject_script(debug_port, socket_path, source)) {
                free(targets);
                free(source);
                return TRUE;
            }
            free(targets);
        }
        Sleep(350);
    }
    free(source);
    return FALSE;
}

static BOOL debug_target_running(USHORT debug_port)
{
    char *targets = http_get_local(debug_port, L"/json/list");
    WCHAR socket_path[4096];
    BOOL found = FALSE;
    if (targets) {
        found = extract_websocket_path(targets, socket_path, sizeof(socket_path) / sizeof(socket_path[0]));
        free(targets);
    }
    return found;
}

static void cleanup(void)
{
    if (g_stop_game_on_cleanup && g_game_process) {
        TerminateProcess(g_game_process, 0);
        WaitForSingleObject(g_game_process, 3000);
    }
    if (g_game_process) {
        CloseHandle(g_game_process);
        g_game_process = NULL;
    }
    if (g_local_service_process) {
        TerminateProcess(g_local_service_process, 0);
        WaitForSingleObject(g_local_service_process, 3000);
        CloseHandle(g_local_service_process);
        g_local_service_process = NULL;
    }
    if (g_http_session) {
        WinHttpCloseHandle(g_http_session);
        g_http_session = NULL;
    }
    if (g_com_initialized) {
        CoUninitialize();
        g_com_initialized = FALSE;
    }
    if (g_winsock_started) {
        WSACleanup();
        g_winsock_started = FALSE;
    }
}

int WINAPI wWinMain(HINSTANCE instance, HINSTANCE previous, PWSTR command_line, int show_command)
{
    WCHAR executable[PATH_CAP], executable_dir[PATH_CAP], resources[PATH_CAP], bundle[PATH_CAP];
    WCHAR game_path[PATH_CAP], steam_path[PATH_CAP], token_wide[64], local_service_url[128];
    char token_utf8[64];
    USHORT debug_port, local_service_port;
    WSADATA winsock;
    HRESULT com_result;
    DWORD executable_length;
    (void)instance; (void)previous; (void)command_line; (void)show_command;
    if (WSAStartup(MAKEWORD(2, 2), &winsock) != 0) {
        show_error(L"Could not initialize the required Windows components.");
        return 1;
    }
    g_winsock_started = TRUE;
    com_result = CoInitializeEx(NULL, COINIT_APARTMENTTHREADED);
    if (FAILED(com_result)) {
        WSACleanup();
        g_winsock_started = FALSE;
        show_error(L"Could not initialize the required Windows components.");
        return 1;
    }
    g_com_initialized = TRUE;
    atexit(cleanup);
    executable_length = GetModuleFileNameW(NULL, executable, PATH_CAP);
    if (executable_length == 0 || executable_length >= PATH_CAP - 1) {
        show_error(L"Could not locate the launcher resources.");
        return 1;
    }
    parent_dir(executable, executable_dir);
    path_join(resources, PATH_CAP, executable_dir, L"resources");
    path_join(bundle, PATH_CAP, resources, L"translator.bundle.js");
    if (!file_exists(bundle)) {
        show_error(L"The application is incomplete: translator.bundle.js is missing.");
        return 1;
    }
    game_path[0] = steam_path[0] = L'\0';
    if (consume_reselect_marker()) {
        if (!choose_game_executable(game_path)) {
            show_error(L"The executable for " GAME_TITLE L" was not selected.");
            return 1;
        }
        save_game_path(game_path);
        find_steam_executable(steam_path);
    } else if (load_saved_game_path(game_path)) {
        find_steam_executable(steam_path);
    } else if (!find_steam_game(game_path, steam_path)) {
        if (!choose_game_executable(game_path)) {
            show_error(L"The executable for " GAME_TITLE L" was not selected.");
            return 1;
        }
        save_game_path(game_path);
        find_steam_executable(steam_path);
    }
    if (process_running(game_path, NULL)) {
        show_error(GAME_TITLE L" is already running. Close the game and launch it through " APP_TITLE L".");
        return 1;
    }
    debug_port = free_loopback_port(9317, 9399);
    local_service_port = free_loopback_port(9400, 9499);
    if (!debug_port || !local_service_port || !make_token(token_wide, 64, token_utf8, sizeof(token_utf8))) {
        show_error(L"Could not prepare the translator's local ports.");
        return 1;
    }
    if (!start_local_service(resources, game_path, local_service_port, token_wide, local_service_url, sizeof(local_service_url) / sizeof(local_service_url[0]))) {
        show_error(L"Could not start local translator service. Make sure the translator archive was fully extracted.");
        return 1;
    }
    g_http_session = WinHttpOpen(
        L"VN Revival " APP_TITLE L"/" APP_VERSION,
        WINHTTP_ACCESS_TYPE_NO_PROXY,
        WINHTTP_NO_PROXY_NAME,
        WINHTTP_NO_PROXY_BYPASS,
        0);
    if (g_http_session) WinHttpSetTimeouts(g_http_session, 2000, 2000, 2000, 2000);
    if (!g_http_session || !launch_game(steam_path, game_path, debug_port)) {
        show_error(L"Could not launch " GAME_TITLE L".");
        return 1;
    }
    if (!connect_and_inject(debug_port, bundle, local_service_url, token_utf8)) {
        show_error(L"The game started, but the translator could not connect. Close the game and try again.");
        return 1;
    }
    {
        int missing_target_checks = 0;
        while (g_game_process && WaitForSingleObject(g_game_process, 0) == WAIT_TIMEOUT) {
            Sleep(1500);
            if (debug_target_running(debug_port)) {
                missing_target_checks = 0;
            } else if (++missing_target_checks >= 3) {
                break;
            }
        }
    }
    g_stop_game_on_cleanup = FALSE;
    return 0;
}
