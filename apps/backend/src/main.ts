import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import type { NextFunction, Request, Response } from 'express'
import * as cookieParser from 'cookie-parser'
import { join } from 'path'
import { mkdirSync, writeFileSync } from 'fs'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true })

  app.use(cookieParser())

  // Permissive CORS for the public MCP + OAuth discovery surface so that
  // Claude / ChatGPT clients can reach them cross-origin. Kept separate from
  // the credentialed app CORS below (these endpoints use Bearer tokens, not
  // the session cookie).
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/mcp') || req.path.startsWith('/.well-known')) {
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*')
      res.setHeader('Vary', 'Origin')
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS')
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Authorization, Content-Type, mcp-session-id, mcp-protocol-version, last-event-id',
      )
      res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id, WWW-Authenticate')
      if (req.method === 'OPTIONS') {
        res.statusCode = 204
        return res.end()
      }
    }
    next()
  })

  app.enableCors({
    origin: process.env.FRONTEND_URL || 'https://moderator.bedones.test',
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
