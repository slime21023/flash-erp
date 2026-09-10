import { DomainError } from '@platform/fp/index.js'

export class ManufacturingError extends DomainError {
  readonly code: string = 'MANUFACTURING_ERROR'
  constructor(message: string) {
    super(message)
  }
}

export class BomAlreadyExistsError extends DomainError {
  readonly code = 'BOM_ALREADY_EXISTS'
  constructor(readonly codeString: string) {
    super(`BOM already exists with code: ${codeString}`)
  }
}

export class BomNotFoundError extends DomainError {
  readonly code = 'BOM_NOT_FOUND'
  constructor(readonly bomId: string) {
    super(`BOM not found: ${bomId}`)
  }
}

export class CyclicBomDependencyError extends DomainError {
  readonly code = 'CYCLIC_BOM_DEPENDENCY'
  constructor(
    readonly parentItemId: string,
    readonly componentItemId: string
  ) {
    super(
      `Cyclic dependency detected: component item ${componentItemId} cannot be part of parent item ${parentItemId}`
    )
  }
}

export class WorkOrderNotFoundError extends DomainError {
  readonly code = 'WORK_ORDER_NOT_FOUND'
  constructor(readonly workOrderId: string) {
    super(`Work order not found: ${workOrderId}`)
  }
}

export class InvalidWorkOrderStateError extends DomainError {
  readonly code = 'INVALID_WORK_ORDER_STATE'
  constructor(
    readonly currentStatus: string,
    readonly action: string
  ) {
    super(`Cannot perform ${action} on work order in status: ${currentStatus}`)
  }
}

export class MaterialIssueQuantityExceededError extends DomainError {
  readonly code = 'MATERIAL_ISSUE_QUANTITY_EXCEEDED'
  constructor(
    readonly itemId: string,
    readonly requestedQuantity: bigint,
    readonly plannedQuantity: bigint
  ) {
    super(
      `Issue quantity ${requestedQuantity} exceeds planned quantity ${plannedQuantity} for item ${itemId}`
    )
  }
}
