/**
 * Locked field map for BIS Manak Online Test Request
 * (https://www.manakonline.in/MANAK/testRequestGenerationForApplicant).
 *
 * Fill order: IS Number → Search → Select → remaining sample fields.
 * After Submit (manual), fill QR Code and read Sample Code.
 *
 * Never fill captcha or OTP. Never click Pay.
 * After the user types captcha, the extension may click Sign In / Generate / Submit.
 */
var QE_MANAK_FIELD_MAP = {
  kind: "QE_MANAK_TR_V1",
  homeUrl: "https://www.manakonline.in/MANAK/login",
  loginUrl: "https://www.manakonline.in/MANAK/eBISLogin",
  testRequestUrl:
    "https://www.manakonline.in/MANAK/testRequestGenerationForApplicant",
  lockedFrom: "Live testRequestGenerationForApplicant DOM 2026-09-23",
  lockedAt: "2026-09-23",
  neverClick: [
    /pay\b/i,
    /proceed to payment/i,
    /otp/i,
    /play store/i,
    /google play/i,
    /download app/i,
    /download latest apk/i,
    /download latest ios/i,
    /get the app/i,
    /install app/i,
    /bis app/i,
    /android app/i,
    /refresh captcha/i,
    /reload captcha/i,
    /new captcha/i,
    /change captcha/i,
    /refreshCaptcha/i,
    /reloadCaptcha/i,
  ],
  neverOpen: [
    /play\.google\.com/i,
    /apps\.apple\.com/i,
    /com\.bis\.app/i,
    /bis\.app/i,
  ],
  skipField: [/captcha/i, /otp/i, /security code/i, /verification code/i],
  afterCaptcha: {
    loginLabels: ["sign in", "log in", "login"],
    generateLabels: [
      "generate test request",
      "save and submit",
      "save & submit",
      "create test request",
    ],
    confirmLabels: ["confirm"],
    downloadLabels: [
      "download test request",
      "download pdf",
      "view pdf",
      "export pdf",
    ],
  },
  navigation: {
    testSamples: {
      labels: ["test samples", "test sample"],
    },
    generateQr: {
      labels: ["generate qr code", "generate qr", "generate new code"],
    },
    generateTestRequest: {
      labels: ["generate test request", "create test request"],
    },
    testRequestList: {
      labels: [
        "test requests list",
        "view test requests list",
        "view test request list",
        "test request list",
      ],
    },
    viewTestRequest: {
      labels: ["view", "viewable", "view test request"],
      selectors: ["a[href*='viewApplicantTestRequest']"],
    },
    printTestRequest: {
      labels: ["print"],
    },
    searchIs: {
      labels: ["search"],
      selectors: [
        "#searchP",
        "input#searchP",
        "input[onclick*='searchResult']",
      ],
    },
    selectIs: {
      labels: ["select"],
      selectors: [
        "#mylist li.searchList",
        "#results li.searchList",
        "#standardResultsSet li",
        "li.searchList",
      ],
    },
    checkLab: {
      labels: ["check lab availability"],
      selectors: [
        "#selectLab",
        "button#selectLab",
        "button[onclick*='checkLabAvail']",
        "input[value='Check Lab Availability']",
      ],
    },
    suggestedLab: {
      labels: ["suggested lab"],
      selectors: ["#suglab", "input#suglab", "input[name='labapi'][value='suglab']"],
    },
    confirmLab: {
      labels: ["submit"],
      selectors: [
        "#selectFinalLab",
        "button#selectFinalLab",
        "button[onclick*='selectFinalLab']",
      ],
    },
  },
  fields: [
    {
      key: "application.isSearch",
      labels: ["enter the is number", "indian standard"],
      selectors: ["#org", "input[name='strStandardNew']"],
    },
    {
      key: "sample.date_of_manufacturing",
      labels: ["date of manufacturing"],
      selectors: ["#dt_of_manufacture", "input[name='dt_of_manufacture']"],
    },
    {
      key: "sample.shelf_life",
      labels: ["shelf life"],
      selectors: ["#dt_of_expire", "input[name='dt_of_expire']"],
    },
    {
      key: "sample.batch_number",
      labels: ["batch number"],
      selectors: ["#batch_number", "input[name='batch_number']"],
    },
    {
      key: "sample.sample_quantity",
      labels: ["sample quantity", "quantity"],
      selectors: ["#quantity", "input[name='quantity']"],
    },
    {
      key: "sample.mode_of_disposal",
      labels: ["mode of disposal"],
      selectors: ["#modedisp", "select[name='modedisp']"],
    },
    {
      key: "sample.serial_number",
      labels: ["serial number"],
      selectors: ["#serial_number", "input[name='serial_number']"],
    },
    {
      key: "sample.test_required",
      labels: ["test required"],
      selectors: ["#testReq", "select[name='testReq']"],
    },
    {
      key: "sample.destination_lab",
      labels: ["lab type"],
      selectors: ["#lab_type", "select[name='lab_type']"],
    },
    {
      key: "sample.laboratory_name",
      labels: ["lab name"],
      selectors: ["#lab_name", "select[name='lab_name']"],
    },
    {
      key: "sample.sample_description",
      labels: ["sample description"],
      selectors: ["#sample_description", "textarea[name='sample_description']"],
    },
    {
      key: "sample.additional_information",
      labels: ["additional information"],
      selectors: ["#additional_info", "textarea[name='additional_info']"],
    },
    {
      key: "sample.grade_type_variety",
      labels: ["grade / type / variety"],
      selectors: ["#component_verity_val", "textarea[name='component_verity_val']"],
    },
    {
      key: "sample.declared_value",
      labels: ["declared value"],
      selectors: ["#declare_value", "input[name='declare_value']"],
    },
    {
      key: "sample.qr_code",
      labels: ["qr code"],
      selectors: ["#qrcodeNumber", "input[name='qrcodeNumber']"],
    },
    {
      key: "sample.sample_code",
      labels: ["sample code", "sample no", "test request no", "test request number"],
      selectors: [
        "#sampleCode",
        "#sample_code",
        "#samplecode",
        "input[name='sampleCode']",
        "input[name='sample_code']",
        "#testRequestNo",
        "#trNo",
        "#tr_no",
      ],
    },
    {
      key: "sample.testing_charges",
      labels: ["amount paid"],
      selectors: ["#num_amount_id", "input[name='num_amount']"],
    },
    {
      key: "sample.payment_ref",
      labels: ["cheque number", "utr"],
      selectors: ["#str_cheque_number_id", "input[name='str_cheque_number']"],
    },
    {
      key: "sample.payment_date",
      labels: ["date of transaction"],
      selectors: ["#dt_tr_date_id", "input[name='dt_tr_date']"],
    },
    {
      key: "sample.payment_mode",
      labels: ["mode of payment"],
      selectors: ["#str_mode_of_payment", "select[name='str_mode_of_payment']"],
    },
  ],
};
