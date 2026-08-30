import Foundation

struct DebugTarget: Decodable {
    let type: String?
    let title: String?
    let url: String?
    let webSocketDebuggerUrl: String?
}

enum ControllerError: LocalizedError {
    case usage
    case scriptMissing(String)
    case noTarget
    case invalidResponse
    case protocolError(String)

    var errorDescription: String? {
        switch self {
        case .usage: return "Usage: VNRevivalTranslatorController <port> <translator.js> [local-service-url local-service-token]"
        case .scriptMissing(let path): return "Translator script not found: \(path)"
        case .noTarget: return "The game did not expose a matching debugging target in time"
        case .invalidResponse: return "Invalid response from Electron debugging endpoint"
        case .protocolError(let message): return "Electron rejected the translator: \(message)"
        }
    }
}

@main
struct VNRevivalTranslatorController {
    static let environment = ProcessInfo.processInfo.environment
    static let productName = environment["VNREVIVAL_PRODUCT_NAME"] ?? "VN Revival Translator"
    static let targetTitleHint = environment["VNREVIVAL_TARGET_TITLE_HINT"] ?? ""
    static let targetURLHint = environment["VNREVIVAL_TARGET_URL_HINT"] ?? ""
    static let sourceLabel = environment["VNREVIVAL_SOURCE_LABEL"] ?? "vnrevival-translator.bundle.js"

    static func main() async {
        do {
            try await run()
        } catch {
            FileHandle.standardError.write(Data(("\(productName): \(error.localizedDescription)\n").utf8))
            exit(1)
        }
    }

    static func run() async throws {
        guard CommandLine.arguments.count == 3 || CommandLine.arguments.count == 5,
              let port = Int(CommandLine.arguments[1]),
              (1...65535).contains(port) else { throw ControllerError.usage }

        let scriptPath = CommandLine.arguments[2]
        guard FileManager.default.fileExists(atPath: scriptPath) else {
            throw ControllerError.scriptMissing(scriptPath)
        }
        var bootstrap = "window.__vnRevivalLocalBridge = null;\n"
        if CommandLine.arguments.count == 5 {
            let bridge: [String: String] = [
                "baseURL": CommandLine.arguments[3],
                "token": CommandLine.arguments[4]
            ]
            let data = try JSONSerialization.data(withJSONObject: bridge)
            guard let json = String(data: data, encoding: .utf8) else {
                throw ControllerError.invalidResponse
            }
            bootstrap = "window.__vnRevivalLocalBridge = \(json);\n"
        }
        let source = bootstrap
            + (try String(contentsOfFile: scriptPath, encoding: .utf8))
            + "\n//# sourceURL=\(sourceLabel)"

        let deadline = Date().addingTimeInterval(120)
        var lastConnectionError: Error?
        while Date() < deadline {
            if let targets = try? await fetchTargets(port: port) {
                let selected = targets.first(where: { target in
                    guard target.type == "page" else { return false }
                    let titleMatches = !targetTitleHint.isEmpty
                        && (target.title?.localizedCaseInsensitiveContains(targetTitleHint) ?? false)
                    let urlMatches = !targetURLHint.isEmpty
                        && (target.url?.localizedCaseInsensitiveContains(targetURLHint) ?? false)
                    return titleMatches || urlMatches
                })
                if let socketString = selected?.webSocketDebuggerUrl,
                   let socketURL = validatedSocketURL(socketString, port: port) {
                    do {
                        try await inject(source: source, socketURL: socketURL)
                        print("\(productName) injected")
                        return
                    } catch {
                        lastConnectionError = error
                    }
                }
            }
            try await Task.sleep(nanoseconds: 350_000_000)
        }

        if let lastConnectionError { throw lastConnectionError }
        throw ControllerError.noTarget
    }

    static func inject(source: String, socketURL: URL) async throws {
        let session = URLSession(configuration: .ephemeral)
        let socket = session.webSocketTask(with: socketURL)
        socket.resume()
        defer { socket.cancel(with: .normalClosure, reason: nil) }

        _ = try await withTimeout { try await sendCommand(socket, id: 1, method: "Page.enable", params: [:]) }
        _ = try await withTimeout { try await sendCommand(socket, id: 2, method: "Page.addScriptToEvaluateOnNewDocument", params: ["source": source]) }
        let response = try await withTimeout { try await sendCommand(socket, id: 3, method: "Runtime.evaluate", params: [
            "expression": source,
            "awaitPromise": true,
            "returnByValue": true
        ]) }
        if let exceptionDetails = response["exceptionDetails"] as? [String: Any] {
            let text = exceptionDetails["text"] as? String ?? "JavaScript evaluation failed"
            throw ControllerError.protocolError(text)
        }
        if let result = response["result"] as? [String: Any],
           let inner = result["result"] as? [String: Any],
           let exception = inner["description"] as? String,
            inner["subtype"] as? String == "error" {
            throw ControllerError.protocolError(exception)
        }
    }

    static func withTimeout<T>(_ operation: @escaping @Sendable () async throws -> T) async throws -> T {
        try await withThrowingTaskGroup(of: T.self) { group in
            group.addTask { try await operation() }
            group.addTask {
                try await Task.sleep(nanoseconds: 15_000_000_000)
                throw ControllerError.protocolError("Timed out waiting for Electron")
            }
            guard let result = try await group.next() else { throw ControllerError.invalidResponse }
            group.cancelAll()
            return result
        }
    }

    static func validatedSocketURL(_ value: String, port: Int) -> URL? {
        guard let url = URL(string: value),
              url.scheme == "ws",
              url.host == "127.0.0.1" || url.host == "localhost",
              url.port == port,
              url.user == nil,
              url.password == nil else { return nil }
        return url
    }

    static func fetchTargets(port: Int) async throws -> [DebugTarget] {
        guard let url = URL(string: "http://127.0.0.1:\(port)/json/list") else {
            throw ControllerError.invalidResponse
        }
        let (data, response) = try await URLSession.shared.data(from: url)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw ControllerError.invalidResponse
        }
        return try JSONDecoder().decode([DebugTarget].self, from: data)
    }

    static func sendCommand(
        _ socket: URLSessionWebSocketTask,
        id: Int,
        method: String,
        params: [String: Any]
    ) async throws -> [String: Any] {
        let payload: [String: Any] = ["id": id, "method": method, "params": params]
        let data = try JSONSerialization.data(withJSONObject: payload)
        guard let text = String(data: data, encoding: .utf8) else { throw ControllerError.invalidResponse }
        try await socket.send(.string(text))

        while true {
            let message = try await socket.receive()
            let responseData: Data
            switch message {
            case .string(let value): responseData = Data(value.utf8)
            case .data(let value): responseData = value
            @unknown default: continue
            }
            guard let object = try JSONSerialization.jsonObject(with: responseData) as? [String: Any] else { continue }
            guard object["id"] as? Int == id else { continue }
            if let error = object["error"] as? [String: Any] {
                throw ControllerError.protocolError(error["message"] as? String ?? "unknown CDP error")
            }
            return object
        }
    }
}
