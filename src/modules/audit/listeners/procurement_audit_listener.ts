import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import {
  AccountsPayableVoucherCreatedEvent,
  GoodsReceivedEvent,
  PurchaseOrderApprovedEvent,
  PurchaseRequisitionApprovedEvent,
  VendorInvoiceMatchedEvent,
} from '@modules/procurement/contracts/index.js'
import { AuditContract } from '../contracts/index.js'
import type { AuditEntryInput } from '../contracts/index.js'

@Injectable()
export class ProcurementAuditListener {
  constructor(private readonly audit: AuditContract) {}

  private async append(input: AuditEntryInput): Promise<void> {
    const result = await this.audit.append(input)
    if (result.isErr) throw result.error
  }

  @OnEvent(GoodsReceivedEvent.EVENT_NAME, { suppressErrors: false })
  async handleGoodsReceived(event: GoodsReceivedEvent) {
    await this.append({
      action: 'GOODS_RECEIVED',
      entityType: 'GOODS_RECEIPT',
      entityId: event.receiptId,
      actorId: event.eventMetadata.actorId,
      requestId: event.eventMetadata.requestId,
      afterValue: {
        purchaseOrderId: event.purchaseOrderId,
        companyId: event.companyId,
        warehouseId: event.warehouseId,
        receivedAt: new Date(event.receivedAt).toISOString(),
      },
    })
  }

  @OnEvent(PurchaseOrderApprovedEvent.EVENT_NAME, { suppressErrors: false })
  async handlePurchaseOrderApproved(event: PurchaseOrderApprovedEvent) {
    await this.append({
      action: 'PURCHASE_ORDER_APPROVED',
      entityType: 'PURCHASE_ORDER',
      entityId: event.purchaseOrderId,
      actorId: event.eventMetadata.actorId,
      requestId: event.eventMetadata.requestId,
      afterValue: {
        companyId: event.companyId,
        supplierId: event.supplierId,
        approvedAt: new Date(event.approvedAt).toISOString(),
      },
    })
  }

  @OnEvent(PurchaseRequisitionApprovedEvent.EVENT_NAME, { suppressErrors: false })
  async handlePurchaseRequisitionApproved(event: PurchaseRequisitionApprovedEvent) {
    await this.append({
      action: 'PURCHASE_REQUISITION_APPROVED',
      entityType: 'PURCHASE_REQUISITION',
      entityId: event.requisitionId,
      actorId: event.eventMetadata.actorId,
      requestId: event.eventMetadata.requestId,
      afterValue: {
        companyId: event.companyId,
        requesterId: event.requesterId,
        approvedAt: new Date(event.approvedAt).toISOString(),
      },
    })
  }

  @OnEvent(VendorInvoiceMatchedEvent.EVENT_NAME, { suppressErrors: false })
  async handleVendorInvoiceMatched(event: VendorInvoiceMatchedEvent) {
    await this.append({
      action: 'VENDOR_INVOICE_MATCHED',
      entityType: 'VENDOR_INVOICE',
      entityId: event.invoiceId,
      actorId: event.eventMetadata.actorId,
      requestId: event.eventMetadata.requestId,
      afterValue: {
        companyId: event.companyId,
        purchaseOrderId: event.purchaseOrderId,
        matchedAt: new Date(event.matchedAt).toISOString(),
      },
    })
  }

  @OnEvent(AccountsPayableVoucherCreatedEvent.EVENT_NAME, { suppressErrors: false })
  async handleAccountsPayableVoucherCreated(event: AccountsPayableVoucherCreatedEvent) {
    await this.append({
      action: 'ACCOUNTS_PAYABLE_VOUCHER_CREATED',
      entityType: 'JOURNAL_ENTRY',
      entityId: event.journalEntryId,
      actorId: event.eventMetadata.actorId,
      requestId: event.eventMetadata.requestId,
      afterValue: {
        invoiceId: event.invoiceId,
        companyId: event.companyId,
        totalAmountMinorUnits: event.totalAmountMinorUnits.toString(),
        createdAt: new Date(event.createdAt).toISOString(),
      },
    })
  }
}
