import { identityApiContract } from './modules/identity/contracts/identity_api_contract.js'
import { organizationApiContract } from './modules/organization/contracts/organization_api_contract.js'
import { financeApiContract } from './modules/finance/contracts/finance_api_contract.js'
import { inventoryApiContract } from './modules/inventory/contracts/inventory_api_contract.js'
import { procurementApiContract } from './modules/procurement/contracts/procurement_api_contract.js'
import { salesApiContract } from './modules/sales/contracts/sales_api_contract.js'
import { treasuryApiContract } from './modules/treasury/contracts/treasury_api_contract.js'
import { manufacturingApiContract } from './modules/manufacturing/contracts/manufacturing_api_contract.js'
import { systemApiContract } from './platform/http/system_api_contract.js'

export const apiContract = {
  identity: identityApiContract,
  organization: organizationApiContract,
  finance: financeApiContract,
  inventory: inventoryApiContract,
  procurement: procurementApiContract,
  sales: salesApiContract,
  treasury: treasuryApiContract,
  manufacturing: manufacturingApiContract,
  system: systemApiContract,
}
