import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') || 3000;
  const frontendUrl =
    configService.get<string>('FRONTEND_URL') || 'http://localhost:3001';

  app.setGlobalPrefix('api/v1');

  app.enableCors({
    origin: [frontendUrl, 'http://localhost:3001'],
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
      'REST API documentation for AI-Powered CRM Automation Platform (UC01 Create Lead, UC02 AI Lead Qualification, etc.)',
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
  console.log(`Application is running on: http://localhost:${port}/api/v1`);
  console.log(
    `Swagger documentation available at: http://localhost:${port}/api/docs`,
  );
}
void bootstrap();
