import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEnterTogglesCheckbox } from '@/hooks/useEnterTogglesCheckbox'
import { useProperLabelText } from '@/hooks/useProperLabelText'
import { RoutePersistence } from '@/components/routing/RoutePersistence'
import AuthPage from '@/features/auth/AuthPage'
import ResetPasswordPage from '@/features/auth/ResetPasswordPage'
import PublicSiteLayout from '@/features/public-site/PublicSiteLayout'
import PublicHomePage from '@/features/public-site/PublicHomePage'
import {
  AiSettingsRoute,
  AuthenticatedShell,
  BisLicenseRenewalsRoute,
  BisNewApplicationsRoute,
  BisNewInclusionRoute,
  BisKnowledgeSearchRoute,
  BisProjectsRoute,
  BisSampleFailureReplyRoute,
  BisSurveillanceRoute,
  ClientsPage,
  CmsToolsRoute,
  ContactUsRoute,
  DashboardPage,
  DueSoonLicensesRoute,
  EmailToolsRoute,
  ExpiredLicensesRoute,
  HelpRoute,
  IsCodesPage,
  LaboratoriesRoute,
  BisBranchOfficesRoute,
  LabSettingsRoute,
  LicenseStopMarkingRoute,
  ModuleAccessRoute,
  OurBisLicensesRoute,
  ProductServicesPage,
  SaleCreditNoteRoute,
  SaleInvoiceRoute,
  SalePaymentReceiptRoute,
  SaleProformaInvoiceRoute,
  PurchaseBillRoute,
  PaymentMadeRoute,
  DebitNoteRoute,
  PurchaseOrderRoute,
  RefundRoute,
  SalesDebitNoteRoute,
  ExpenseRoute,
  LedgerRoute,
  InventoryRoute,
  AccountsRoute,
  JournalRoute,
  StatementsRoute,
  ReportsRoute,
  SaleQuotationRoute,
  TestParameterPage,
  UserManagementRoute,
} from '@/routes/routeElements'

export default function App() {
  useEnterTogglesCheckbox()
  useProperLabelText()
  return (
    <BrowserRouter>
      <RoutePersistence />
      <Routes>
        <Route element={<PublicSiteLayout />}>
          <Route path="/home" element={<PublicHomePage />} />
        </Route>

        <Route path="/auth" element={<AuthPage />} />
        <Route path="/auth/reset" element={<ResetPasswordPage />} />

        <Route element={<AuthenticatedShell />}>
          <Route index element={<DashboardPage />} />

          <Route path="/bis/new-applications" element={<BisNewApplicationsRoute />} />
          <Route path="/bis/new-inclusion" element={<BisNewInclusionRoute />} />
          <Route path="/bis/license-renewals" element={<BisLicenseRenewalsRoute />} />
          <Route path="/bis/stop-marking" element={<LicenseStopMarkingRoute />} />
          <Route path="/bis/surveillance" element={<BisSurveillanceRoute />} />
          <Route path="/bis/sample-failure-reply" element={<BisSampleFailureReplyRoute />} />
          <Route path="/bis/our-licenses" element={<OurBisLicensesRoute />} />
          <Route path="/bis/projects" element={<BisProjectsRoute />} />
          <Route path="/bis/expired-licenses" element={<ExpiredLicensesRoute />} />
          <Route path="/bis/due-soon" element={<DueSoonLicensesRoute />} />
          <Route path="/bis/knowledge-search" element={<BisKnowledgeSearchRoute />} />

          <Route path="/masters/clients" element={<ClientsPage />} />
          <Route path="/masters/is-codes" element={<IsCodesPage />} />
          <Route path="/masters/product-services" element={<ProductServicesPage />} />
          <Route path="/masters/test-parameter" element={<TestParameterPage />} />
          <Route path="/masters/laboratories" element={<LaboratoriesRoute />} />
          <Route path="/masters/bis-branch-offices" element={<BisBranchOfficesRoute />} />

          <Route path="/finance/sale/quotation" element={<SaleQuotationRoute />} />
          <Route path="/finance/sale/proforma-invoice" element={<SaleProformaInvoiceRoute />} />
          <Route path="/finance/sale/invoice" element={<SaleInvoiceRoute />} />
          <Route path="/finance/sale/credit-note" element={<SaleCreditNoteRoute />} />
          <Route path="/finance/sale/payment-receipt" element={<SalePaymentReceiptRoute />} />
          <Route path="/finance/purchase/bill" element={<PurchaseBillRoute />} />
          <Route path="/finance/purchase/payment" element={<PaymentMadeRoute />} />
          <Route path="/finance/purchase/debit-note" element={<DebitNoteRoute />} />
          <Route path="/finance/purchase/order" element={<PurchaseOrderRoute />} />
          <Route path="/finance/sale/refund" element={<RefundRoute />} />
          <Route path="/finance/sale/debit-note" element={<SalesDebitNoteRoute />} />
          <Route path="/finance/expense" element={<ExpenseRoute />} />
          <Route path="/finance/ledger" element={<LedgerRoute />} />
          <Route path="/finance/inventory" element={<InventoryRoute />} />
          <Route path="/finance/accounts" element={<AccountsRoute />} />
          <Route path="/finance/journal" element={<JournalRoute />} />
          <Route path="/finance/statements" element={<StatementsRoute />} />
          <Route path="/finance/reports" element={<ReportsRoute />} />

          <Route path="/tools/email" element={<EmailToolsRoute />} />
          <Route path="/tools/cms" element={<CmsToolsRoute />} />

          <Route path="/settings/lab" element={<LabSettingsRoute />} />
          <Route path="/settings/users" element={<UserManagementRoute />} />
          <Route path="/settings/module-access" element={<ModuleAccessRoute />} />
          <Route path="/settings/ai" element={<AiSettingsRoute />} />
          <Route path="/help" element={<HelpRoute />} />
          <Route path="/contact" element={<ContactUsRoute />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
