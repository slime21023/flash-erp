import { BaseModel, column } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'
import type { NormalBalance } from '#modules/finance/contracts/index'

export default class Account extends BaseModel {
  static table = 'accounts'
  @column({ isPrimary: true }) declare id: string
  @column() declare companyId: string
  @column() declare code: string
  @column() declare name: string
  @column() declare normalBalance: NormalBalance
  @column() declare isActive: boolean
  @column.dateTime({ autoCreate: true }) declare createdAt: DateTime
  @column.dateTime({ autoCreate: true, autoUpdate: true }) declare updatedAt: DateTime
}
