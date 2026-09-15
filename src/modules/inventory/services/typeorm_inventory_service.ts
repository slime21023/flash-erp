import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { EntityManager, Repository } from 'typeorm'
import { err, ok } from '@platform/fp/index.js'
import type { Result } from '@platform/fp/index.js'
import { type TransactionOptions, runInTransaction } from '@platform/persistence/index.js'
import { scopeMismatch } from '@platform/context/index.js'
import { ScopeForbiddenError } from '@platform/security/index.js'
import {
  InsufficientStockError,
  InventoryContract,
  InventoryMovementError,
} from '../contracts/index.js'
import type {
  InventoryAvailabilitySnapshot,
  InventoryItemInput,
  InventoryMovementInput,
  InventoryMovementSnapshot,
  InventoryStockSnapshot,
  InventoryUnitInput,
  InventoryWarehouseInput,
  StockReservationInput,
  StockReservationSnapshot,
} from '../contracts/index.js'
import { InventoryUnitEntity } from '../entities/inventory_unit.entity.js'
import { InventoryItemEntity } from '../entities/inventory_item.entity.js'
import { InventoryWarehouseEntity } from '../entities/inventory_warehouse.entity.js'
import { InventoryMovementEntity } from '../entities/inventory_movement.entity.js'
import { StockReservationEntity } from '../entities/stock_reservation.entity.js'

@Injectable()
export class TypeOrmInventoryService extends InventoryContract {
  constructor(
    @InjectRepository(InventoryUnitEntity)
    private readonly unitRepo: Repository<InventoryUnitEntity>,
    @InjectRepository(InventoryItemEntity)
    private readonly itemRepo: Repository<InventoryItemEntity>,
    @InjectRepository(InventoryWarehouseEntity)
    private readonly warehouseRepo: Repository<InventoryWarehouseEntity>,
    @InjectRepository(InventoryMovementEntity)
    private readonly movementRepo: Repository<InventoryMovementEntity>,
    @InjectRepository(StockReservationEntity)
    private readonly reservationRepo: Repository<StockReservationEntity>
  ) {
    super()
  }

  // ponytail: one PostgreSQL transaction lock per stock key; add a balance table only if throughput proves this ledger scan insufficient.
  private async lockStock(
    manager: EntityManager,
    companyId: string,
    itemId: string,
    warehouseId: string
  ): Promise<void> {
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `${companyId}:${itemId}:${warehouseId}`,
    ])
  }

  async registerUnit(
    input: InventoryUnitInput,
    options?: TransactionOptions
  ): Promise<Result<InventoryUnitInput, InventoryMovementError>> {
    const id = input.id.trim()
    const code = input.code.trim().toUpperCase()
    const name = input.name.trim()

    if (!id || !code || !name) {
      return err(new InventoryMovementError('Unit id, code, and name are required'))
    }

    const manager = options?.client ?? this.unitRepo.manager
    try {
      const entity = manager.create(InventoryUnitEntity, { id, code, name })
      await manager.save(entity)
      return ok({ id, code, name })
    } catch {
      return err(new InventoryMovementError(`Unable to register unit: ${id}`))
    }
  }

  async registerItem(
    input: InventoryItemInput,
    options?: TransactionOptions
  ): Promise<Result<InventoryItemInput, InventoryMovementError | ScopeForbiddenError>> {
    const id = input.id.trim()
    const companyId = input.companyId.trim()
    const sku = input.sku.trim().toUpperCase()
    const name = input.name.trim()
    const unitId = input.unitId.trim()

    if (!id || !companyId || !sku || !name || !unitId) {
      return err(new InventoryMovementError('Item fields are required'))
    }

    const selectedScope = scopeMismatch(companyId, options)
    if (selectedScope) return err(new ScopeForbiddenError(selectedScope, 'inventory item'))

    const manager = options?.client ?? this.itemRepo.manager
    try {
      const entity = manager.create(InventoryItemEntity, {
        id,
        companyId,
        sku,
        name,
        unitId,
        isActive: true,
      })
      await manager.save(entity)
      return ok({ id, companyId, sku, name, unitId })
    } catch {
      return err(new InventoryMovementError(`Unable to register item: ${id}`))
    }
  }

  async registerWarehouse(
    input: InventoryWarehouseInput,
    options?: TransactionOptions
  ): Promise<Result<InventoryWarehouseInput, InventoryMovementError | ScopeForbiddenError>> {
    const id = input.id.trim()
    const companyId = input.companyId.trim()
    const organizationUnitId = input.organizationUnitId.trim()
    const code = input.code.trim().toUpperCase()
    const name = input.name.trim()

    if (!id || !companyId || !organizationUnitId || !code || !name) {
      return err(new InventoryMovementError('Warehouse fields are required'))
    }

    const selectedScope = scopeMismatch(companyId, options)
    if (selectedScope) return err(new ScopeForbiddenError(selectedScope, 'warehouse'))

    const manager = options?.client ?? this.warehouseRepo.manager
    try {
      const entity = manager.create(InventoryWarehouseEntity, {
        id,
        companyId,
        organizationUnitId,
        code,
        name,
        isActive: true,
      })
      await manager.save(entity)
      return ok({ id, companyId, organizationUnitId, code, name })
    } catch {
      return err(new InventoryMovementError(`Unable to register warehouse: ${id}`))
    }
  }

  async findItem(
    companyId: string,
    itemId: string,
    options?: TransactionOptions
  ): Promise<Result<InventoryItemInput, InventoryMovementError | ScopeForbiddenError>> {
    const selectedScope = scopeMismatch(companyId, options)
    if (selectedScope) return err(new ScopeForbiddenError(selectedScope, 'inventory item'))

    const manager = options?.client ?? this.itemRepo.manager
    const item = await manager.findOne(InventoryItemEntity, { where: { id: itemId } })
    if (!item || !item.isActive || item.companyId !== companyId) {
      return err(new InventoryMovementError('Item must be active in the same company'))
    }
    return ok({
      id: item.id,
      companyId: item.companyId,
      sku: item.sku,
      name: item.name,
      unitId: item.unitId,
    })
  }

  async findWarehouse(
    companyId: string,
    warehouseId: string,
    options?: TransactionOptions
  ): Promise<Result<InventoryWarehouseInput, InventoryMovementError | ScopeForbiddenError>> {
    const selectedScope = scopeMismatch(companyId, options)
    if (selectedScope) return err(new ScopeForbiddenError(selectedScope, 'warehouse'))

    const manager = options?.client ?? this.warehouseRepo.manager
    const warehouse = await manager.findOne(InventoryWarehouseEntity, {
      where: { id: warehouseId },
    })
    if (!warehouse || !warehouse.isActive || warehouse.companyId !== companyId) {
      return err(new InventoryMovementError('Warehouse must be active in the same company'))
    }
    return ok({
      id: warehouse.id,
      companyId: warehouse.companyId,
      organizationUnitId: warehouse.organizationUnitId,
      code: warehouse.code,
      name: warehouse.name,
    })
  }

  async stock(
    companyId: string,
    itemId: string,
    warehouseId: string,
    options?: TransactionOptions
  ): Promise<Result<InventoryStockSnapshot, InventoryMovementError | ScopeForbiddenError>> {
    const manager = options?.client ?? this.movementRepo.manager
    try {
      const item = await manager.findOne(InventoryItemEntity, { where: { id: itemId } })
      const warehouse = await manager.findOne(InventoryWarehouseEntity, {
        where: { id: warehouseId },
      })
      if (
        !item ||
        !item.isActive ||
        item.companyId !== companyId ||
        !warehouse ||
        !warehouse.isActive ||
        warehouse.companyId !== companyId
      ) {
        return err(
          new InventoryMovementError('Item and warehouse must be active in the same company')
        )
      }

      const selectedScope = scopeMismatch(companyId, options)
      if (selectedScope) return err(new ScopeForbiddenError(selectedScope, 'warehouse stock'))

      const rows = await manager
        .createQueryBuilder(InventoryMovementEntity, 'm')
        .where('m.company_id = :companyId', { companyId })
        .andWhere('m.item_id = :itemId', { itemId })
        .andWhere('m.warehouse_id = :warehouseId', { warehouseId })
        .orderBy('m.occurred_at', 'ASC')
        .addOrderBy('m.id', 'ASC')
        .getMany()

      let quantity = 0n
      let value = 0n
      let currency: string | null = null

      for (const row of rows) {
        const delta = BigInt(row.quantityDelta)
        const cost = BigInt(row.unitCostMinorUnits)

        if (currency && currency !== row.currency) {
          return err(new InventoryMovementError('Stock movements cannot mix currencies'))
        }
        currency = row.currency
        quantity += delta
        value += delta * cost
      }

      if (quantity < 0n || value < 0n) {
        return err(new InventoryMovementError('Stock cannot be negative'))
      }

      return ok({
        companyId,
        itemId,
        warehouseId,
        quantity,
        averageUnitCostMinorUnits: quantity === 0n ? 0n : value / quantity,
        currency,
      })
    } catch {
      return err(new InventoryMovementError('Unable to calculate stock'))
    }
  }

  async recordMovement(
    input: InventoryMovementInput,
    options?: TransactionOptions
  ): Promise<Result<InventoryMovementSnapshot, InventoryMovementError | ScopeForbiddenError>> {
    return runInTransaction<
      InventoryMovementSnapshot,
      InventoryMovementError | ScopeForbiddenError
    >(this.movementRepo.manager, options, async (client) => {
      if (!input.id.trim() || !input.sourceType.trim() || !input.sourceId.trim()) {
        return err(new InventoryMovementError('id, sourceType, and sourceId are required'))
      }

      if (
        !/^[A-Z]{3}$/.test(input.currency) ||
        input.unitCostMinorUnits < 0n ||
        input.quantityDelta === 0n
      ) {
        return err(new InventoryMovementError('currency and unit cost are invalid'))
      }

      try {
        await this.lockStock(client, input.companyId, input.itemId, input.warehouseId)
        const before = await this.stock(input.companyId, input.itemId, input.warehouseId, {
          client,
        })
        if (before.isErr) return err(before.error)

        if (before.value.currency && before.value.currency !== input.currency) {
          return err(new InventoryMovementError('Movement currency must match stock currency'))
        }

        if (input.quantityDelta < 0n) {
          if (before.value.quantity + input.quantityDelta < 0n) {
            return err(new InventoryMovementError('Movement would make stock negative'))
          }
          if (input.unitCostMinorUnits !== before.value.averageUnitCostMinorUnits) {
            return err(new InventoryMovementError('Outbound movement must use moving average cost'))
          }
        }

        const item = await client.findOne(InventoryItemEntity, { where: { id: input.itemId } })
        const warehouse = await client.findOne(InventoryWarehouseEntity, {
          where: { id: input.warehouseId },
        })

        if (
          !item ||
          !warehouse ||
          !item.isActive ||
          !warehouse.isActive ||
          item.companyId !== input.companyId ||
          warehouse.companyId !== input.companyId
        ) {
          return err(
            new InventoryMovementError('Item and warehouse must be active in the same company')
          )
        }

        const movement = client.create(InventoryMovementEntity, {
          id: input.id,
          companyId: input.companyId,
          itemId: input.itemId,
          warehouseId: input.warehouseId,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          quantityDelta: input.quantityDelta.toString(),
          unitCostMinorUnits: input.unitCostMinorUnits.toString(),
          currency: input.currency,
          occurredAt: input.occurredAt,
        })
        await client.save(movement)

        return ok(input)
      } catch {
        return err(new InventoryMovementError(`Unable to record movement: ${input.id}`))
      }
    })
  }

  async availableStock(
    companyId: string,
    itemId: string,
    warehouseId: string,
    options?: TransactionOptions
  ): Promise<Result<InventoryAvailabilitySnapshot, InventoryMovementError | ScopeForbiddenError>> {
    const stockRes = await this.stock(companyId, itemId, warehouseId, options)
    if (stockRes.isErr) return err(stockRes.error)

    const manager = options?.client ?? this.reservationRepo.manager
    const activeReservations = await manager.find(StockReservationEntity, {
      where: { companyId, itemId, warehouseId, status: 'ACTIVE' },
    })

    const physicalQuantity = stockRes.value.quantity
    let reservedQuantity = 0n
    for (const r of activeReservations) {
      reservedQuantity += BigInt(r.quantity)
    }

    const availableQuantity =
      physicalQuantity >= reservedQuantity ? physicalQuantity - reservedQuantity : 0n

    return ok({
      companyId,
      itemId,
      warehouseId,
      physicalQuantity,
      reservedQuantity,
      availableQuantity,
    })
  }

  async reserve(
    input: StockReservationInput,
    options?: TransactionOptions
  ): Promise<
    Result<
      StockReservationSnapshot,
      InventoryMovementError | InsufficientStockError | ScopeForbiddenError
    >
  > {
    return runInTransaction<
      StockReservationSnapshot,
      InventoryMovementError | InsufficientStockError | ScopeForbiddenError
    >(this.reservationRepo.manager, options, async (client) => {
      if (input.quantity <= 0n) {
        return err(new InventoryMovementError('Reservation quantity must be positive'))
      }

      await this.lockStock(client, input.companyId, input.itemId, input.warehouseId)
      const availRes = await this.availableStock(input.companyId, input.itemId, input.warehouseId, {
        client,
      })
      if (availRes.isErr) return err(availRes.error)

      if (input.quantity > availRes.value.availableQuantity) {
        return err(
          new InsufficientStockError(input.itemId, input.quantity, availRes.value.availableQuantity)
        )
      }

      try {
        const entity = client.create(StockReservationEntity, {
          id: input.id,
          companyId: input.companyId,
          itemId: input.itemId,
          warehouseId: input.warehouseId,
          quantity: input.quantity.toString(),
          status: 'ACTIVE',
          referenceType: input.referenceType,
          referenceId: input.referenceId,
        })
        await client.save(entity)

        return ok({
          id: entity.id,
          companyId: entity.companyId,
          itemId: entity.itemId,
          warehouseId: entity.warehouseId,
          quantity: BigInt(entity.quantity),
          status: entity.status,
          referenceType: entity.referenceType,
          referenceId: entity.referenceId,
          createdAt: entity.createdAt ?? new Date(),
        })
      } catch {
        return err(new InventoryMovementError(`Unable to create reservation: ${input.id}`))
      }
    })
  }

  async releaseReservation(
    id: string,
    options?: TransactionOptions
  ): Promise<Result<void, InventoryMovementError | ScopeForbiddenError>> {
    return runInTransaction<void, InventoryMovementError | ScopeForbiddenError>(
      this.reservationRepo.manager,
      options,
      async (client) => {
        const reservation = await client.findOne(StockReservationEntity, { where: { id } })
        if (reservation) {
          await this.lockStock(
            client,
            reservation.companyId,
            reservation.itemId,
            reservation.warehouseId
          )
          const selectedScope = scopeMismatch(reservation.companyId, options)
          if (selectedScope) return err(new ScopeForbiddenError(selectedScope, 'reservation'))
        }
        if (reservation && reservation.status === 'ACTIVE') {
          reservation.status = 'RELEASED'
          await client.save(reservation)
        }
        return ok(undefined)
      }
    )
  }

  async consumeReservation(
    id: string,
    quantity: bigint,
    options?: TransactionOptions
  ): Promise<
    Result<
      StockReservationSnapshot,
      InventoryMovementError | InsufficientStockError | ScopeForbiddenError
    >
  > {
    return runInTransaction<
      StockReservationSnapshot,
      InventoryMovementError | InsufficientStockError | ScopeForbiddenError
    >(this.reservationRepo.manager, options, async (client) => {
      if (quantity <= 0n) {
        return err(new InventoryMovementError('Consumed reservation quantity must be positive'))
      }

      const reservation = await client
        .createQueryBuilder(StockReservationEntity, 'r')
        .setLock('pessimistic_write')
        .where('r.id = :id', { id })
        .getOne()
      if (!reservation) {
        return err(new InventoryMovementError(`Reservation not found: ${id}`))
      }

      const selectedScope = scopeMismatch(reservation.companyId, options)
      if (selectedScope) return err(new ScopeForbiddenError(selectedScope, 'reservation'))

      if (reservation.status !== 'ACTIVE') {
        return err(new InventoryMovementError(`Reservation is not active: ${id}`))
      }

      const currentQuantity = BigInt(reservation.quantity)
      if (quantity > currentQuantity) {
        return err(new InsufficientStockError(reservation.itemId, quantity, currentQuantity))
      }

      reservation.quantity = (currentQuantity - quantity).toString()
      reservation.status = quantity === currentQuantity ? 'FULFILLED' : 'ACTIVE'
      await client.save(reservation)

      return ok({
        id: reservation.id,
        companyId: reservation.companyId,
        itemId: reservation.itemId,
        warehouseId: reservation.warehouseId,
        quantity: BigInt(reservation.quantity),
        status: reservation.status,
        referenceType: reservation.referenceType,
        referenceId: reservation.referenceId,
        createdAt: reservation.createdAt,
      })
    })
  }
}
