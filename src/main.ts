import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') || 3000;
  const frontendUrl =
    configService.get<string>('FRONTEND_URL') || 'http://localhost:3001';

  app.setGlobalPrefix('api/v1');

  const isProd = configService.get<string>('NODE_ENV') === 'production';
  const corsOrigins = isProd
    ? [frontendUrl]
    : [
        frontendUrl,
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:5678',
      ];

  app.enableCors({
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('CRM Automation Backend API')
    .setDescription(
      'REST API documentation for AI-Powered CRM Automation Platform',
    )
    .setVersion('1.0')
    .addTag('Leads', 'Lead management and lifecycle')
    .addTag('Lead Sources', 'Lead acquisition sources')
    .addTag('Lead Intelligence', 'AI-powered lead qualification & scoring')
    .addTag('Health', 'Service health check')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(port, '0.0.0.0');
  logger.log(`Application is running on: http://localhost:${port}/api/v1`);
  logger.log(
    `Swagger documentation available at: http://localhost:${port}/api/docs`,
  );
}
void bootstrap();
