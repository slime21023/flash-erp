import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { OrganizationContract } from './contracts/index.js'
import { OrganizationUnitEntity } from './entities/organization_unit.entity.js'
import { TypeOrmOrganizationService } from './services/typeorm_organization_service.js'
import { OrganizationUnitsController } from './controllers/organization_units.controller.js'

@Module({
  imports: [TypeOrmModule.forFeature([OrganizationUnitEntity])],
  controllers: [OrganizationUnitsController],
  providers: [
    {
      provide: OrganizationContract,
      useClass: TypeOrmOrganizationService,
    },
  ],
  exports: [OrganizationContract],
})
export class OrganizationModule {}
