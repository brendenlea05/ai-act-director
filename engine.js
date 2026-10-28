/* LineVerity reconciliation engine. No dependencies, no network operations. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LineVerity = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const CLEAN = value => String(value == null ? '' : value).trim();
  const NORM = value => CLEAN(value).toUpperCase().replace(/\s+/g, ' ');
  const MONEY = n => Number(Math.round((n + Number.EPSILON) * 100) / 100);

  function parseCSV(text) {
    text = String(text || '').replace(/^\uFEFF/, '');
    let rows = [], row = [], cell = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (c === '"') quoted = false;
        else cell += c;
      } else if (c === '"') quoted = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); cell = '';
        if (row.some(x => x.trim() !== '')) rows.push(row);
        row = [];
      } else cell += c;
    }
    if (quoted) throw new Error('The CSV contains an unclosed quoted field.');
    row.push(cell);
    if (row.some(x => x.trim() !== '')) rows.push(row);
    if (!rows.length) throw new Error('This file contains no data.');
    const headers = rows.shift().map((x, i) => x.trim() || `Column ${i+1}`);
    if (new Set(headers.map(NORM)).size !== headers.length) throw new Error('Duplicate column headers detected; rename them first.');
    return { headers, rows: rows.map((r,i) => Object.fromEntries(headers.map((h,j) => [h, r[j] ?? '']))), count: rows.length };
  }

  const ALIASES = {
    po: ['po', 'po_number', 'po_id', 'purchase_order', 'purchase order', 'purchase order number', 'order_no', 'order number', 'order_id'],
    sku: ['sku', 'item', 'item_no', 'item number', 'item_id', 'product_code', 'part_no', 'part number', 'product sku'],
    qty: ['qty', 'quantity', 'ordered_qty', 'received_qty', 'billed_qty', 'quantity ordered', 'quantity received', 'quantity billed', 'units'],
    price: ['unit_price', 'unit price', 'price', 'unit_cost', 'unit cost', 'cost each', 'price each', 'rate'],
    invoice: ['invoice', 'invoice_no', 'invoice_number', 'invoice number', 'invoice_id', 'bill_no', 'bill_number', 'bill number'],
    supplier: ['supplier', 'vendor', 'vendor_name', 'supplier_name', 'supplier name', 'vendor name'],
    currency: ['currency', 'currency_code', 'ccy']
  };
  const REQUIRED = {po:['po','sku','qty','price'], receipts:['po','sku','qty'], invoices:['po','sku','qty','price','invoice']};
  const fields = {po:['po','sku','qty','price','supplier','currency'], receipts:['po','sku','qty','supplier','currency'], invoices:['po','sku','qty','price','invoice','supplier','currency']};
  function guessMapping(headers, kind) {
    const result = {};
    for (const f of fields[kind]) {
      const match = headers.find(h => ALIASES[f].some(a => NORM(a).replace(/[^A-Z0-9]/g,'') === NORM(h).replace(/[^A-Z0-9]/g,'')));
      result[f] = match || '';
    }
    return result;
  }
  function readAmount(value, label, row) {
    const str = CLEAN(value).replace(/[$,]/g,'');
    if (str === '') throw new Error(`${label} missing in row ${row}`);
    const num = Number(str);
    if (!Number.isFinite(num) || num < 0) throw new Error(`${label} invalid in row ${row}. Only nonnegative quantities/prices are supported.`);
    return num;
  }
  function convert(parsed, kind, mapping) {
    for (const f of REQUIRED[kind]) if (!mapping[f] || !parsed.headers.includes(mapping[f])) throw new Error(`${kind}: map the “${f}” column.`);
    return parsed.rows.map((r, i) => {
      const get = f => mapping[f] ? r[mapping[f]] : '';
      const po = NORM(get('po')), sku = NORM(get('sku'));
      if (!po || !sku) throw new Error(`${kind}: purchase order and SKU required in row ${i+2}.`);
      const out = {po, sku, qty: readAmount(get('qty'),'Quantity',i+2), price: null,
        invoice: NORM(get('invoice')), supplier: NORM(get('supplier')), currency: NORM(get('currency')) || '', row: i+2};
      if (kind !== 'receipts') out.price = readAmount(get('price'),'Unit price',i+2);
      if (kind === 'invoices' && !out.invoice) throw new Error(`invoices: invoice number required in row ${i+2}.`);
      return out;
    });
  }
  const keyOf = r => `${r.po}\u001F${r.sku}`;
  function bucket(rows) {
    const result = new Map();
    for (const r of rows) {
      const key = keyOf(r);
      if (!result.has(key)) result.set(key, []);
      result.get(key).push(r);
    }
    return result;
  }
  function reconcile(input, opts={}) {
    const tolerance = Number(opts.priceTolerance ?? 0.01);
    if (!(tolerance >= 0) || !Number.isFinite(tolerance)) throw new Error('Price tolerance must be a nonnegative number.');
    const pos = input.pos || [], receipts = input.receipts || [], invoices = input.invoices || [];
    if (!pos.length || !receipts.length || !invoices.length) throw new Error('Provide all three sources, each containing at least one line.');
    const poMap = bucket(pos), recMap = bucket(receipts), invMap = bucket(invoices);
    const issues = [], detail = [], counts = {po:pos.length, receipts:receipts.length, invoices:invoices.length};
    let exposure = 0, flaggedKeys=0, clearKeys=0, blockedKeys=0;
    const add = (d, code, severity, message, amount=0) => {
      issues.push({severity, type:code, po:d.po, sku:d.sku, supplier:d.supplier || '', invoice_ids:d.invoices.join(', '),
        ordered_qty:d.ordered, received_qty:d.received, billed_qty:d.billed, agreed_unit:d.agreed, billed_unit:d.billedUnit,
        exposure_estimate:MONEY(amount), currency:d.currency || '', explanation:message });
      d._issues.push(code);
      if (amount > d._maxExposure) d._maxExposure = amount;
    };
    const ids = new Set([...poMap.keys(),...invMap.keys(),...recMap.keys()]);
    for (const id of ids) {
      const p = poMap.get(id) || [], r = recMap.get(id) || [], v = invMap.get(id) || [];
      const one = p[0] || v[0] || r[0];
      const ordered = p.reduce((a,x)=>a+x.qty,0), received = r.reduce((a,x)=>a+x.qty,0), billed = v.reduce((a,x)=>a+x.qty,0);
      const orderedValue = p.reduce((a,x)=>a+x.qty*x.price,0);
      const billedValue = v.reduce((a,x)=>a+x.qty*x.price,0);
      const agreed = ordered ? orderedValue/ordered : (p[0]?.price ?? 0);
      const billedUnit = billed ? billedValue/billed : (v[0]?.price ?? 0);
      const supplier = p.find(x=>x.supplier)?.supplier || v.find(x=>x.supplier)?.supplier || '';
      const currencies = new Set([...p,...r,...v].map(x=>x.currency).filter(Boolean));
      const d = {po:one.po,sku:one.sku, supplier, ordered, received, billed, agreed:MONEY(agreed),billedUnit:MONEY(billedUnit), currency:[...currencies][0]||'UNSPECIFIED', invoices:[...new Set(v.map(x=>x.invoice))], status:'MATCHED',_issues:[],_maxExposure:0};
      // Currency mismatches are not converted or summed. Review required instead.
      if (currencies.size > 1) add(d,'CURRENCY_MISMATCH','high','Multiple currencies were supplied for this PO/SKU. No currency conversion was attempted.');
      if (!p.length && v.length) add(d,'UNAUTHORIZED_ITEM','high','An invoiced item has no corresponding PO/SKU line.', billedValue);
      if (p.length && v.length && !r.length) add(d,'NO_RECEIPT_RECORD','review','The item was invoiced but no goods-receipt record was provided.');
      if (p.length && r.length && !v.length) add(d,'NOT_YET_INVOICED','info','The item was received but has no invoice in the uploaded period.');
      if (p.length && !r.length && !v.length) add(d,'OPEN_ORDER','info','This purchase-order item has neither a receipt nor an invoice in the uploaded files.');
      if (!p.length && r.length) add(d,'RECEIPT_WITHOUT_PO','review','Goods receipts exist for a PO/SKU not present in the uploaded purchase-order file.');
      if (p.length && v.length && currencies.size <= 1) {
        const uplift = v.reduce((sum,x) => sum + Math.max(0, x.price - agreed - tolerance)*x.qty,0);
        if (uplift > 0.005) add(d,'PRICE_ABOVE_PO','high',`Invoice unit price exceeds the authorized weighted PO unit price (tolerance ${MONEY(tolerance).toFixed(2)}).`,uplift);
        if (billed > ordered + 1e-8) add(d,'BILLED_OVER_ORDER','high',`Billed ${billed} units against ${ordered} ordered units.`,(billed-ordered)*billedUnit);
        if (r.length && billed > received + 1e-8) add(d,'BILLED_OVER_RECEIPT','high',`Billed ${billed} units against ${received} received units.`,(billed-received)*billedUnit);
      }
      if (p.length && r.length && received > ordered + 1e-8) add(d,'RECEIVED_OVER_ORDER','review',`Received ${received} units against ${ordered} ordered units.`);
      const fingerprints = new Set();
      for (const line of v) {
        const fingerprint = `${line.invoice}|${line.po}|${line.sku}|${line.qty}|${line.price}`;
        if (fingerprints.has(fingerprint)) add(d,'POSSIBLE_DUPLICATE_INVOICE_LINE','review',`Identical invoiced line repeated under invoice ${line.invoice}; verify this isn't a legitimate split line.`,line.qty*line.price);
        fingerprints.add(fingerprint);
      }
      if (currencies.size > 1) d._maxExposure=0;
      d.status = d._issues.some(code=> ['PRICE_ABOVE_PO','BILLED_OVER_ORDER','BILLED_OVER_RECEIPT','UNAUTHORIZED_ITEM'].includes(code)) ? 'FLAGGED' :
        d._issues.length ? 'REVIEW' : 'MATCHED';
      if (d.status==='FLAGGED') flaggedKeys++; else if (d.status==='REVIEW') blockedKeys++; else clearKeys++;
      exposure+=d._maxExposure;
      detail.push({...d, riskEstimate:MONEY(d._maxExposure), _issues:undefined, _maxExposure:undefined});
    }
    const issueOrder = {high:0,review:1,info:2};
    issues.sort((a,b)=>(issueOrder[a.severity]-issueOrder[b.severity])||b.exposure_estimate-a.exposure_estimate);
    detail.sort((a,b)=>b.riskEstimate-a.riskEstimate);
    return {summary:{...counts, totalItems:detail.length, flaggedItems:flaggedKeys, reviewItems:blockedKeys, matchedItems:clearKeys, estimate:MONEY(exposure),
      currencies:[...new Set(detail.filter(x=>x.riskEstimate>0).map(x=>x.currency))], issueCount:issues.length},detail,issues,
      disclaimer:'Estimates highlight possible discrepancies; they are not verified refunds or savings. Amounts can be affected by credits, tolerances, taxes, freight, partial periods, contracts and currency. Issues within one PO/SKU can overlap; LineVerity uses the largest estimated issue amount per PO/SKU rather than summing every issue. Review underlying records before contacting vendors or holding payment.'};
  }
  function stringifyCSV(rows,columns) {
    function escape(value) {
      let s = value == null ? '' : String(value);
      // Spreadsheet programs can evaluate CSV cells beginning with formula operators.
      // Treat external text (PO numbers, SKUs, supplier names, explanations) as data.
      if (typeof value === 'string' && /^[\s\uFEFF]*[=+@-]/.test(s)) s = "'" + s;
      return /[\",\r\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
    }
    return [columns.map(escape).join(','),...rows.map(r=>columns.map(c=>escape(r[c])).join(','))].join('\r\n');
  }
  return {parseCSV,guessMapping,convert,reconcile,stringifyCSV,REQUIRED,fields};
});
