import type { Result } from '@platform/fp/index.js'
import type { TransactionOptions } from '@platform/persistence/index.js'
import type { ScopeForbiddenError } from '@platform/security/index.js'
import type { InsufficientStockError } from '@modules/inventory/contracts/index.js'
import type {
  AccountsReceivablePostingError,
  CreditLimitExceededError,
  CustomerAlreadyExistsError,
  CustomerNotFoundError,
  InvalidSalesOrderStateError,
  SalesError,
  SalesOrderNotFoundError,
  ShipmentError,
} from './sales_errors.js'

export type RegisterCustomerInput = Readonly<{
  id: string
  companyId: string
  code: string
  name: string
  paymentTerms?: string
  currency?: string
  creditLimitMinorUnits: bigint
}>

export type CustomerSnapshot = Readonly<
  RegisterCustomerInput & {
    currentOutstandingMinorUnits: bigint
    isActive: boolean
  }
>

export type CustomerCreditCheckResult = Readonly<{
  customerId: string
  creditLimitMinorUnits: bigint
  currentOutstandingMinorUnits: bigint
  pendingOrdersMinorUnits: bigint
  totalExposureMinorUnits: bigint
  isApproved: boolean
  excessMinorUnits: bigint
}>

export type SettleCustomerReceivableInput = Readonly<{
  companyId: string
  customerId: string
  amountMinorUnits: bigint
  currency: string
  referenceId: string
}>

export type SalesOrderLineInput = Readonly<{
  itemId: string
  warehouseId: string
  orderedQuantity: bigint
  unitPriceMinorUnits: bigint
  currency: string
}>

export type SalesOrderLineSnapshot = Readonly<{
  itemId: string
  warehouseId: string
  orderedQuantity: bigint
  shippedQuantity: bigint
  unitPriceMinorUnits: bigint
  lineTotalMinorUnits: bigint
  currency: string
}>

export type CreateSalesOrderInput = Readonly<{
  id: string
  companyId: string
  customerId: string
  number: string
  memo?: string
  taxRateBasisPoints?: number // default 500 (5%)
  lines: readonly SalesOrderLineInput[]
}>

export type SalesOrderSnapshot = Readonly<{
  id: string
  companyId: string
  customerId: string
  number: string
  status: 'DRAFT' | 'CONFIRMED' | 'SHIPPED' | 'CLOSED' | 'VOID'
  taxRateBasisPoints: number
  netAmountMinorUnits: bigint
  taxAmountMinorUnits: bigint
  totalAmountMinorUnits: bigint
  reservationIds: readonly string[]
  lines: readonly SalesOrderLineSnapshot[]
  memo?: string
}>

export type ShipmentLineInput = Readonly<{
  itemId: string
  shippedQuantity: bigint
}>

export type CreateShipmentInput = Readonly<{
  id: string
  salesOrderId: string
  warehouseId: string
  shipmentDate: string
  arVoucherId?: string
  cogsVoucherId?: string
  lines?: readonly ShipmentLineInput[]
}>

export type ShipmentLineSnapshot = Readonly<{
  itemId: string
  shippedQuantity: bigint
  unitPriceMinorUnits: bigint
  lineTotalMinorUnits: bigint
}>

export type ShipmentSnapshot = Readonly<{
  id: string
  salesOrderId: string
  companyId: string
  customerId: string
  warehouseId: string
  shipmentDate: string
  status: 'SHIPPED'
  arJournalEntryId?: string
  cogsJournalEntryId?: string
  totalShippedAmountMinorUnits: bigint
  lines: readonly ShipmentLineSnapshot[]
  shippedAt: Date
}>

export abstract class SalesContract {
  abstract registerCustomer(
    input: RegisterCustomerInput,
    options?: TransactionOptions
  ): Promise<
    Result<CustomerSnapshot, SalesError | CustomerAlreadyExistsError | ScopeForbiddenError>
  >

  abstract getCustomer(
    id: string,
    options?: TransactionOptions
  ): Promise<Result<CustomerSnapshot, CustomerNotFoundError | ScopeForbiddenError>>

  abstract checkCustomerCredit(
    customerId: string,
    additionalOrderAmountMinorUnits?: bigint,
    options?: TransactionOptions
  ): Promise<Result<CustomerCreditCheckResult, CustomerNotFoundError | ScopeForbiddenError>>

  abstract settleCustomerReceivable(
    input: SettleCustomerReceivableInput,
    options?: TransactionOptions
  ): Promise<Result<CustomerSnapshot, CustomerNotFoundError | SalesError | ScopeForbiddenError>>

  abstract createSalesOrder(
    input: CreateSalesOrderInput,
    options?: TransactionOptions
  ): Promise<Result<SalesOrderSnapshot, SalesError | CustomerNotFoundError | ScopeForbiddenError>>

  abstract getSalesOrder(
    id: string,
    options?: TransactionOptions
  ): Promise<Result<SalesOrderSnapshot, SalesOrderNotFoundError | ScopeForbiddenError>>

  abstract confirmSalesOrder(
    id: string,
    options?: TransactionOptions
  ): Promise<
    Result<
      SalesOrderSnapshot,
      | SalesOrderNotFoundError
      | InvalidSalesOrderStateError
      | CustomerNotFoundError
      | CreditLimitExceededError
      | InsufficientStockError
      | SalesError
      | ScopeForbiddenError
    >
  >

  abstract createShipment(
    input: CreateShipmentInput,
    options?: TransactionOptions
  ): Promise<
    Result<
      ShipmentSnapshot,
      | SalesOrderNotFoundError
      | InvalidSalesOrderStateError
      | ShipmentError
      | AccountsReceivablePostingError
      | ScopeForbiddenError
    >
  >
}
