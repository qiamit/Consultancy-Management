import SafariServices

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    func beginRequest(with context: NSExtensionContext) {
        let item = context.inputItems.first as? NSExtensionItem
        let message = item?.userInfo?[SFExtensionMessageKey]
        let response = NSExtensionItem()
        response.userInfo = [SFExtensionMessageKey: ["ok": true, "echo": message ?? ""]]
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }
}
