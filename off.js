'use strict';
/* Open Food Facts: Produkt per Barcode abrufen und als eigene Zeile (source 'off') zwischenspeichern.
   Zuerst wird in nut_products gesucht (eigene und schon gespeicherte OFF-Produkte), erst dann bei OFF.
   Die OFF-Volltextsuche lässt keine Browser-Aufrufe zu (CORS), deshalb nur der Abruf per Barcode.
   Scannen über BarcodeDetector (Chrome/Android); ohne ihn bleibt die Eingabe von Hand. */

const Off = (() => {
  const FIELDS = 'code,product_name,product_name_de,brands,nutriments,serving_quantity,serving_size';
  const n = v => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? null : Math.round(Number(v) * 1000) / 1000);
  const validEan = s => /^\d{8,14}$/.test(s);

  // OFF-Produkt auf die Spalten von nut_products abbilden (Werte je 100 g bzw. 100 ml)
  function map(p, ean) {
    const m = p.nutriments || {};
    let kj = n(m['energy-kj_100g']) ?? n(m.energy_100g), kcal = n(m['energy-kcal_100g']);  // energy_100g ist in kJ
    if (kj === null && kcal !== null) kj = Math.round(kcal * 4.184);
    if (kcal === null && kj !== null) kcal = Math.round(kj / 4.184);
    return {
      source: 'off', source_ref: ean,
      name: (p.product_name_de || p.product_name || '').trim() || `Produkt ${ean}`,
      brand: (p.brands || '').split(',')[0].trim() || null,
      kj, kcal, fat: n(m.fat_100g), carbs: n(m.carbohydrates_100g), sugar: n(m.sugars_100g),
      protein: n(m.proteins_100g), fiber: n(m.fiber_100g), salt: n(m.salt_100g),
      nutrients: n(m['saturated-fat_100g']) === null ? {} : { saturated_fat: n(m['saturated-fat_100g']) },
    };
  }

  const findStored = async ean =>
    (await Cloud.rest(`nut_products?select=id&source_ref=eq.${ean}&source=in.(own,off)&order=source.desc&limit=1`))[0]?.id ?? null;

  // id des Produkts zum Barcode; null, wenn weder gespeichert noch bei OFF bekannt
  async function byBarcode(code) {
    if (!validEan(code)) throw new Error('Ein Barcode hat 8 bis 14 Ziffern.');
    const ean = code.length === 12 ? `0${code}` : code;  // UPC-A wie bei OFF als EAN-13 speichern
    const stored = await findStored(ean);
    if (stored) return stored;
    let r;
    try {
      r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${ean}.json?fields=${FIELDS}`);
    } catch {
      throw new Error('Open Food Facts ist nicht erreichbar.');
    }
    if (!r.ok && r.status !== 404) throw new Error(`Open Food Facts antwortet nicht (${r.status}).`);
    const j = await r.json().catch(() => ({}));
    if (j.status !== 1 || !j.product) return null;
    let row;
    try {
      [row] = await Cloud.rest('nut_products?select=id', { method: 'POST', body: map(j.product, ean), prefer: 'return=representation' });
    } catch (e) {
      if (e.status === 409) return findStored(ean);  // parallel schon gespeichert (doppelter Scan)
      throw e;
    }
    const grams = n(j.product.serving_quantity);
    if (grams > 0) {  // Portion ist nur Komfort: Fehler hier nicht weiterreichen
      await Cloud.rest('nut_servings', { method: 'POST', prefer: 'return=minimal',
        body: { product_id: row.id, label: (j.product.serving_size || '1 Portion').slice(0, 60), grams } }).catch(() => {});
    }
    return row.id;
  }

  const canScan = 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia;

  // Kamera in <video> zeigen, bis ein Barcode erkannt oder signal abgebrochen wird; liefert den Code oder null
  async function scan(video, signal) {
    const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    try {
      if (signal.aborted) return null;
      video.srcObject = stream;
      await video.play();
      while (!signal.aborted) {
        const codes = await detector.detect(video).catch(() => []);
        if (codes.length) return codes[0].rawValue;
        await new Promise(res => setTimeout(res, 200));
      }
      return null;
    } finally {
      stream.getTracks().forEach(t => t.stop());
      video.srcObject = null;
    }
  }

  return { byBarcode, canScan, scan, validEan };
})();
