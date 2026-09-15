import { err, ok } from '@platform/fp/index.js'
import type { Result } from '@platform/fp/index.js'
import {
  MatchingToleranceExceededError,
  type LineMatchSnapshot,
  type MatchResultSnapshot,
  type PurchaseOrderLineInput,
  type ThreeWayMatchToleranceOptions,
  type VendorInvoiceSnapshot,
} from '../contracts/index.js'

export function calculateTaxAndTotal(
  netAmountMinorUnits: bigint,
  taxRateBasisPoints = 500
): { taxAmountMinorUnits: bigint; totalAmountMinorUnits: bigint } {
  const bps = BigInt(taxRateBasisPoints)
  // Half-up rounding for tax calculation on basis points
  const taxAmountMinorUnits = (netAmountMinorUnits * bps + 5000n) / 10000n
  const totalAmountMinorUnits = netAmountMinorUnits + taxAmountMinorUnits
  return { taxAmountMinorUnits, totalAmountMinorUnits }
}

export class ThreeWayMatcher {
  static match(
    poLines: readonly PurchaseOrderLineInput[],
    receiptLines: readonly { itemId: string; receivedQuantity: bigint }[],
    invoice: VendorInvoiceSnapshot,
    tolerance: ThreeWayMatchToleranceOptions = {},
    previouslyInvoicedByItem: ReadonlyMap<string, bigint> = new Map()
  ): Result<MatchResultSnapshot, MatchingToleranceExceededError> {
    const qtyTolBps = BigInt(tolerance.quantityToleranceBasisPoints ?? 0)
    const priceTolBps = BigInt(tolerance.priceToleranceBasisPoints ?? 0)
    const amountTolMinor = tolerance.amountToleranceMinorUnits ?? 0n

    // Aggregate received quantities by item ID
    const receivedByItem = new Map<string, bigint>()
    for (const line of receiptLines) {
      const current = receivedByItem.get(line.itemId) ?? 0n
      receivedByItem.set(line.itemId, current + line.receivedQuantity)
    }

    const poLinesByItem = new Map<string, PurchaseOrderLineInput>()
    for (const line of poLines) {
      poLinesByItem.set(line.itemId, line)
    }

    const lineMatches: LineMatchSnapshot[] = []
    let totalReceivedMinorUnits = 0n

    for (const invLine of invoice.lines) {
      const poLine = poLinesByItem.get(invLine.itemId)
      if (!poLine) {
        return err(
          new MatchingToleranceExceededError({
            invoiceId: invoice.id,
            itemId: invLine.itemId,
            field: 'ITEM_MISMATCH',
            expected: 'Item in PO',
            actual: invLine.itemId,
            tolerance: '0',
            message: `Item ${invLine.itemId} was not found on Purchase Order ${invoice.purchaseOrderId}`,
          })
        )
      }

      const receivedQty = receivedByItem.get(invLine.itemId) ?? 0n
      const previouslyInvoicedQty = previouslyInvoicedByItem.get(invLine.itemId) ?? 0n
      const availableReceivedQty = receivedQty - previouslyInvoicedQty
      if (availableReceivedQty < 0n) {
        return err(
          new MatchingToleranceExceededError({
            invoiceId: invoice.id,
            itemId: invLine.itemId,
            field: 'QUANTITY',
            expected: '0',
            actual: previouslyInvoicedQty.toString(),
            tolerance: '0',
            message: `Previously invoiced quantity exceeds received quantity for item ${invLine.itemId}`,
          })
        )
      }
      totalReceivedMinorUnits += receivedQty * poLine.unitCostMinorUnits

      // 1. Quantity verification with tolerance
      const maxAllowedQty =
        qtyTolBps > 0n
          ? availableReceivedQty + (availableReceivedQty * qtyTolBps) / 10000n
          : availableReceivedQty

      if (invLine.invoicedQuantity > maxAllowedQty) {
        return err(
          new MatchingToleranceExceededError({
            invoiceId: invoice.id,
            itemId: invLine.itemId,
            field: 'QUANTITY',
            expected: availableReceivedQty.toString(),
            actual: invLine.invoicedQuantity.toString(),
            tolerance: `${tolerance.quantityToleranceBasisPoints ?? 0} bps`,
            message: `Invoiced quantity ${invLine.invoicedQuantity} exceeds unbilled received quantity ${availableReceivedQty} (allowed up to ${maxAllowedQty})`,
          })
        )
      }

      // 2. Unit price verification with tolerance
      const maxAllowedPrice =
        priceTolBps > 0n
          ? poLine.unitCostMinorUnits + (poLine.unitCostMinorUnits * priceTolBps) / 10000n
          : poLine.unitCostMinorUnits

      if (invLine.unitPriceMinorUnits > maxAllowedPrice) {
        return err(
          new MatchingToleranceExceededError({
            invoiceId: invoice.id,
            itemId: invLine.itemId,
            field: 'UNIT_PRICE',
            expected: poLine.unitCostMinorUnits.toString(),
            actual: invLine.unitPriceMinorUnits.toString(),
            tolerance: `${tolerance.priceToleranceBasisPoints ?? 0} bps`,
            message: `Invoiced unit price ${invLine.unitPriceMinorUnits} exceeds PO unit price ${poLine.unitCostMinorUnits} (allowed up to ${maxAllowedPrice})`,
          })
        )
      }

      // 3. Line total check
      const expectedLineTotal = invLine.invoicedQuantity * invLine.unitPriceMinorUnits
      if (invLine.lineTotalMinorUnits !== expectedLineTotal) {
        return err(
          new MatchingToleranceExceededError({
            invoiceId: invoice.id,
            itemId: invLine.itemId,
            field: 'TOTAL_AMOUNT',
            expected: expectedLineTotal.toString(),
            actual: invLine.lineTotalMinorUnits.toString(),
            tolerance: '0',
            message: `Line total mismatch for item ${invLine.itemId}: expected ${expectedLineTotal}, got ${invLine.lineTotalMinorUnits}`,
          })
        )
      }

      const qtyDiff = invLine.invoicedQuantity - availableReceivedQty
      const priceDiff = invLine.unitPriceMinorUnits - poLine.unitCostMinorUnits

      lineMatches.push({
        itemId: invLine.itemId,
        poQuantity: poLine.orderedQuantity,
        receivedQuantity: availableReceivedQty,
        invoicedQuantity: invLine.invoicedQuantity,
        poUnitPriceMinorUnits: poLine.unitCostMinorUnits,
        invoiceUnitPriceMinorUnits: invLine.unitPriceMinorUnits,
        quantityDiscrepancy: qtyDiff,
        priceDiscrepancyMinorUnits: priceDiff,
        isMatched: true,
      })
    }

    // 4. Net & Total Amount check
    const calculatedNetAmount = invoice.lines.reduce((sum, l) => sum + l.lineTotalMinorUnits, 0n)
    if (invoice.netAmountMinorUnits !== calculatedNetAmount) {
      return err(
        new MatchingToleranceExceededError({
          invoiceId: invoice.id,
          field: 'TOTAL_AMOUNT',
          expected: calculatedNetAmount.toString(),
          actual: invoice.netAmountMinorUnits.toString(),
          tolerance: '0',
          message: `Invoice net amount ${invoice.netAmountMinorUnits} does not equal sum of lines ${calculatedNetAmount}`,
        })
      )
    }

    const { taxAmountMinorUnits: expectedTax, totalAmountMinorUnits: expectedTotal } =
      calculateTaxAndTotal(calculatedNetAmount, invoice.taxRateBasisPoints)

    const totalDiscrepancy =
      invoice.totalAmountMinorUnits >= expectedTotal
        ? invoice.totalAmountMinorUnits - expectedTotal
        : expectedTotal - invoice.totalAmountMinorUnits

    if (totalDiscrepancy > amountTolMinor) {
      return err(
        new MatchingToleranceExceededError({
          invoiceId: invoice.id,
          field: 'TOTAL_AMOUNT',
          expected: expectedTotal.toString(),
          actual: invoice.totalAmountMinorUnits.toString(),
          tolerance: amountTolMinor.toString(),
          message: `Invoice total amount ${invoice.totalAmountMinorUnits} exceeds tolerance compared to expected ${expectedTotal} (tax: ${expectedTax})`,
        })
      )
    }

    return ok({
      invoiceId: invoice.id,
      purchaseOrderId: invoice.purchaseOrderId,
      isMatched: true,
      status: 'MATCHED',
      totalInvoicedMinorUnits: invoice.totalAmountMinorUnits,
      totalReceivedMinorUnits,
      lineMatches: Object.freeze(lineMatches),
      matchedAt: new Date(),
    })
  }
}
