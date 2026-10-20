import GlobalLayout from '@/components/layout/GlobalLayout'
import DashboardPage from '@/features/dashboard/DashboardPage'
import LabSettingsPage from '@/features/settings/LabSettingsPage'
import UserManagementPage from '@/features/settings/UserManagementPage'
import ModuleAccessPage from '@/features/settings/ModuleAccessPage'
import AiSettingsPage from '@/features/settings/AiSettingsPage'
import EmailLogPage from '@/features/settings/email-log/EmailLogPage'
import HelpPage from '@/features/help/HelpPage'
import ContactUsPage from '@/features/contact/ContactUsPage'
import ClientsPage from '@/features/masters/ClientsPage'
import IsCodesPage from '@/features/masters/IsCodesPage'
import ProductServicesPage from '@/features/masters/ProductServicesPage'
import TestParameterPage from '@/features/masters/TestParameterPage'
import LaboratoriesMasterPage from '@/features/masters/laboratories/LaboratoriesMasterPage'
import BisBranchOfficesMasterPage from '@/features/masters/bis-branch-offices/BisBranchOfficesMasterPage'
import QuotationPage from '@/features/finance/sale/quotation/QuotationPage'
import ProformaInvoicePage from '@/features/finance/sale/proforma-invoice/ProformaInvoicePage'
import InvoicePage from '@/features/finance/sale/invoice/InvoicePage'
import CreditNotePage from '@/features/finance/sale/credit-note/CreditNotePage'
import PaymentReceiptPage from '@/features/finance/sale/payment-receipt/PaymentReceiptPage'
import PurchaseBillPage from '@/features/finance/purchase/bill/PurchaseBillPage'
import PaymentMadePage from '@/features/finance/purchase/payment/PaymentMadePage'
import DebitNotePage from '@/features/finance/purchase/debit-note/DebitNotePage'
import PurchaseOrderPage from '@/features/finance/purchase/order/PurchaseOrderPage'
import RefundPage from '@/features/finance/sale/refund/RefundPage'
import SalesDebitNotePage from '@/features/finance/sale/debit-note/SalesDebitNotePage'
import ExpensePage from '@/features/finance/expense/ExpensePage'
import LedgerPage from '@/features/finance/ledger/LedgerPage'
import InventoryPage from '@/features/finance/inventory/InventoryPage'
import AccountsPage from '@/features/finance/accounts/AccountsPage'
import JournalPage from '@/features/finance/journal/JournalPage'
import StatementsPage from '@/features/finance/statements/StatementsPage'
import ReportsPage from '@/features/finance/reports/ReportsPage'
import BisProjectsMasterPage from '@/features/bis/projects/BisProjectsMasterPage'
import BisLicenseLifecyclePage from '@/features/bis/renewals/BisLicenseLifecyclePage'
import { Navigate } from 'react-router-dom'
import BisSurveillanceMasterPage from '@/features/bis/surveillance/BisSurveillanceMasterPage'
import StopMarkingMasterPage from '@/features/bis/stop-marking/StopMarkingMasterPage'
import BisKnowledgeSearchPage from '@/features/bis/knowledge-search/BisKnowledgeSearchPage'
import EmailToolsPage from '@/features/tools/email/EmailToolsPage'
import CmsToolsPage from '@/features/tools/cms/CmsToolsPage'
import ClaudeConnectorPage from '@/features/tools/mcp/ClaudeConnectorPage'
import { RequireAuth } from '@/components/auth/RequireAuth'
import { RequireLaboratoryDirector } from '@/components/auth/RequireLaboratoryDirector'

/** Stable route shells — avoid remount when App re-renders after auth/session updates. */
export function AuthenticatedShell() {
  return (
    <RequireAuth>
      <GlobalLayout />
    </RequireAuth>
  )
}

export function LabSettingsRoute() {
  return (
    <RequireLaboratoryDirector>
      <LabSettingsPage />
    </RequireLaboratoryDirector>
  )
}

export function UserManagementRoute() {
  return (
    <RequireLaboratoryDirector>
      <UserManagementPage />
    </RequireLaboratoryDirector>
  )
}

export function ModuleAccessRoute() {
  return (
    <RequireLaboratoryDirector>
      <ModuleAccessPage />
    </RequireLaboratoryDirector>
  )
}

export function AiSettingsRoute() {
  return (
    <RequireLaboratoryDirector>
      <AiSettingsPage />
    </RequireLaboratoryDirector>
  )
}

export { DashboardPage, ClientsPage, IsCodesPage, ProductServicesPage, TestParameterPage }
export { HelpPage as HelpRoute, ContactUsPage as ContactUsRoute }
export {
  QuotationPage as SaleQuotationRoute,
  ProformaInvoicePage as SaleProformaInvoiceRoute,
  InvoicePage as SaleInvoiceRoute,
  CreditNotePage as SaleCreditNoteRoute,
  PaymentReceiptPage as SalePaymentReceiptRoute,
  PurchaseBillPage as PurchaseBillRoute,
  PaymentMadePage as PaymentMadeRoute,
  DebitNotePage as DebitNoteRoute,
  PurchaseOrderPage as PurchaseOrderRoute,
  RefundPage as RefundRoute,
  SalesDebitNotePage as SalesDebitNoteRoute,
  ExpensePage as ExpenseRoute,
  LedgerPage as LedgerRoute,
  InventoryPage as InventoryRoute,
  AccountsPage as AccountsRoute,
  JournalPage as JournalRoute,
  StatementsPage as StatementsRoute,
  ReportsPage as ReportsRoute,
}

export function BisNewApplicationsRoute() {
  return <BisProjectsMasterPage key="applications" listMode="applications" />
}

export function BisNewInclusionRoute() {
  return <BisProjectsMasterPage key="inclusion" listMode="inclusion" />
}

export function BisLicenseRenewalsRoute() {
  return <BisLicenseLifecyclePage />
}

export function LicenseStopMarkingRoute() {
  return <StopMarkingMasterPage />
}

export function BisSurveillanceRoute() {
  return <BisSurveillanceMasterPage />
}

export function BisSampleFailureReplyRoute() {
  // Sample failure replies are now cases in License Non-Conformity.
  return <Navigate to="/bis/stop-marking" replace />
}

export function OurBisLicensesRoute() {
  // QE-managed licences are the "Managed by QE" filter of All BIS Licenses.
  return <Navigate to="/bis/projects" replace />
}

export function BisProjectsRoute() {
  return <BisProjectsMasterPage key="all" listMode="all" />
}

export function ExpiredLicensesRoute() {
  return <BisProjectsMasterPage key="expired" listMode="expired" />
}

export function DueSoonLicensesRoute() {
  return <Navigate to="/bis/license-renewals" replace />
}

export function BisKnowledgeSearchRoute() {
  return <BisKnowledgeSearchPage />
}

export function LaboratoriesRoute() {
  return <LaboratoriesMasterPage />
}

export function BisBranchOfficesRoute() {
  return <BisBranchOfficesMasterPage />
}

export function EmailToolsRoute() {
  return <EmailToolsPage />
}

export function CmsToolsRoute() {
  return <CmsToolsPage />
}

export function ClaudeConnectorRoute() {
  return <ClaudeConnectorPage />
}

export function EmailLogRoute() {
  return (
    <RequireLaboratoryDirector>
      <EmailLogPage />
    </RequireLaboratoryDirector>
  )
}
