import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RabbitMQService } from './rabbitmq.service.js';
import { OutboxEvent } from './entities/outbox-event.entity.js';
import { OutboxPublisher } from './outbox-publisher.service.js';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([OutboxEvent])],
  providers: [RabbitMQService, OutboxPublisher],
  exports: [RabbitMQService],
})
export class RabbitMQModule {}
