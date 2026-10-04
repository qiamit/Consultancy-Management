import GlobalLayout from '@/components/layout/GlobalLayout'
import DashboardPage from '@/features/dashboard/DashboardPage'
import LabSettingsPage from '@/features/settings/LabSettingsPage'
import UserManagementPage from '@/features/settings/UserManagementPage'
import ModuleAccessPage from '@/features/settings/ModuleAccessPage'
import AiSettingsPage from '@/features/settings/AiSettingsPage'
import HelpPage from '@/features/help/HelpPage'
import ContactUsPage from '@/features/contact/ContactUsPage'
import ClientsPage from '@/features/masters/ClientsPage'
import IsCodesPage from '@/features/masters/IsCodesPage'
import ProductServicesPage from '@/features/masters/ProductServicesPage'
import TestParameterPage from '@/features/masters/TestParameterPage'
import QuotationPage from '@/features/finance/sale/quotation/QuotationPage'
import ProformaInvoicePage from '@/features/finance/sale/proforma-invoice/ProformaInvoicePage'
import InvoicePage from '@/features/finance/sale/invoice/InvoicePage'
import CreditNotePage from '@/features/finance/sale/credit-note/CreditNotePage'
import PaymentReceiptPage from '@/features/finance/sale/payment-receipt/PaymentReceiptPage'
import BisProjectsMasterPage from '@/features/bis/projects/BisProjectsMasterPage'
import BisRenewalsMasterPage from '@/features/bis/renewals/BisRenewalsMasterPage'
import BisSurveillanceMasterPage from '@/features/bis/surveillance/BisSurveillanceMasterPage'
import BisSampleFailureReplyMasterPage from '@/features/bis/sample-failure-reply/BisSampleFailureReplyMasterPage'
import EmailToolsPage from '@/features/tools/email/EmailToolsPage'
import CmsToolsPage from '@/features/tools/cms/CmsToolsPage'
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
}

export function BisNewApplicationsRoute() {
  return <BisProjectsMasterPage key="applications" listMode="applications" />
}

export function BisNewInclusionRoute() {
  return <BisProjectsMasterPage key="inclusion" listMode="inclusion" />
}

export function BisLicenseRenewalsRoute() {
  return <BisRenewalsMasterPage />
}

export function LicenseStopMarkingRoute() {
  return <BisProjectsMasterPage key="stop_marking" listMode="stop_marking" />
}

export function BisSurveillanceRoute() {
  return <BisSurveillanceMasterPage />
}

export function BisSampleFailureReplyRoute() {
  return <BisSampleFailureReplyMasterPage />
}

export function OurBisLicensesRoute() {
  return <BisProjectsMasterPage key="our" listMode="our" />
}

export function BisProjectsRoute() {
  return <BisProjectsMasterPage key="all" listMode="all" />
}

export function ExpiredLicensesRoute() {
  return <BisProjectsMasterPage key="expired" listMode="expired" />
}

export function DueSoonLicensesRoute() {
  return <BisProjectsMasterPage key="due_soon" listMode="due_soon" />
}

export function EmailToolsRoute() {
  return <EmailToolsPage />
}

export function CmsToolsRoute() {
  return <CmsToolsPage />
}
