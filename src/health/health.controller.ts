import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
  MicroserviceHealthIndicator,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { RmqOptions, Transport } from '@nestjs/microservices';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private memory: MemoryHealthIndicator,
    private db: TypeOrmHealthIndicator,
    private microService: MicroserviceHealthIndicator,
    private configService: ConfigService,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    const rabbitMqUrl =
      this.configService.get<string>('RABBITMQ_URL') ||
      'amqp://guest:guest@localhost:5672';

    return this.health.check([
      // Kiểm tra heap memory không vượt quá 300MB
      () => this.memory.checkHeap('memory_heap', 300 * 1024 * 1024),
      // 2. Kiểm tra RSS memory không vượt quá 500MB
      () => this.memory.checkRSS('memory_rss', 500 * 1024 * 1024),
      //3. Ping kiểm tra Database PostgreSQL
      () => this.db.pingCheck('database'),
      //4.Ping kiểm tra RabbitMQ Broker
      () =>
        this.microService.pingCheck<RmqOptions>('rabbitmq', {
          transport: Transport.RMQ,
          options: {
            urls: [rabbitMqUrl],
          },
        }),
    ]);
  }
}
