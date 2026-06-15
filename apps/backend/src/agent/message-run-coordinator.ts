import { Injectable, Logger } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import type { Queue } from 'bullmq'
import { MESSAGE_PROCESSING_QUEUE } from '../queue/queue.module'

/**
 * Coordination Redis du traitement des messages, sérialisé/annulable PAR CONTACT
 * et valable à travers TOUTES les instances backend (multi-conteneurs).
 *
 * Problème : un contact qui envoie plusieurs messages coup sur coup déclenchait
 * un run d'agent par message. En scalant horizontalement, ces runs tournent sur
 * des conteneurs différents → deux analyses LLM en parallèle → deux réponses sur
 * la même conversation.
 *
 * Mécanisme (sans dépendance Redis supplémentaire : on réutilise la connexion
 * ioredis de BullMQ via `queue.client`) :
 *  - `claim()` : à chaque message, on incrémente un compteur monotone GLOBAL
 *    (`INCR`) et on écrit ce numéro comme « dernier en date » du contact
 *    (`agent:run:latest:<conversationId>`). Le job le plus récent gagne donc
 *    toujours, quelle que soit l'instance qui l'a reçu.
 *  - `isSuperseded()` : un run est périmé dès qu'un numéro plus grand existe pour
 *    son contact. Vérifié au démarrage du worker (on n'appelle même pas le LLM)
 *    et en continu pendant le run.
 *  - `watch()` : sonde Redis périodiquement et `abort()` le run en vol (donc
 *    l'appel LLM, via le signal) dès qu'un message plus récent arrive — y compris
 *    quand ce message a été reçu par une autre instance.
 */
@Injectable()
export class MessageRunCoordinator {
  private readonly logger = new Logger(MessageRunCoordinator.name)

  /** Compteur monotone global : garantit un ordre total des messages, sans dépendre des horloges. */
  private static readonly SEQ_KEY = 'agent:run:seq'

  /** Intervalle de sondage de la supersession (ms). Largement sous la durée d'une analyse LLM. */
  private static readonly POLL_MS = 300

  /** Durée de vie des clés "dernier en date" : auto-nettoyage, une conv inactive disparaît. */
  private static readonly LATEST_TTL_SECONDS = 60 * 60

  constructor(@InjectQueue(MESSAGE_PROCESSING_QUEUE) private readonly queue: Queue) {}

  private latestKey(conversationId: string): string {
    return `agent:run:latest:${conversationId}`
  }

  /**
   * Réserve le numéro de séquence de CE message et le publie comme dernier en
   * date pour le contact. Tout run antérieur encore en vol devient périmé et sera
   * annulé par son `watch()`. À appeler à l'arrivée du message, avant d'enfiler le job.
   */
  async claim(conversationId: string): Promise<number> {
    const client = await this.queue.client
    const seq = await client.incr(MessageRunCoordinator.SEQ_KEY)
    await client.set(
      this.latestKey(conversationId),
      String(seq),
      'EX',
      MessageRunCoordinator.LATEST_TTL_SECONDS,
    )
    return seq
  }

  /** Vrai si un message plus récent a déjà pris la place pour ce contact. */
  async isSuperseded(conversationId: string, seq: number): Promise<boolean> {
    const client = await this.queue.client
    const latest = Number(await client.get(this.latestKey(conversationId)))
    return Number.isFinite(latest) && latest > seq
  }

  /**
   * Surveille la supersession en tâche de fond et annule le run (LLM compris) dès
   * qu'un message plus récent arrive pour ce contact, sur n'importe quelle
   * instance. Renvoie une fonction de nettoyage à appeler dans un `finally`.
   */
  watch(conversationId: string, seq: number, controller: AbortController): () => void {
    const timer = setInterval(() => {
      void this.isSuperseded(conversationId, seq)
        .then((superseded) => {
          if (superseded && !controller.signal.aborted) {
            this.logger.log(
              `Run #${seq} de la conversation ${conversationId} annulé (message plus récent)`,
            )
            controller.abort(new DOMException('superseded-by-newer-message', 'AbortError'))
          }
        })
        .catch((error: unknown) => {
          // Une panne de sondage ne doit pas tuer le run en cours : on log et on continue.
          this.logger.warn(
            `Sondage de supersession échoué pour ${conversationId}: ${
              error instanceof Error ? error.message : error
            }`,
          )
        })
    }, MessageRunCoordinator.POLL_MS)
    // Ne pas maintenir le process en vie juste pour ce timer.
    if (typeof timer.unref === 'function') timer.unref()
    return () => clearInterval(timer)
  }
}
