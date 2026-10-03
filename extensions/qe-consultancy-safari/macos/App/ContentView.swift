import SwiftUI
import SafariServices

struct ContentView: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("QE Consultancy")
                .font(.title)
                .bold()
            Text("Safari extension for Manak Test Request, copy/paste bypass, and bulk fill.")
                .foregroundStyle(.secondary)
            Text("1. Open Safari → Settings → Extensions.")
            Text("2. Enable QE Consultancy.")
            Text("3. Allow access to all websites when Safari asks.")
            Button("Open Safari Extension Settings") {
                SFSafariApplication.showPreferencesForExtension(
                    withIdentifier: "in.qengineering.qe-consultancy.safari.extension"
                )
            }
            .keyboardShortcut(.defaultAction)
        }
        .padding(28)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}
