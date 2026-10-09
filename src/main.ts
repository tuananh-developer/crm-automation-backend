import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

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

  const config = new DocumentBuilder()
    .setTitle('CRM Automation Backend API')
    .setDescription('API documentation for CRM Automation Backend')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth',
    )
    .addTag('Health', 'Health check endpoints')
    .addTag('Leads', 'Lead management endpoints')
    .addTag('Lead Sources', 'Lead source management endpoints')
    .addTag('Lead Intelligence', 'Lead qualification and enrichment endpoints')
    .addTag('Follow-ups', 'Follow-up automation endpoints')
    .addTag('Customers', 'Customer management endpoints')
    .addTag('Segments', 'Customer segmentation endpoints')
    .addTag('Review Tasks', 'Human review task endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(port);
}
void bootstrap();
