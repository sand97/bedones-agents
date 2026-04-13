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
 * - A Catalog linked to the WhatsApp account (if SEED_WHATSAPP_CATALOG_ID is set)
 */
async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
  const prisma = new PrismaClient({ adapter })

  try {
    console.log('🌱 Seeding database...')

    const email = 'test@bedones.com'
    const password = 'BAAAAAtzc2gtZWQyNTUxOQAAACB'
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
    const whatsappWabaId = process.env.SEED_WHATSAPP_WABA_ID

    let whatsappAccount: { id: string } | null = null

    if (whatsappPhoneId && whatsappToken) {
      const encryptedToken = await encryptToken(whatsappToken)

      // Fetch phone number info from Meta API
      let displayName = 'WhatsApp Test'
      let displayPhone: string | null = null
      let profilePictureUrl: string | null = null

      try {
        const phoneInfoRes = await fetch(
          `https://graph.facebook.com/v22.0/${whatsappPhoneId}?fields=display_phone_number,verified_name`,
          { headers: { Authorization: `Bearer ${whatsappToken}` } },
        )
        if (phoneInfoRes.ok) {
          const phoneInfo = (await phoneInfoRes.json()) as {
            display_phone_number?: string
            verified_name?: string
          }
          displayName = phoneInfo.verified_name || phoneInfo.display_phone_number || displayName
          displayPhone = phoneInfo.display_phone_number || null
          console.log(`  → Phone info: ${displayName} (${displayPhone || 'no number'})`)
        }
      } catch (err) {
        console.warn('  ⚠ Could not fetch phone info from Meta API:', err)
      }

      try {
        const profileRes = await fetch(
          `https://graph.facebook.com/v22.0/${whatsappPhoneId}/whatsapp_business_profile?fields=profile_picture_url`,
          { headers: { Authorization: `Bearer ${whatsappToken}` } },
        )
        if (profileRes.ok) {
          const profileData = (await profileRes.json()) as {
            data?: Array<{ profile_picture_url?: string }>
          }
          profilePictureUrl = profileData.data?.[0]?.profile_picture_url || null
          if (profilePictureUrl) console.log(`  → Profile picture found`)
        }
      } catch (err) {
        console.warn('  ⚠ Could not fetch profile picture from Meta API:', err)
      }

      whatsappAccount = await prisma.socialAccount.upsert({
        where: {
          provider_providerAccountId: {
            provider: 'WHATSAPP',
            providerAccountId: whatsappPhoneId,
          },
        },
        update: {
          accessToken: encryptedToken,
          wabaId: whatsappWabaId || null,
          pageName: displayName,
          username: displayPhone,
          profilePictureUrl,
        },
        create: {
          organisationId: org.id,
          provider: 'WHATSAPP',
          providerAccountId: whatsappPhoneId,
          wabaId: whatsappWabaId || null,
          pageName: displayName,
          username: displayPhone,
          profilePictureUrl,
          accessToken: encryptedToken,
          scopes: ['whatsapp_business_management', 'whatsapp_business_messaging'],
        },
      })
      console.log(
        `✓ WhatsApp SocialAccount: ${displayName} (${whatsappPhoneId}, WABA: ${whatsappWabaId || 'N/A'})`,
      )
    } else {
      console.log('⚠ Skipping WhatsApp seed (missing SEED_WHATSAPP_* env vars)')
    }

    // Upsert Catalog linked to WhatsApp account
    const catalogProviderId = process.env.SEED_WHATSAPP_CATALOG_ID

    if (catalogProviderId && whatsappAccount) {
      let catalog = await prisma.catalog.findFirst({
        where: {
          organisationId: org.id,
          providerId: catalogProviderId,
        },
      })

      if (!catalog) {
        catalog = await prisma.catalog.create({
          data: {
            organisationId: org.id,
            name: 'Catalogue WhatsApp',
            providerId: catalogProviderId,
          },
        })
        console.log(`✓ Catalog created: ${catalog.name} (${catalog.id})`)
      } else {
        console.log(`✓ Catalog already exists: ${catalog.name} (${catalog.id})`)
      }

      // Link catalog to WhatsApp account
      await prisma.catalogSocialAccount.upsert({
        where: {
          catalogId_socialAccountId: {
            catalogId: catalog.id,
            socialAccountId: whatsappAccount.id,
          },
        },
        update: {},
        create: {
          catalogId: catalog.id,
          socialAccountId: whatsappAccount.id,
        },
      })
      console.log(`✓ Catalog linked to WhatsApp account`)
    } else {
      console.log('⚠ Skipping Catalog seed (missing SEED_WHATSAPP_CATALOG_ID or WhatsApp account)')
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
