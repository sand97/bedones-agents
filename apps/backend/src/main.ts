import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import * as cookieParser from 'cookie-parser'
import { join } from 'path'
import { mkdirSync, writeFileSync } from 'fs'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  app.use(cookieParser())

  app.enableCors({
    origin: process.env.FRONTEND_URL || 'https://moderator.bedones.local',
    credentials: true,
  })

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('Bedones Agents API')
    .setDescription('API backend pour le CRM social Bedones')
    .setVersion('0.1.0')
    .addCookieAuth('session')
    .build()

  const document = SwaggerModule.createDocument(app, config)
  SwaggerModule.setup('/', app, document)

  // Generate swagger.json file for frontend type generation
  const outputDir = join(process.cwd(), 'swagger-output')
  mkdirSync(outputDir, { recursive: true })
  writeFileSync(join(outputDir, 'swagger.json'), JSON.stringify(document, null, 2))
  console.log(`Swagger JSON written to ${outputDir}/swagger.json`)

  const port = process.env.SERVER_PORT || 3005
  await app.listen(port)
  console.log(`Backend running on http://localhost:${port}`)
}

bootstrap()
