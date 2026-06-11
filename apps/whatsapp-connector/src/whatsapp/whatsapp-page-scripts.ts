/**
 * Page scripts executed inside the WhatsApp Web page via `page.evaluate`.
 * These functions are serialized by Puppeteer and run in the browser context:
 * they must stay self-contained (no closure over Node-side variables) and only
 * rely on `window` plus the arguments they receive.
 */

export interface CatalogPreviewResult {
  products: any[]
  collections: any[]
}

export interface CatalogIdDebugResult {
  sources: Record<string, unknown>
  candidates: string[]
  error?: string
}

/**
 * Reads a number's public catalogue inline (products + collections) from the
 * WhatsApp Web page. Used by `WhatsAppClientService.getCatalogPreview`.
 */
export const readCatalogPreviewScript = async (
  targetWid: string,
): Promise<CatalogPreviewResult> => {
  const wa = window.WPP.whatsapp as any
  const byId = new Map<string, any>()
  const add = (raw: any) => {
    const p = (raw && raw.attributes) || raw
    if (p && p.id && !byId.has(p.id)) byId.set(p.id, p)
  }
  const pick = (variants: any): string | null => {
    if (!Array.isArray(variants)) return null
    const full = variants.find((v: any) => v && v.key === 'full')
    if (full && full.value) return full.value
    const req = variants.find((v: any) => v && v.key === 'requested')
    return (req && req.value) || null
  }
  const fromCatalog = (entry: any): any[] => {
    const idx = entry && entry.productCollection && entry.productCollection._index
    if (!idx || typeof idx !== 'object') return []
    return Object.keys(idx)
      .map((id) => idx[id] && idx[id].attributes)
      .filter(Boolean)
  }

  if (wa && wa.functions && wa.functions.queryCatalog) {
    try {
      let after: string | undefined = undefined
      while (true) {
        const r = await wa.functions.queryCatalog(targetWid, after)
        const list = Array.isArray(r && r.data) ? r.data : []
        for (const p of list) add(p)
        const next = r && r.paging && r.paging.cursors && r.paging.cursors.after
        if (!next || next === after) break
        after = next
      }
    } catch {
      /* ignore */
    }
  }
  if (wa && wa.CatalogStore && wa.CatalogStore.findQuery) {
    try {
      const res = await wa.CatalogStore.findQuery(targetWid)
      if (Array.isArray(res)) for (const en of res) for (const p of fromCatalog(en)) add(p)
    } catch {
      /* ignore */
    }
  }
  if (byId.size === 0) {
    try {
      const fb = await window.WPP.catalog.getProducts(targetWid as any, 999)
      if (Array.isArray(fb)) for (const p of fb) add(p)
    } catch {
      /* ignore */
    }
  }

  const retailerByWaId = new Map<string, string>()
  const products = Array.from(byId.values()).map((product: any) => {
    const imageUrls: string[] = []
    const main = product.imageCdnUrl || product.image_cdn_url || pick(product.image_cdn_urls)
    if (main) imageUrls.push(main)
    if (Array.isArray(product.additional_image_cdn_urls)) {
      for (const arr of product.additional_image_cdn_urls) {
        const u = pick(arr)
        if (u) imageUrls.push(u)
      }
    }
    const rawPrice = product.priceAmount1000 ?? product.price_amount_1000 ?? product.price ?? null
    const price =
      rawPrice != null && Number.isFinite(Number(rawPrice)) ? Number(rawPrice) / 1000 : null
    const retailerId = product.retailerId || product.retailer_id || product.id || null
    if (product.id) retailerByWaId.set(product.id, retailerId)
    return {
      id: product.id,
      retailerId,
      name: product.name || '',
      description: product.description || null,
      price,
      currency: product.currency || null,
      availability: product.availability || null,
      imageCount: imageUrls.length,
      imageUrls,
    }
  })

  let collections: any[] = []
  try {
    const cols = await window.WPP.catalog.getCollections(targetWid as any, 50, 100)
    if (Array.isArray(cols)) {
      collections = cols
        .map((c: any) => ({
          id: c && c.id,
          name: (c && c.name) || '',
          retailerIds: (((c && c.products) || []) as any[])
            .map((p: any) => retailerByWaId.get(p && p.id))
            .filter(Boolean),
        }))
        .filter((c: any) => c.name)
    }
  } catch {
    /* ignore */
  }

  return { products, collections }
}

/**
 * Diagnostic probe of the possible catalog-id sources exposed by WhatsApp Web.
 * Used by `WhatsAppClientService.getCatalogId`.
 */
export const readCatalogIdScript = async (targetWid: string): Promise<CatalogIdDebugResult> => {
  const out: any = { sources: {}, candidates: [] }
  const push = (v: any) => {
    if (v === null || v === undefined) return
    const s = String(v)
    if (s && !out.candidates.includes(s)) out.candidates.push(s)
  }
  const keysOf = (o: any) => (o && typeof o === 'object' ? Object.keys(o) : null)
  const W = window as any
  try {
    const wa = W.WPP?.whatsapp
    // 1) queryCatalog response wrapper + first product attributes
    if (wa?.functions?.queryCatalog) {
      try {
        const r = await wa.functions.queryCatalog(targetWid, undefined)
        const first = Array.isArray(r?.data) ? r.data[0] : null
        const fa = (first && first.attributes) || first
        out.sources.queryCatalog = {
          responseKeys: keysOf(r),
          respId: r?.id ?? r?.catalogId ?? r?.catalog_id ?? null,
          productKeys: keysOf(fa),
          productCatalogId:
            fa?.catalogWid ?? fa?.catalogId ?? fa?.catalog_id ?? fa?.catalog_wid ?? null,
        }
        push(out.sources.queryCatalog.respId)
        push(out.sources.queryCatalog.productCatalogId)
      } catch (e: any) {
        out.sources.queryCatalog = { error: String(e?.message || e) }
      }
    }
    // 2) CatalogStore entries
    if (wa?.CatalogStore?.findQuery) {
      try {
        const res = await wa.CatalogStore.findQuery(targetWid)
        const first = Array.isArray(res) ? res[0] : res
        const a = (first && first.attributes) || first
        out.sources.catalogStore = {
          entryKeys: keysOf(a),
          id: a?.id ?? a?.catalogId ?? a?.catalog_id ?? a?.catalogWid ?? null,
        }
        push(out.sources.catalogStore.id)
      } catch (e: any) {
        out.sources.catalogStore = { error: String(e?.message || e) }
      }
    }
    // 3) a product via WPP.catalog
    try {
      const fb = await W.WPP.catalog.getProducts(targetWid, 3)
      const p = Array.isArray(fb) && fb[0] ? fb[0].attributes || fb[0] : null
      out.sources.product = {
        keys: keysOf(p),
        catalogWid: p?.catalogWid ?? null,
        catalogId: p?.catalogId ?? p?.catalog_id ?? null,
      }
      push(out.sources.product.catalogWid)
      push(out.sources.product.catalogId)
    } catch (e: any) {
      out.sources.product = { error: String(e?.message || e) }
    }
    // 4) business profile / commerce info
    try {
      const bp =
        (await W.WPP?.contact?.getBusinessProfile?.(targetWid)) ??
        (await wa?.functions?.queryBusinessProfile?.(targetWid))
      out.sources.businessProfile = {
        keys: keysOf(bp),
        catalogId: bp?.catalogId ?? bp?.catalog_id ?? bp?.commerceProfile?.catalogId ?? null,
      }
      push(out.sources.businessProfile.catalogId)
    } catch (e: any) {
      out.sources.businessProfile = { error: String(e?.message || e) }
    }
  } catch (e: any) {
    out.error = String(e?.message || e)
  }
  return out
}
