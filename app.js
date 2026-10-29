/* Browser-only UI — deliberately no HTTP requests, analytics, tracking, or local storage. */
(function(){'use strict';
const E=window.LineVerity;
const state={po:null,receipts:null,invoices:null,result:null};
const $=id=>document.getElementById(id);
const files={po:'Purchase orders',receipts:'Goods receipts',invoices:'Invoices'};
// Fictional example records for demonstration only; not customer data.
const samples={
  po:'Purchase Order,SKU,Quantity,Unit Price,Supplier,Currency\nPO-1041,CARTON-12,20,28,Example Supply Co,USD\nPO-1041,LABEL-4X6,10,13,Example Supply Co,USD\nPO-1042,TAPE-CASE,30,9,Example Supply Co,USD\nPO-1043,CARTON-12,6,28,Example Supply Co,USD\n',
  receipts:'Purchase Order,SKU,Received Qty\nPO-1041,CARTON-12,18\nPO-1041,LABEL-4X6,10\nPO-1042,TAPE-CASE,30\nPO-1043,CARTON-12,6\n',
  invoices:'Invoice Number,PO,SKU,Qty,Unit Price,Currency\nBILL-090,PO-1041,CARTON-12,20,31,USD\nBILL-090,PO-1041,LABEL-4X6,10,13,USD\nBILL-091,PO-1042,TAPE-CASE,30,9,USD\nBILL-092,PO-1043,CARTON-12,6,28,USD\nBILL-092,PO-1043,CARTON-12,6,28,USD\n'
};
function setError(message){$('error').textContent=message;$('error').classList.toggle('visible',Boolean(message));}
function setFile(kind,content,label){
  try{const parsed=E.parseCSV(content);if(parsed.count>250000)throw Error('Limit of 250,000 rows per file to protect browser performance.');
    state[kind]={parsed,mapping:E.guessMapping(parsed.headers,kind),label};$('drop-'+kind).classList.add('loaded');$('stat-'+kind).textContent=`✓ ${parsed.count.toLocaleString()} rows · ${label}`;setError('');
    $('mapping').classList.remove('visible');$('results').classList.remove('visible');state.result=null;
  }catch(e){
    // A failed replacement must not leave an earlier CSV silently selected.
    state[kind]=null;state.result=null;
    $('drop-'+kind).classList.remove('loaded');
    $('stat-'+kind).textContent='Choose a valid CSV or drag it here';
    $('mapping').classList.remove('visible');$('results').classList.remove('visible');
    setError(`${files[kind]}: ${e.message}`);
  }
}
for(const kind of Object.keys(files)){
  const input=$('file-'+kind),el=$('drop-'+kind);
  input.addEventListener('change',()=>{if(input.files[0])input.files[0].text().then(text=>setFile(kind,text,input.files[0].name)).catch(e=>setError(e.message));});
  el.addEventListener('dragover',e=>{e.preventDefault();el.classList.add('over');});
  el.addEventListener('dragleave',()=>el.classList.remove('over'));
  el.addEventListener('drop',e=>{e.preventDefault();el.classList.remove('over');const f=e.dataTransfer.files[0];if(f){if(!f.name.toLowerCase().endsWith('.csv'))return setError('Only .csv files are supported.');f.text().then(text=>setFile(kind,text,f.name)).catch(e=>setError(e.message));}});
}
$('demo').addEventListener('click',()=>{for(const kind of Object.keys(files))setFile(kind,samples[kind],'Demo');showMapping();$('run').click();});
$('mapButton').addEventListener('click',showMapping);
function showMapping(){
  if(Object.keys(files).some(k=>!state[k])){setError('Add all three CSV files, or use the demo first.');return;}
  setError('');const host=$('mappingGrids');host.textContent='';
  for(const kind of Object.keys(files)){
    const group=document.createElement('div');group.className='map-group';const title=document.createElement('h3');title.textContent=files[kind];group.appendChild(title);
    for(const field of E.fields[kind]){
      const outer=document.createElement('div');outer.className='map-row';const label=document.createElement('label');label.textContent=field.toUpperCase()+(E.REQUIRED[kind].includes(field)?' *':' (optional)');const select=document.createElement('select');
      select.setAttribute('aria-label',`${files[kind]} ${field}`);
      for(const item of ['',...state[kind].parsed.headers]){const opt=document.createElement('option');opt.value=item;opt.textContent=item||'— not mapped —';select.appendChild(opt);}
      select.value=state[kind].mapping[field]||'';select.addEventListener('change',()=>state[kind].mapping[field]=select.value);
      outer.append(label,select);group.appendChild(outer);
    }host.appendChild(group);
  }
  $('mapping').classList.add('visible');$('mapping').scrollIntoView({behavior:'smooth',block:'nearest'});
}
$('run').addEventListener('click',()=>{
  try{
    setError('');const data={pos:E.convert(state.po.parsed,'po',state.po.mapping),receipts:E.convert(state.receipts.parsed,'receipts',state.receipts.mapping),invoices:E.convert(state.invoices.parsed,'invoices',state.invoices.mapping)};
    const out=E.reconcile(data,{priceTolerance:Number($('tolerance').value)});state.result=out;render(out);
  }catch(e){setError(e.message);}
});
const money = (n,currency) => new Intl.NumberFormat('en-US',{style:'currency',currency:currency==='UNSPECIFIED'?'USD':currency||'USD',maximumFractionDigits:2}).format(n);
function render(result){
  $('demoIndicator').hidden=!['po','receipts','invoices'].every(kind=>state[kind]?.label==='Demo');
  const s=result.summary;const mixed=s.currencies.length>1;
  $('exposure').textContent=mixed?'Mixed currencies':money(s.estimate,s.currencies[0]||'USD');
  $('flagged').textContent=s.flaggedItems;$('review').textContent=s.reviewItems;$('matched').textContent=s.matchedItems;
  const tbody=$('issueTable');tbody.textContent='';
  for(const it of result.issues){const tr=document.createElement('tr');
    const cells=[it.severity.toUpperCase(),it.type.replaceAll('_',' '),it.po,it.sku,it.exposure_estimate?money(it.exposure_estimate,it.currency):'—',it.explanation];
    cells.forEach((x,j)=>{const td=document.createElement('td');td.textContent=x;if(j===0)td.className=it.severity;if(j===1)td.className='issuecode';tr.appendChild(td);});tbody.appendChild(tr);}
  if(!result.issues.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=6;td.textContent='No discrepancies found in these uploaded records with the selected tolerance.';tr.appendChild(td);tbody.appendChild(tr);}
  $('reportDisclaimer').textContent='* '+result.disclaimer+(mixed?' Estimates combine multiple currencies and should NOT be treated as one monetary amount.':'');
  $('results').classList.add('visible');$('results').scrollIntoView({behavior:'smooth',block:'start'});
}
function download(name,contents){const blob=new Blob([contents],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2500);}
$('downloadReport').addEventListener('click',()=>{if(!state.result)return;const cols=['severity','type','po','sku','supplier','invoice_ids','ordered_qty','received_qty','billed_qty','agreed_unit','billed_unit','exposure_estimate','currency','explanation'];download('lineverity_audit_'+new Date().toISOString().slice(0,10)+'.csv',E.stringifyCSV(state.result.issues,cols));});
$('copySummary').addEventListener('click',async()=>{if(!state.result)return;const s=state.result.summary;const text=`LineVerity review\nPO lines: ${s.po}; receiving lines: ${s.receipts}; invoiced lines: ${s.invoices}\nHigh priority groups: ${s.flaggedItems}; review groups: ${s.reviewItems}; matched groups: ${s.matchedItems}\nPossible discrepancy estimate: ${s.estimate} [${s.currencies.join(', ')||'unspecified'}]\nNot verified savings; review the source records before action.`;try{await navigator.clipboard.writeText(text);$('copySummary').textContent='Copied ✓';setTimeout(()=>$('copySummary').textContent='Copy summary',2000);}catch{setError('Clipboard permission was denied. Use the CSV report download instead.');}});
$('packet').addEventListener('click',()=>{if(!state.result)return;try{const html=window.LineVerityPacket.packet(state.result);const blob=new Blob([html],{type:'text/html;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='lineverity_review_packet_'+new Date().toISOString().slice(0,10)+'.html';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);}catch(e){setError(e.message);}});
$('template').addEventListener('click',()=>{for(const kind of Object.keys(files))download(`lineverity_${kind}_example.csv`,samples[kind]);});
})();
