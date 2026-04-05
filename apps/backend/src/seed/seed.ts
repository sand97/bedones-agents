import 'dotenv/config'
import { PrismaClient } from '../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import * as bcrypt from 'bcrypt'

const IV_LENGTH = 12

async function encryptToken(text: string): Promise<string> {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET is required for encryption')

  const encoder = new TextEncoder()
  const keyMaterial = encoder.encode(secret.padEnd(32, '0').slice(0, 32))
  const key = await crypto.subtle.importKey('raw', keyMaterial, { name: 'AES-GCM' }, false, [
    'encrypt',
  ])

  const data = encoder.encode(text)
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data)

  const combined = new Uint8Array(iv.length + encrypted.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(encrypted), iv.length)

  return Array.from(combined)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Seed script — creates:
 * - A test user with email/password (for Meta reviewers)
 * - An organisation linked to that user
 * - A WhatsApp SocialAccount with the seed token
 */
async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
  const prisma = new PrismaClient({ adapter })

  try {
    console.log('🌱 Seeding database...')

    const email = 'test@bedones.com'
    const password = 'test1234'
    const passwordHash = await bcrypt.hash(password, 10)

    // Upsert test user
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        name: 'Testeur Bedones',
        passwordHash,
        authType: 'PASSWORD',
      },
    })

    console.log(`✓ User: ${user.email} (${user.id})`)

    // Upsert organisation
    let org = await prisma.organisation.findFirst({
      where: { members: { some: { userId: user.id } } },
    })

    if (!org) {
      org = await prisma.organisation.create({
        data: {
          name: 'Bedones Test',
          members: {
            create: {
              userId: user.id,
              role: 'OWNER',
            },
          },
        },
      })
      console.log(`✓ Organisation: ${org.name} (${org.id})`)
    } else {
      console.log(`✓ Organisation already exists: ${org.name} (${org.id})`)
    }

    // Upsert WhatsApp SocialAccount
    const whatsappPhoneId = process.env.SEED_WHATSAPP_PHONE_NUMBER_ID
    const whatsappToken = process.env.SEED_WHATSAPP_TOKEN

    if (whatsappPhoneId && whatsappToken) {
      const encryptedToken = await encryptToken(whatsappToken)

      await prisma.socialAccount.upsert({
        where: {
          provider_providerAccountId: {
            provider: 'WHATSAPP',
            providerAccountId: whatsappPhoneId,
          },
        },
        update: {
          accessToken: encryptedToken,
        },
        create: {
          organisationId: org.id,
          provider: 'WHATSAPP',
          providerAccountId: whatsappPhoneId,
          pageName: 'WhatsApp Test',
          accessToken: encryptedToken,
          scopes: ['whatsapp_business_management', 'whatsapp_business_messaging'],
        },
      })
      console.log(`✓ WhatsApp SocialAccount: ${whatsappPhoneId}`)
    } else {
      console.log('⚠ Skipping WhatsApp seed (missing SEED_WHATSAPP_* env vars)')
    }

    console.log('\n✅ Seed completed!')
    console.log(`\n📧 Login: ${email}`)
    console.log(`🔑 Password: ${password}`)
  } catch (error) {
    console.error('❌ Seed failed:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
