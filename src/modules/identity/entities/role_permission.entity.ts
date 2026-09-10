import { CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm'
import { RoleEntity } from './role.entity.js'
import { PermissionEntity } from './permission.entity.js'

@Entity('role_permissions')
export class RolePermissionEntity {
  @PrimaryColumn({ name: 'role_id', type: 'varchar', length: 64 })
  roleId!: string

  @PrimaryColumn({ name: 'permission_code', type: 'varchar', length: 128 })
  permissionCode!: string

  @ManyToOne(() => RoleEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'role_id' })
  role?: RoleEntity

  @ManyToOne(() => PermissionEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'permission_code' })
  permission?: PermissionEntity

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date
}
