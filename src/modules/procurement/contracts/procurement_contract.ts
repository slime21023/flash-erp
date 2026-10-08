import type { Result } from '@platform/fp/index.js'
import type { TransactionOptions } from '@platform/persistence/index.js'
import type { ScopeForbiddenError } from '@platform/security/index.js'
import type { ApprovalError, ApprovalPipelineSnapshot } from '@platform/workflow/index.js'
import type {
  AccountsPayablePostingError,
  InvalidPurchaseOrderStateError,
  InvalidPurchaseRequisitionStateError,
  InvalidVendorInvoiceStateError,
  MatchingToleranceExceededError,
  ProcurementError,
  PurchaseOrderNotFoundError,
  PurchaseRequisitionNotFoundError,
  SupplierAlreadyExistsError,
  SupplierNotFoundError,
  VendorInvoiceAlreadyExistsError,
  VendorInvoiceNotFoundError,
} from './procurement_errors.js'

export type RegisterSupplierInput = Readonly<{
  id: string
  companyId: string
  code: string
  name: string
}>

export type SupplierSnapshot = Readonly<RegisterSupplierInput & { isActive: boolean }>

export type PurchaseOrderLineInput = Readonly<{
  itemId: string
  orderedQuantity: bigint
  unitCostMinorUnits: bigint
  currency: string
}>

export type CreatePurchaseOrderInput = Readonly<{
  id: string
  companyId: string
  supplierId: string
  number: string
  lines: readonly PurchaseOrderLineInput[]
}>

export type PurchaseOrderSnapshot = Readonly<{
  id: string
  companyId: string
  supplierId: string
  number: string
  status: 'DRAFT' | 'APPROVED' | 'CLOSED' | 'VOID'
  lines: readonly PurchaseOrderLineInput[]
  approval: Readonly<ApprovalPipelineSnapshot & { requiredRole: string | null }> | null
}>

export type PurchaseRequisitionLineInput = Readonly<{
  itemId: string
  requestedQuantity: bigint
  estimatedCostMinorUnits: bigint
  currency: string
}>

export type CreatePurchaseRequisitionInput = Readonly<{
  id: string
  companyId: string
  requesterId: string
  number: string
  memo?: string
  lines: readonly PurchaseRequisitionLineInput[]
}>

export type PurchaseRequisitionSnapshot = Readonly<{
  id: string
  companyId: string
  requesterId: string
  number: string
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CONVERTED'
  memo?: string
  convertedPurchaseOrderId?: string
  lines: readonly PurchaseRequisitionLineInput[]
}>

export type ConvertRequisitionToPurchaseOrderInput = Readonly<{
  purchaseOrderId: string
  purchaseOrderNumber: string
  supplierId: string
}>

export type GoodsReceiptLineInput = Readonly<{
  itemId: string
  receivedQuantity: bigint
}>

export type ReceiveGoodsInput = Readonly<{
  id: string
  purchaseOrderId: string
  warehouseId: string
  receivedAt: Date
  lines?: readonly GoodsReceiptLineInput[]
}>

export type GoodsReceiptSnapshot = Readonly<{
  id: string
  purchaseOrderId: string
  warehouseId: string
  receivedAt: Date
  lines: readonly GoodsReceiptLineInput[]
}>

export type VendorInvoiceLineInput = Readonly<{
  itemId: string
  invoicedQuantity: bigint
  unitPriceMinorUnits: bigint
  lineTotalMinorUnits?: bigint
}>

export type RegisterVendorInvoiceInput = Readonly<{
  id: string
  companyId: string
  supplierId: string
  purchaseOrderId: string
  invoiceNumber: string
  invoiceDate: string
  currency: string
  taxRateBasisPoints?: number
  lines: readonly VendorInvoiceLineInput[]
}>

export type VendorInvoiceLineSnapshot = Readonly<{
  itemId: string
  invoicedQuantity: bigint
  unitPriceMinorUnits: bigint
  lineTotalMinorUnits: bigint
}>

export type VendorInvoiceSnapshot = Readonly<{
  id: string
  companyId: string
  supplierId: string
  purchaseOrderId: string
  invoiceNumber: string
  invoiceDate: string
  currency: string
  taxRateBasisPoints: number
  netAmountMinorUnits: bigint
  taxAmountMinorUnits: bigint
  totalAmountMinorUnits: bigint
  status: 'RECEIVED' | 'MATCHED' | 'POSTED' | 'DISPUTED' | 'VOID'
  matchedAt?: Date
  journalEntryId?: string
  lines: readonly VendorInvoiceLineSnapshot[]
}>

export type ThreeWayMatchToleranceOptions = Readonly<{
  quantityToleranceBasisPoints?: number
  priceToleranceBasisPoints?: number
  amountToleranceMinorUnits?: bigint
}>

export type LineMatchSnapshot = Readonly<{
  itemId: string
  poQuantity: bigint
  receivedQuantity: bigint
  invoicedQuantity: bigint
  poUnitPriceMinorUnits: bigint
  invoiceUnitPriceMinorUnits: bigint
  quantityDiscrepancy: bigint
  priceDiscrepancyMinorUnits: bigint
  isMatched: boolean
  reason?: string
}>

export type MatchResultSnapshot = Readonly<{
  invoiceId: string
  purchaseOrderId: string
  isMatched: boolean
  status: 'MATCHED' | 'DISPUTED'
  totalInvoicedMinorUnits: bigint
  totalReceivedMinorUnits: bigint
  lineMatches: readonly LineMatchSnapshot[]
  matchedAt: Date
}>

export type CreateApVoucherInput = Readonly<{
  invoiceId: string
  voucherId: string
  voucherNumber: string
  accountingDate: string
  inventoryAccountId?: string
  taxAccountId?: string
  payableAccountId?: string
  memo?: string
}>

export type AccountsPayableVoucherSnapshot = Readonly<{
  invoiceId: string
  journalEntryId: string
  journalEntryNumber: string
  companyId: string
  totalAmountMinorUnits: bigint
  currency: string
  postedAt: Date
}>

export type ApproverContext = Readonly<{
  actorId: string
  roles: readonly string[]
  comment?: string
}>

export type PurchaseOrderApproverContext = ApproverContext & Readonly<{ expectedStepId: string }>

export abstract class ProcurementContract {
  abstract registerSupplier(
    input: RegisterSupplierInput,
    options?: TransactionOptions
  ): Promise<
    Result<SupplierSnapshot, ProcurementError | SupplierAlreadyExistsError | ScopeForbiddenError>
  >

  abstract createPurchaseOrder(
    input: CreatePurchaseOrderInput,
    options?: TransactionOptions
  ): Promise<
    Result<PurchaseOrderSnapshot, ProcurementError | SupplierNotFoundError | ScopeForbiddenError>
  >

  abstract getPurchaseOrder(
    id: string,
    options?: TransactionOptions
  ): Promise<
    Result<PurchaseOrderSnapshot, PurchaseOrderNotFoundError | ApprovalError | ScopeForbiddenError>
  >

  abstract approvePurchaseOrder(
    id: string,
    approver: PurchaseOrderApproverContext,
    options?: TransactionOptions
  ): Promise<
    Result<
      PurchaseOrderSnapshot,
      | PurchaseOrderNotFoundError
      | InvalidPurchaseOrderStateError
      | ApprovalError
      | ScopeForbiddenError
    >
  >

  abstract receiveGoods(
    input: ReceiveGoodsInput,
    options?: TransactionOptions
  ): Promise<
    Result<
      GoodsReceiptSnapshot,
      | PurchaseOrderNotFoundError
      | InvalidPurchaseOrderStateError
      | ProcurementError
      | ScopeForbiddenError
    >
  >

  abstract createRequisition(
    input: CreatePurchaseRequisitionInput,
    options?: TransactionOptions
  ): Promise<Result<PurchaseRequisitionSnapshot, ProcurementError | ScopeForbiddenError>>

  abstract submitRequisition(
    id: string,
    options?: TransactionOptions
  ): Promise<
    Result<
      PurchaseRequisitionSnapshot,
      PurchaseRequisitionNotFoundError | InvalidPurchaseRequisitionStateError | ScopeForbiddenError
    >
  >

  abstract approveRequisition(
    id: string,
    approver?: ApproverContext,
    options?: TransactionOptions
  ): Promise<
    Result<
      PurchaseRequisitionSnapshot,
      | PurchaseRequisitionNotFoundError
      | InvalidPurchaseRequisitionStateError
      | ApprovalError
      | ScopeForbiddenError
    >
  >

  abstract convertRequisitionToPurchaseOrder(
    requisitionId: string,
    input: ConvertRequisitionToPurchaseOrderInput,
    options?: TransactionOptions
  ): Promise<
    Result<
      PurchaseOrderSnapshot,
      | PurchaseRequisitionNotFoundError
      | InvalidPurchaseRequisitionStateError
      | SupplierNotFoundError
      | ProcurementError
      | ScopeForbiddenError
    >
  >

  abstract registerVendorInvoice(
    input: RegisterVendorInvoiceInput,
    options?: TransactionOptions
  ): Promise<
    Result<
      VendorInvoiceSnapshot,
      | PurchaseOrderNotFoundError
      | SupplierNotFoundError
      | VendorInvoiceAlreadyExistsError
      | ProcurementError
      | ScopeForbiddenError
    >
  >

  abstract matchVendorInvoice(
    invoiceId: string,
    tolerance?: ThreeWayMatchToleranceOptions,
    options?: TransactionOptions
  ): Promise<
    Result<
      MatchResultSnapshot,
      | VendorInvoiceNotFoundError
      | PurchaseOrderNotFoundError
      | InvalidVendorInvoiceStateError
      | MatchingToleranceExceededError
      | ProcurementError
      | ScopeForbiddenError
    >
  >

  abstract createAccountsPayableVoucher(
    input: CreateApVoucherInput,
    options?: TransactionOptions
  ): Promise<
    Result<
      AccountsPayableVoucherSnapshot,
      | VendorInvoiceNotFoundError
      | InvalidVendorInvoiceStateError
      | AccountsPayablePostingError
      | ScopeForbiddenError
    >
  >
}
