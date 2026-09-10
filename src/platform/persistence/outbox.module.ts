import { Global, Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { OutboxEventEntity } from './outbox_event.entity.js'
import { OutboxDispatcher, OutboxService } from './outbox.js'

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([OutboxEventEntity])],
  providers: [OutboxService, OutboxDispatcher],
  exports: [OutboxService],
})
export class OutboxModule {}
