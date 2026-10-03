# QE Consultancy — Safari

Same merged features as the Chrome build, packaged for Safari 16.4+.

Safari cannot load an unpacked folder the way Chrome does. Build the macOS wrapper app in Xcode, then enable the extension in Safari.

## Features

- Open / fill BIS Manak Test Request from Consultancy Pro.
- IS Code search icon fetches LIMS charges, Manak marking fees, product manuals, and BSB Edge PDFs. Weak image captchas are solved inside the extension.
- Copy/paste and Command shortcuts on sites that try to block them.
- Bulk fill matching fields by name, id, placeholder, or label.

Safari does not expose Chrome’s debugger print-to-PDF API. The Test Request PDF is still captured from Manak download / view URLs.

## Install (after the helper app is built)

The wrapper app must be installed first. Safari has no **Add / Load unpacked** button.

1. Open **QE Consultancy Safari** from Applications (built from `macos-generated`).
2. Safari → **Settings → Advanced** → turn on **Show features for web developers**.
3. Safari menu → **Develop** → turn on **Allow Unsigned Extensions**.
4. Safari → **Settings → Extensions** → enable **QE Consultancy Safari Extension**.
5. Allow **All Websites** when Safari asks.

If Xcode is already installed, you can also convert this folder with:

```bash
xcrun safari-web-extension-converter \
  "/Users/amitkumar/Documents/Softwares/Consultancy Pro/extensions/qe-consultancy-safari" \
  --app-name "QE Consultancy Safari" \
  --bundle-identifier in.qengineering.qe-consultancy.safari \
  --macos-only \
  --force
```

## Daily use

1. In Consultancy Pro, fill the sample and click **Open Manak**.
2. On Manak, type **captcha only** when asked.
3. Use the toolbar popup for copy/paste toggles and bulk fill.
