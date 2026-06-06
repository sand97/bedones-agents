import { NestFactory } from '@nestjs/core'
import { NestExpressApplication } from '@nestjs/platform-express'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import type { NextFunction, Request, Response } from 'express'
import * as cookieParser from 'cookie-parser'
import { join } from 'path'
import { mkdirSync, writeFileSync } from 'fs'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true })

  // Lift the default 100kb body-parser limit: catalog-migration callbacks stream
  // base64 product images (hundreds of KB each) and Coexistence history webhooks
  // can be large too. rawBody capture (webhook signature checks) is preserved.
  app.useBodyParser('json', { limit: '25mb' })
  app.useBodyParser('urlencoded', { limit: '25mb', extended: true })

  app.use(cookieParser())

  // Permissive CORS for the public MCP *transport* + OAuth discovery surface so
  // that Claude / ChatGPT clients can reach them cross-origin. These are reached
  // server-to-server with Bearer tokens (no cookie), hence the wildcard origin.
  // The interactive OAuth endpoints (/mcp/oauth/*) are deliberately EXCLUDED:
  // they are driven by our own frontend with the session cookie, so they go
  // through the credentialed app CORS below instead.
  const isPublicMcpSurface = (path: string) =>
    path === '/mcp' ||
    path === '/sse' ||
    path === '/messages' ||
    path.startsWith('/.well-known/oauth')

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (isPublicMcpSurface(req.path)) {
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
    // Liste d'origines autorisées, séparées par des virgules (frontend,
    // studio design, etc.), définies dans CORS_URLS du .env.
    origin: (process.env.CORS_URLS || 'https://moderator.bedones.local')
      .split(',')
      .map((url) => url.trim())
      .filter(Boolean),
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
