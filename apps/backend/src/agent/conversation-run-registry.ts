import { Injectable, Logger } from '@nestjs/common'

/**
 * Sérialise le traitement IA par contact (une « file d'attente » dont l'id est
 * celui du contact, c.-à-d. sa conversation).
 *
 * Problème résolu : quand un contact envoie plusieurs messages coup sur coup,
 * chaque message déclenche son propre run d'agent (analyse LLM + envoi). Sans
 * coordination, deux runs s'exécutent en parallèle sur la MÊME conversation et
 * aboutissent à DEUX réponses envoyées (cf. la conv où le bot répond en anglais
 * puis en français).
 *
 * Règle : un seul run en vol par contact. Dès qu'un nouveau message arrive pour
 * un contact dont le run précédent n'a pas encore livré sa réponse, on ANNULE ce
 * run précédent — y compris l'appel LLM en cours via son `AbortSignal` — avant
 * d'en démarrer un nouveau. Le run le plus récent gagne : il relit de toute façon
 * l'historique complet (messages précédents inclus) depuis la base.
 */
@Injectable()
export class ConversationRunRegistry {
  private readonly logger = new Logger(ConversationRunRegistry.name)

  /** Run en vol par clé de contact (= conversationId). */
  private readonly inflight = new Map<string, AbortController>()

  /**
   * Démarre un run pour ce contact : annule d'abord le run précédent encore en
   * vol (LLM compris), puis enregistre et renvoie le `AbortSignal` du nouveau run.
   */
  begin(key: string): AbortSignal {
    this.cancel(key, 'superseded-by-newer-message')
    const controller = new AbortController()
    this.inflight.set(key, controller)
    return controller.signal
  }

  /**
   * Termine le run identifié par son signal. On ne retire l'entrée que si elle
   * correspond toujours à CE run : un run plus récent a pu prendre la place entre
   * temps, il ne faut pas le désenregistrer.
   */
  end(key: string, signal: AbortSignal): void {
    const current = this.inflight.get(key)
    if (current && current.signal === signal) {
      this.inflight.delete(key)
    }
  }

  /** Annule le run en vol pour ce contact (s'il existe). No-op sinon. */
  cancel(key: string, reason: string): void {
    const existing = this.inflight.get(key)
    if (!existing) return
    this.logger.log(`Annulation du traitement en cours pour ${key} (${reason})`)
    existing.abort(new DOMException(reason, 'AbortError'))
    this.inflight.delete(key)
  }
}
