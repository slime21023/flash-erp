import { CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm'
import { LocalUserEntity } from './local_user.entity.js'
import { RoleEntity } from './role.entity.js'

@Entity('user_roles')
export class UserRoleEntity {
  @PrimaryColumn({ name: 'user_id', type: 'varchar', length: 64 })
  userId!: string

  @PrimaryColumn({ name: 'role_id', type: 'varchar', length: 64 })
  roleId!: string

  @ManyToOne(() => LocalUserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user?: LocalUserEntity

  @ManyToOne(() => RoleEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'role_id' })
  role?: RoleEntity

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date
}
