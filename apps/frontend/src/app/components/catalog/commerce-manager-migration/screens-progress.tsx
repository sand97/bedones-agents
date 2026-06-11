import { clearCatalogMigrationDraft } from '@app/lib/catalog-migration-draft'
import { Icon } from './icons'
import { LinkVisual } from './building-blocks'
import type { Screen, ScreenContext } from './shared'

/** Screens for steps 4–5 (import progress/result, WhatsApp account linking). */
export function buildProgressScreen(ctx: ScreenContext): Screen {
  const {
    tf,
    step,
    phase,
    setStep,
    setPhase,
    setMigrationId,
    collectionsCount,
    setCollectionsCount,
    targetCatalog,
    waNumber,
    migration,
    importProgress,
    isResync,
    startMutation,
    smbLinkMutation,
    close,
    connectAccount,
    smbDone,
    reportProblem,
    openSupport,
    recheck,
  } = ctx

  if (step === 4) {
    if (phase === 'result') {
      const products = migration?.importedProducts ?? migration?.totalProducts ?? 0
      return {
        title: tf('s4_result_title'),
        current: 4,
        body: (
          <div className="mc-step">
            <div className="mc-stats">
              <div className="mc-stat">
                <div className="mc-stat-ic mc-tone-violet">
                  <Icon name="layers" size={22} />
                </div>
                <div className="mc-stat-v">
                  <strong>{collectionsCount}</strong>{' '}
                  {tf('stat_collections', { count: collectionsCount })}
                </div>
              </div>
              <div className="mc-stat">
                <div className="mc-stat-ic mc-tone-emerald">
                  <Icon name="bag" size={22} />
                </div>
                <div className="mc-stat-v">
                  <strong>{products}</strong> {tf('stat_products', { count: products })}
                </div>
              </div>
            </div>
            {!isResync && (
              <div className="mc-ask">
                <div className="mc-ask-t">{tf('s4_done_t')}</div>
                <div className="mc-ask-b">{tf('s4_done_b', { number: waNumber })}</div>
                <button className="mc-textlink" onClick={connectAccount}>
                  {tf('s4_connect_native')}
                </button>
              </div>
            )}
          </div>
        ),
        primary: { label: tf('finish'), icon: 'check', onClick: close },
      }
    }
    if (phase === 'failed') {
      // A wrong catalog vertical can't be retried on the same catalog — send
      // the user back to pick another one (and clear the resume draft so a
      // reload doesn't drop them back onto this dead-end progress screen).
      const wrongVertical = migration?.errorCode === 'WRONG_CATALOG_VERTICAL'
      const chooseAnotherCatalog = () => {
        clearCatalogMigrationDraft()
        setMigrationId(undefined)
        setCollectionsCount(0)
        setPhase('main')
        setStep(2)
      }
      return {
        title: tf('s4_failed_title'),
        current: 4,
        body: (
          <div className="mc-step">
            <div className="mc-banner is-warn">
              <Icon name="alert" size={18} />
              <div>
                <strong>{tf('s4_failed_msg')}</strong>{' '}
                {wrongVertical ? tf('s4_failed_vertical') : tf('s4_failed_hint')}
              </div>
            </div>
            {wrongVertical && (
              <button className="mc-textlink" onClick={openSupport}>
                {tf('contact_support')}
              </button>
            )}
          </div>
        ),
        primary: wrongVertical
          ? {
              label: tf('s4_choose_another'),
              icon: 'arrowRight',
              onClick: chooseAnotherCatalog,
            }
          : {
              label: tf('retry'),
              icon: 'refresh',
              disabled: startMutation.isPending,
              onClick: () => startMutation.mutate(),
            },
      }
    }
    const tasks = [tf('s4_task1'), tf('s4_task2'), tf('s4_task3')]
    return {
      title: null,
      current: 4,
      body: (
        <div className="mc-step mc-center">
          <LinkVisual state="progress" />
          <div className="mc-bigtitle">{tf('s4_progress_title')}</div>
          <ul className="mc-tasklist">
            {tasks.map((task, i) => {
              const st = i < importProgress ? 'done' : i === importProgress ? 'doing' : 'todo'
              return (
                <li key={i} className={'mc-task is-' + st}>
                  <span className="mc-task-dot">
                    {st === 'done' && <Icon name="check" size={13} />}
                    {st === 'doing' && <span className="mc-spin sm" />}
                  </span>
                  <span className="mc-task-tx">
                    {task}
                    {st === 'doing' && (migration?.totalProducts ?? 0) > 0 && (
                      <span className="mc-task-sub">
                        {tf('s4_task_count', {
                          done: migration?.importedProducts ?? 0,
                          total: migration?.totalProducts,
                        })}
                      </span>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
          <p className="mc-caption mc-center-tx">{tf('s4_caption')}</p>
        </div>
      ),
    }
  }

  // step 5 — connecting the WhatsApp account
  if (phase === 'linked') {
    const products = migration?.importedProducts ?? migration?.totalProducts ?? 0
    return {
      title: null,
      current: 5,
      footStep: (
        <span>
          <b>{tf('done')}</b>
        </span>
      ),
      body: (
        <div className="mc-step mc-center">
          <div className="mc-check64">
            <Icon name="check" size={34} />
          </div>
          <div className="mc-bigtitle">{tf('s5_linked_title')}</div>
          <p className="mc-lede mc-center-tx">{tf('s5_linked_lede', { count: products })}</p>
        </div>
      ),
      primary: { label: tf('finish'), icon: 'check', onClick: close },
    }
  }
  if (phase === 'linking') {
    return {
      title: null,
      current: 5,
      body: (
        <div className="mc-step mc-center">
          <LinkVisual state="progress" />
          <div className="mc-bigtitle">{tf('s5_linking_title')}</div>
          <p className="mc-lede mc-center-tx">{tf('s5_linking_lede', { number: waNumber })}</p>
        </div>
      ),
    }
  }
  if (phase === 'smb_tutorial') {
    const steps: [string, string][] = [
      [tf('smb_s1_t'), tf('smb_s1_b')],
      [tf('smb_s2_t'), tf('smb_s2_b')],
      [tf('smb_s3_t'), tf('smb_s3_b')],
      [tf('smb_s4_t'), tf('smb_s4_b')],
    ]
    return {
      title: tf('smb_title'),
      current: 5,
      back: () => {
        setStep(4)
        setPhase('result')
      },
      body: (
        <div className="mc-step pres-compact">
          <p className="mc-lede">{tf('smb_lede', { catalog: targetCatalog?.name ?? '' })}</p>
          <ol className="mc-manual">
            {steps.map(([title, body], i) => (
              <li key={i} className="mc-manual-item">
                <span className="mc-manual-num">{i + 1}</span>
                <div className="mc-manual-tx">
                  <div className="mc-manual-t">{title}</div>
                  <div className="mc-manual-b">{body}</div>
                </div>
              </li>
            ))}
          </ol>
          <button className="mc-textlink" onClick={reportProblem}>
            {tf('smb_problem')}
          </button>
        </div>
      ),
      primary: {
        label: tf('smb_done'),
        icon: 'check',
        disabled: smbLinkMutation.isPending,
        onClick: smbDone,
      },
    }
  }
  // manual fallback
  const checking = phase === 'checking'
  const manual: [string, string][] = [
    [tf('s5_m1_t'), tf('s5_m1_b')],
    [tf('s5_m2_t'), tf('s5_m2_b')],
    [tf('s5_m3_t'), tf('s5_m3_b')],
    [tf('s5_m4_t'), tf('s5_m4_b')],
  ]
  return {
    title: tf('s5_manual_title'),
    current: 5,
    back: () => {
      setStep(4)
      setPhase('result')
    },
    body: (
      <div className="mc-step pres-compact">
        <p className="mc-lede">{tf('s5_manual_lede')}</p>
        <ol className="mc-manual">
          {manual.map(([title, body], i) => (
            <li key={i} className="mc-manual-item">
              <span className="mc-manual-num">{i + 1}</span>
              <div className="mc-manual-tx">
                <div className="mc-manual-t">{title}</div>
                <div className="mc-manual-b">{body}</div>
              </div>
            </li>
          ))}
        </ol>
        {phase === 'checking' && (
          <div className="mc-banner is-neutral">
            <span className="mc-spin sm" />
            <span>{tf('s5_checking')}</span>
          </div>
        )}
        {phase === 'stillfailed' && (
          <div className="mc-banner is-warn">
            <Icon name="alert" size={18} />
            <div>
              <strong>{tf('s5_stillfailed_t')}</strong> {tf('s5_stillfailed_b')}
            </div>
          </div>
        )}
      </div>
    ),
    primary: {
      label: checking ? tf('checking') : tf('recheck'),
      icon: checking ? null : 'refresh',
      disabled: checking,
      onClick: recheck,
    },
  }
}
