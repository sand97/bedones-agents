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
        locale: 'fr',
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
          timezone: 'Africa/Douala',
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

    // ─── Ensure a WhatsApp account exists for local mock data ───
    // If no env-based account was provisioned, create a mock one so the chat UI
    // always has something to render during local development.
    if (!whatsappAccount) {
      const mockPhoneId = 'mock-whatsapp-phone-id'
      whatsappAccount = await prisma.socialAccount.upsert({
        where: {
          provider_providerAccountId: {
            provider: 'WHATSAPP',
            providerAccountId: mockPhoneId,
          },
        },
        update: {},
        create: {
          organisationId: org.id,
          provider: 'WHATSAPP',
          providerAccountId: mockPhoneId,
          pageName: 'Mboa Fashion (Mock)',
          username: '+237699000000',
          accessToken: 'mock-token',
          scopes: ['whatsapp_business_messaging'],
        },
      })
      console.log(`✓ Mock WhatsApp SocialAccount: ${whatsappAccount.id}`)
    }

    // ─── Agent + mock conversations (for local testing) ───
    if (whatsappAccount) {
      const existingAgent = await prisma.agent.findFirst({
        where: { organisationId: org.id, name: 'Agent Test' },
      })
      const agent =
        existingAgent ??
        (await prisma.agent.create({
          data: {
            organisationId: org.id,
            name: 'Agent Test',
            status: 'ACTIVE',
            score: 100,
            context:
              'Agent de test Mboa Fashion. Repond en francais, style chaleureux, propose toujours la collection en cours.',
          },
        }))
      console.log(`✓ Agent: ${agent.name} (score ${agent.score}, ${agent.status})`)

      await prisma.agentSocialAccount.upsert({
        where: { socialAccountId: whatsappAccount.id },
        update: { aiActivationMode: 'ALL' },
        create: {
          agentId: agent.id,
          socialAccountId: whatsappAccount.id,
          aiActivationMode: 'ALL',
        },
      })
      console.log(`✓ Agent linked to WhatsApp account (mode ALL)`)

      type MsgFrom = 'customer' | 'ai' | 'human'
      const mockConversations: {
        participantId: string
        participantName: string
        aiOverride: 'FORCE_ON' | 'FORCE_OFF' | null
        messages: { text: string; from: MsgFrom; minutesAgo: number }[]
      }[] = [
        {
          participantId: '237695111111',
          participantName: 'Aisha Mbala',
          aiOverride: 'FORCE_ON',
          messages: [
            {
              text: 'Bonjour, vous avez encore la robe wax en taille M ?',
              from: 'customer',
              minutesAgo: 45,
            },
            {
              text: 'Bonjour Aisha ! Oui, la robe wax est encore dispo en taille M. Souhaitez-vous la commander ?',
              from: 'ai',
              minutesAgo: 43,
            },
            {
              text: 'Super, quel est le prix livre a Douala ?',
              from: 'customer',
              minutesAgo: 40,
            },
            {
              text: 'La livraison a Douala est offerte pour toute commande au-dessus de 15 000 FCFA. La robe wax est a 12 500 FCFA, et la livraison est de 1 500 FCFA.',
              from: 'ai',
              minutesAgo: 39,
            },
          ],
        },
        {
          participantId: '237695222222',
          participantName: 'Jean-Paul Nkoa',
          aiOverride: 'FORCE_OFF',
          messages: [
            {
              text: 'Salut, je cherche des chemises homme en lin.',
              from: 'customer',
              minutesAgo: 120,
            },
            {
              text: 'On a recu un arrivage cette semaine, tailles M a XXL.',
              from: 'human',
              minutesAgo: 118,
            },
            {
              text: 'Tu peux m envoyer quelques photos ?',
              from: 'customer',
              minutesAgo: 115,
            },
            {
              text: 'Je t envoie ca dans la minute, tu veux une couleur particuliere ?',
              from: 'human',
              minutesAgo: 112,
            },
          ],
        },
        {
          participantId: '237695333333',
          participantName: 'Laure Epoupa',
          aiOverride: null,
          messages: [
            {
              text: 'Bonsoir, la commande 1024 est arrivee a Yaounde ?',
              from: 'customer',
              minutesAgo: 30,
            },
            {
              text: 'Bonsoir Laure, je verifie le statut de la commande 1024 tout de suite.',
              from: 'ai',
              minutesAgo: 29,
            },
            {
              text: 'Votre colis est parti ce matin, le delai estime est de 48h. Vous recevrez un SMS a la livraison.',
              from: 'ai',
              minutesAgo: 28,
            },
            {
              text: "Il y a eu un souci, c'est en fait parti hier. Mes excuses !",
              from: 'human',
              minutesAgo: 15,
            },
            {
              text: 'Parfait merci, je recommanderai des la reception.',
              from: 'customer',
              minutesAgo: 5,
            },
          ],
        },
      ]

      for (const convSpec of mockConversations) {
        const lastMsg = convSpec.messages[convSpec.messages.length - 1]
        const lastMessageAt = new Date(Date.now() - lastMsg.minutesAgo * 60_000)

        const conversation = await prisma.conversation.upsert({
          where: {
            socialAccountId_participantId: {
              socialAccountId: whatsappAccount.id,
              participantId: convSpec.participantId,
            },
          },
          update: {
            participantName: convSpec.participantName,
            lastMessageText: lastMsg.text,
            lastMessageAt,
            aiOverride: convSpec.aiOverride,
          },
          create: {
            socialAccountId: whatsappAccount.id,
            participantId: convSpec.participantId,
            participantName: convSpec.participantName,
            lastMessageText: lastMsg.text,
            lastMessageAt,
            aiOverride: convSpec.aiOverride,
          },
        })

        const existingCount = await prisma.directMessage.count({
          where: { conversationId: conversation.id },
        })
        if (existingCount === 0) {
          const pageSenderId = whatsappPhoneId ?? 'mock-whatsapp-phone-id'
          await prisma.directMessage.createMany({
            data: convSpec.messages.map((m) => {
              const isFromPage = m.from !== 'customer'
              return {
                conversationId: conversation.id,
                message: m.text,
                senderId: isFromPage ? pageSenderId : convSpec.participantId,
                senderName:
                  m.from === 'customer'
                    ? convSpec.participantName
                    : m.from === 'ai'
                      ? 'AI Agent'
                      : 'Mboa Fashion',
                isFromPage,
                mediaType: 'text',
                createdTime: new Date(Date.now() - m.minutesAgo * 60_000),
                isRead: isFromPage,
                deliveryStatus: isFromPage ? 'read' : null,
              }
            }),
          })
        }
        console.log(
          `  ✓ Conversation: ${convSpec.participantName} (${convSpec.participantId})` +
            (convSpec.aiOverride ? ` [override=${convSpec.aiOverride}]` : ''),
        )
      }
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
