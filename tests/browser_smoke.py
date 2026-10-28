"""Optional browser smoke test (requires playwright and Chromium installed)."""
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text()
for name in ['engine','packet','app']:
  html=html.replace('<script src="'+name+'.js"></script>','<script>'+(root/(name+'.js')).read_text()+'</script>')
with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'])
  page=browser.new_page(viewport={'width':1365,'height':900}, accept_downloads=True)
  errors=[]
  page.on('pageerror',lambda err:errors.append(str(err)))
  page.set_content(html,wait_until='domcontentloaded',timeout=12000)
  page.locator('#demo').click()
  page.locator('#results.visible').wait_for(timeout=5000)
  assert page.locator('#exposure').inner_text()=='$230.00'
  assert page.locator('#flagged').inner_text()=='2'
  assert page.locator('#issueTable tr').count()==5
  with page.expect_download() as download_info:
    page.locator('#packet').click()
  download=download_info.value
  assert download.suggested_filename.startswith('lineverity_review_packet_'),download.suggested_filename
  with page.expect_download() as csv_info:
    page.locator('#downloadReport').click()
  assert csv_info.value.suggested_filename.endswith('.csv')
  assert not errors,errors
  print('PASS: browser workflow, $230 estimated discrepancy, 2 flagged groups and 5 issue rows; no JS errors')
  browser.close()
