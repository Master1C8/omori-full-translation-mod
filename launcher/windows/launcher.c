#include <windows.h>
#include <shlobj.h>
#include <stdio.h>
#include <wchar.h>

#define PRODUCT_NAME L"__PRODUCT_NAME_C__"

static void fail(const wchar_t *message) {
    MessageBoxW(NULL, message, PRODUCT_NAME, MB_OK | MB_ICONERROR);
}

static BOOL parent_directory(wchar_t *path) {
    wchar_t *separator = wcsrchr(path, L'\\');
    if (!separator) return FALSE;
    *separator = L'\0';
    return TRUE;
}

int WINAPI wWinMain(HINSTANCE instance, HINSTANCE previous, PWSTR command_line, int show) {
    (void)instance; (void)previous; (void)command_line; (void)show;
    wchar_t root[MAX_PATH];
    if (!GetModuleFileNameW(NULL, root, MAX_PATH) || !parent_directory(root)) {
        fail(L"Could not locate the application directory.");
        return 1;
    }

    wchar_t python[MAX_PATH];
    wchar_t service[MAX_PATH];
    if (swprintf(python, MAX_PATH, L"%ls\\resources\\python\\pythonw.exe", root) < 0 ||
        swprintf(service, MAX_PATH, L"%ls\\resources\\workbench_service.py", root) < 0) {
        fail(L"Application path is too long.");
        return 1;
    }
    if (GetFileAttributesW(python) == INVALID_FILE_ATTRIBUTES ||
        GetFileAttributesW(service) == INVALID_FILE_ATTRIBUTES) {
        fail(L"Localization Workbench resources are incomplete. Reinstall the application.");
        return 1;
    }

    wchar_t local_data[MAX_PATH];
    if (FAILED(SHGetFolderPathW(NULL, CSIDL_LOCAL_APPDATA | CSIDL_FLAG_CREATE, NULL, 0, local_data))) {
        fail(L"Could not locate the application data directory.");
        return 1;
    }
    wchar_t data_dir[MAX_PATH];
    if (swprintf(data_dir, MAX_PATH, L"%ls\\VN Revival\\Localization Workbench", local_data) < 0) {
        fail(L"Application data path is too long.");
        return 1;
    }
    int create_result = SHCreateDirectoryExW(NULL, data_dir, NULL);
    if (create_result != ERROR_SUCCESS && create_result != ERROR_ALREADY_EXISTS && create_result != ERROR_FILE_EXISTS) {
        fail(L"Could not create the application data directory.");
        return 1;
    }

    wchar_t process_command[4 * MAX_PATH];
    if (swprintf(process_command, 4 * MAX_PATH, L"\"%ls\" \"%ls\" --data-dir \"%ls\"", python, service, data_dir) < 0) {
        fail(L"Application command is too long.");
        return 1;
    }
    STARTUPINFOW startup;
    PROCESS_INFORMATION process;
    ZeroMemory(&startup, sizeof(startup));
    ZeroMemory(&process, sizeof(process));
    startup.cb = sizeof(startup);
    if (!CreateProcessW(python, process_command, NULL, NULL, FALSE, CREATE_NO_WINDOW, NULL, root, &startup, &process)) {
        fail(L"Could not start Localization Workbench.");
        return 1;
    }
    CloseHandle(process.hThread);
    CloseHandle(process.hProcess);
    return 0;
}
