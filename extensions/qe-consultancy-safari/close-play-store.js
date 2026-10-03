if (/play\.google\.com|com\.bis\.app|apps\.apple\.com/i.test(location.href)) {
  try {
    window.close();
  } catch {
    /* background tab closer handles this */
  }
}
