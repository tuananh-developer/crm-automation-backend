import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { beforeEach, describe, it } from 'node:test';

void describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  void it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
