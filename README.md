# LineVerity — Zero-upfront invoice matching tool

LineVerity runs entirely in the user's browser: upload purchase orders, accepted receipts, and vendor invoices as CSV, map columns, compare amounts and quantities, and export a review report and vendor-specific packets. This is a functional beta for human review, **not** guaranteed invoice savings or an ERP integration.

## Deploy on a commercial-use-compatible free host

[Deploy LineVerity to Netlify (Free)](https://app.netlify.com/start/deploy?repository=https://github.com/brendenlea05/ai-act-director&branch=lineverity-render-site)

Netlify Free permits commercial static sites and uses hard monthly limits. No credit card required under the Free plan. The link clones the `lineverity-render-site` branch into a new repo and deploys it. The `main` branch of the upstream repository is unrelated and is not part of this site.

See [`USAGE.md`](USAGE.md) for launch checks. The app itself is free, and no checkout or payment collection has been activated.

## Local tests

```bash
node tests/test.js
node tests/packet.test.js
python tests/browser_smoke.py
```

The site has no runtime dependencies or third-party services. It stores no uploaded files on a server.