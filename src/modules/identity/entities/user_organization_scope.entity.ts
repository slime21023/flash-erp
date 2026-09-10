import { CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm'
import { LocalUserEntity } from './local_user.entity.js'

@Entity('user_organization_scopes')
export class UserOrganizationScopeEntity {
  @PrimaryColumn({ name: 'user_id', type: 'varchar', length: 64 })
  userId!: string

  @PrimaryColumn({ name: 'organization_unit_id', type: 'varchar', length: 64 })
  organizationUnitId!: string

  @ManyToOne(() => LocalUserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user?: LocalUserEntity

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date
}
