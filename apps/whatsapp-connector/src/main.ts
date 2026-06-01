import 'reflect-metadata'
import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import * as express from 'express'

import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  app.use(express.json({ limit: '2mb' }))
  app.use(express.urlencoded({ limit: '2mb', extended: true }))

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))

  const port = process.env.PORT || 3001
  await app.listen(port)

  console.log(`📱 WhatsApp Connector running on http://localhost:${port}`)
}

void bootstrap()
