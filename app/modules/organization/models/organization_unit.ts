import { BaseModel, column } from '@adonisjs/lucid/orm'
import type { OrganizationUnitKind } from '#modules/organization/contracts/index'
import { DateTime } from 'luxon'

export default class OrganizationUnit extends BaseModel {
  static table = 'organization_units'

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare code: string

  @column()
  declare name: string

  @column()
  declare kind: OrganizationUnitKind

  @column()
  declare parentId: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
