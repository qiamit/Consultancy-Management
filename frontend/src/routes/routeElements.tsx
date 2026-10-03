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
import ModulePlaceholderPage from '@/features/modules/ModulePlaceholderPage'
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
  return (
    <ModulePlaceholderPage
      title="BIS New Application"
      description="Port of Consultancy Pro BIS new-application workflow (checklist, print pack, Form-I)."
    />
  )
}

export function BisNewInclusionRoute() {
  return <ModulePlaceholderPage title="BIS New Inclusion" />
}

export function BisLicenseRenewalsRoute() {
  return <ModulePlaceholderPage title="BIS License Renewals" />
}

export function LicenseStopMarkingRoute() {
  return <ModulePlaceholderPage title="License in Stop Marking" />
}

export function BisSurveillanceRoute() {
  return <ModulePlaceholderPage title="BIS Surveillances" />
}

export function BisSampleFailureReplyRoute() {
  return <ModulePlaceholderPage title="BIS Sample Failure Reply" />
}

export function OurBisLicensesRoute() {
  return <ModulePlaceholderPage title="QE BIS Licenses" />
}

export function BisProjectsRoute() {
  return (
    <ModulePlaceholderPage
      title="All BIS Licenses"
      description="License registry (bis_projects) — porting from Consultancy Pro next."
    />
  )
}

export function ExpiredLicensesRoute() {
  return <ModulePlaceholderPage title="Expired Licenses" />
}

export function EmailToolsRoute() {
  return (
    <ModulePlaceholderPage
      title="Email"
      description="Outbound via Resend (@qengineering.in). Inbox sync will be wired after API gateway is live."
    />
  )
}

export function CmsToolsRoute() {
  return <ModulePlaceholderPage title="Website CMS" />
}
