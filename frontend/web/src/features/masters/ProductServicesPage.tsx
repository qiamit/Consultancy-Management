import { useLocation } from 'react-router-dom'
import ProductServicesMasterPage from '@/features/masters/product-services/ProductServicesMasterPage'
import ProductsServicesPage from '@/features/masters/products-services/ProductsServicesPage'

/**
 * `/masters/product-services` → commercial Product & Services catalog
 * `/masters/nabl-scope` → NABL accreditation scope (legacy ProductServices form)
 */
export default function ProductServicesPage() {
  const { pathname } = useLocation()
  if (pathname.includes('/masters/product-services')) {
    return <ProductsServicesPage />
  }
  return <ProductServicesMasterPage />
}
