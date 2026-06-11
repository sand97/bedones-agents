import { Trans } from 'react-i18next'
import { Select } from 'antd'
import { clearCatalogMigrationDraft } from '@app/lib/catalog-migration-draft'
import { CommerceGlyph, Icon } from './icons'
import { BenefitCard, FlowDiagram, Note, RadioCard, TransferDiagram } from './building-blocks'
import { NS, type Screen, type ScreenContext } from './shared'

/** Screens for steps 1–3 (intro, catalogue choice/connect, import confirmation). */
export function buildSetupScreen(ctx: ScreenContext): Screen {
  const {
    tf,
    step,
    phase,
    setStep,
    setPhase,
    setJustConnected,
    connectedCatalogs,
    targetCatalog,
    selectedCatalogId,
    setSelectedCatalogId,
    catalogChoice,
    setCatalogChoice,
    whatsappAccounts,
    selectedAccountId,
    setSelectedAccountId,
    presetAccountId,
    waNumber,
    sourcePhone,
    startMutation,
    showConnectNotice,
    connectCatalog,
    openSupport,
  } = ctx

  if (step === 1) {
    return {
      title: tf('s1_title'),
      current: 1,
      body: (
        <div className="mc-step">
          <div className="mc-hero">
            <FlowDiagram />
          </div>
          <p className="mc-lede">
            <Trans i18nKey={NS + 's1_lede'} components={{ b: <strong /> }} />
          </p>
          <div className="mc-benefits">
            <BenefitCard icon="sparkles" tone="violet" title={tf('s1_b1_t')} body={tf('s1_b1_b')} />
            <BenefitCard icon="ticket" tone="blue" title={tf('s1_b2_t')} body={tf('s1_b2_b')} />
            <BenefitCard icon="promo" tone="pink" title={tf('s1_b3_t')} body={tf('s1_b3_b')} />
          </div>
          <Note>{tf('s1_note')}</Note>
        </div>
      ),
      primary: { label: tf('continue'), icon: 'arrowRight', onClick: () => setStep(2) },
    }
  }

  if (step === 2) {
    if (phase === 'redirecting') {
      return {
        title: null,
        current: 2,
        body: (
          <div className="mc-step mc-center">
            <span className="mc-spin xl" />
            <div className="mc-bigtitle">{tf('s2_redirect_title')}</div>
            <p className="mc-lede mc-center-tx">{tf('s2_redirect_lede')}</p>
          </div>
        ),
      }
    }
    // Heads-up before leaving for Meta: a new catalogue must use the
    // "commerce" vertical, otherwise products can't be imported into it.
    if (phase === 'connect_notice') {
      return {
        title: tf('s2_vertical_notice_title'),
        current: 2,
        back: () => setPhase('main'),
        body: (
          <div className="mc-step">
            <div className="mc-hero">
              <div className="mc-redirect-mark mc-tone-blue">
                <CommerceGlyph size={30} />
              </div>
            </div>
            <div className="mc-banner is-warn">
              <Icon name="alert" size={18} />
              <div>
                <Trans i18nKey={NS + 's2_vertical_notice_msg'} components={{ b: <strong /> }} />
              </div>
            </div>
            <p className="mc-lede">{tf('s2_vertical_notice_hint')}</p>
          </div>
        ),
        primary: { label: tf('connect_meta'), icon: 'external', onClick: connectCatalog },
      }
    }
    // Org already has Commerce Manager catalogue(s): reuse one or connect/
    // create another. The footer button adapts to the chosen type.
    if (connectedCatalogs.length > 0) {
      const useConnected = catalogChoice === 'connected'
      return {
        title: tf('s2_choose_title'),
        current: 2,
        back: () => setStep(1),
        body: (
          <div className="mc-step">
            <p className="mc-lede">{tf('s2_choose_lede')}</p>
            <div className="mc-optcards">
              <RadioCard
                selected={useConnected}
                onSelect={() => setCatalogChoice('connected')}
                icon="box"
                tone="blue"
                title={tf('s2_use_connected_t')}
                body={tf('s2_use_connected_b')}
              >
                {useConnected && (
                  <div className="mc-field">
                    <Select
                      size="large"
                      value={selectedCatalogId}
                      onChange={setSelectedCatalogId}
                      className="mc-field-select"
                      options={connectedCatalogs.map((c) => ({ value: c.id, label: c.name }))}
                    />
                  </div>
                )}
              </RadioCard>
              <RadioCard
                selected={!useConnected}
                onSelect={() => setCatalogChoice('new')}
                icon="layers"
                tone="violet"
                title={tf('s2_new_catalog_t')}
                body={tf('s2_new_catalog_b')}
              />
            </div>
            <Note>{tf('s2_note')}</Note>
          </div>
        ),
        primary: useConnected
          ? {
              label: tf('continue'),
              icon: 'arrowRight',
              disabled: !targetCatalog,
              onClick: () => {
                setPhase('main')
                setStep(3)
              },
            }
          : { label: tf('connect_meta'), icon: 'external', onClick: showConnectNotice },
      }
    }

    // No catalogue connected yet → explain the Meta redirect.
    return {
      title: tf('s2_title'),
      current: 2,
      back: () => setStep(1),
      body: (
        <div className="mc-step">
          <div className="mc-hero">
            <div className="mc-redirect-mark mc-tone-blue">
              <Icon name="external" size={30} />
            </div>
          </div>
          <p className="mc-lede">{tf('s2_lede')}</p>
          <div className="mc-choicelist">
            <div className="mc-choice">
              <div className="mc-choice-ic mc-tone-blue">
                <Icon name="box" size={18} />
              </div>
              <div className="mc-choice-tx">
                <div className="mc-choice-t">{tf('s2_choice1_t')}</div>
                <div className="mc-choice-b">{tf('s2_choice1_b')}</div>
              </div>
            </div>
            <div className="mc-choice">
              <div className="mc-choice-ic mc-tone-violet">
                <Icon name="layers" size={18} />
              </div>
              <div className="mc-choice-tx">
                <div className="mc-choice-t">{tf('s2_choice2_t')}</div>
                <div className="mc-choice-b">{tf('s2_choice2_b')}</div>
              </div>
            </div>
          </div>
          <Note>{tf('s2_note')}</Note>
        </div>
      ),
      primary: { label: tf('connect_meta'), icon: 'external', onClick: showConnectNotice },
    }
  }

  // step 3
  // The catalogue connected on Meta is not a "commerce" vertical, so the
  // WhatsApp products can't be imported into it. Explain clearly and offer a
  // support hand-off (pre-filled) plus a way to connect another catalogue.
  if (phase === 'wrong_vertical') {
    const goBackToChoice = () => {
      setJustConnected(false)
      clearCatalogMigrationDraft()
      setPhase('main')
      setStep(2)
    }
    return {
      title: tf('s3_wrong_vertical_title'),
      current: 3,
      back: goBackToChoice,
      body: (
        <div className="mc-step">
          <div className="mc-banner is-warn">
            <Icon name="alert" size={18} />
            <div>
              <strong>{tf('s3_wrong_vertical_msg')}</strong> {tf('s3_wrong_vertical_hint')}
            </div>
          </div>
          <button className="mc-textlink" onClick={goBackToChoice}>
            {tf('s3_wrong_vertical_choose_another')}
          </button>
        </div>
      ),
      primary: { label: tf('contact_support'), icon: 'shield', onClick: openSupport },
    }
  }
  const catalogName = targetCatalog?.name ?? tf('your_catalog')
  return {
    title: tf('s3_title'),
    current: 3,
    back: () => setStep(2),
    body: (
      <div className="mc-step">
        <TransferDiagram number={waNumber || tf('your_number')} catalog={catalogName} />
        {!presetAccountId && whatsappAccounts.length > 0 && (
          <div className="mc-field">
            <span className="mc-field-label">{tf('number_label')}</span>
            <Select
              size="large"
              value={selectedAccountId}
              onChange={setSelectedAccountId}
              className="mc-field-select"
              options={whatsappAccounts.map((a) => ({
                value: a.id,
                label: a.username || a.pageName || a.providerAccountId,
              }))}
            />
          </div>
        )}
        <div className="mc-confirm-line">
          <span className="mc-confirm-check">
            <Icon name="check" size={12} />
          </span>
          <Trans
            i18nKey={NS + 's3_confirm'}
            values={{ name: catalogName }}
            components={{ b: <strong /> }}
          />
        </div>
        <p className="mc-lede">
          <Trans
            i18nKey={NS + 's3_lede'}
            values={{ number: waNumber }}
            components={{ b: <strong /> }}
          />
        </p>
        <button className="mc-textlink" onClick={() => setStep(2)}>
          {tf('s3_reconnect')}
        </button>
      </div>
    ),
    primary: {
      label: tf('start_import'),
      icon: 'arrowRight',
      disabled: !targetCatalog || !sourcePhone || startMutation.isPending,
      onClick: () => startMutation.mutate(),
    },
  }
}
