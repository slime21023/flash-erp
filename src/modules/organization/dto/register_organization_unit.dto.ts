import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator'
import type { OrganizationUnitKind } from '../contracts/organization_contract.js'

export class RegisterOrganizationUnitDto {
  @IsString()
  @IsNotEmpty()
  id!: string

  @IsString()
  @IsNotEmpty()
  code!: string

  @IsString()
  @IsNotEmpty()
  name!: string

  @IsIn(['COMPANY', 'PLANT', 'WAREHOUSE'])
  kind!: OrganizationUnitKind

  @IsOptional()
  @IsString()
  parentId?: string | null
}
