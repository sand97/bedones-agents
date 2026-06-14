// Génère swagger-output/swagger.json en initialisant l'app (DB/Redis requis) puis
// en fermant immédiatement — sans app.listen() (pas de bind réseau).
import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { AppModule } from './app.module'

async function main() {
  const app = await NestFactory.create(AppModule, { abortOnError: false, logger: false })
  const config = new DocumentBuilder()
    .setTitle('Bedones Agents API')
    .setDescription('API backend pour le CRM social Bedones')
    .setVersion('0.1.0')
    .addCookieAuth('session')
    .build()
  const document = SwaggerModule.createDocument(app, config)
  const outputDir = join(process.cwd(), 'swagger-output')
  mkdirSync(outputDir, { recursive: true })
  writeFileSync(join(outputDir, 'swagger.json'), JSON.stringify(document, null, 2))
  process.stderr.write(`[swagger] OK paths=${Object.keys(document.paths || {}).length}\n`)
  await app.close()
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    process.stderr.write('ERR ' + (e?.stack || e) + '\n')
    process.exit(1)
  })
