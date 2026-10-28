# LineVerity — Netlify launch instructions

LineVerity is a static browser-based CSV invoice checker. There is **no backend**. Do not upload private customer CSVs to hosting, GitHub, support email or analytics. Client-side data never needs to leave the browser.

1. Sign into Netlify using the owner-authorized business Google account or GitHub OAuth, choose **Free**. Do **not** activate a paid plan or enter a payment card.
2. This project is deployed from branch `lineverity-render-site` of `brendenlea05/ai-act-director` (the branch contains only LineVerity site files; the unrelated `main` branch is not a deployment target).
3. Publish directory: `.` (root); build command: blank; framework: none.
4. After deploy, open `/`, `/guides/three-way-match.html`, `/engine.js` and `/app.js`. Run the embedded demo, check it reports a possible $230 discrepancy, download the review packet, then test the site on mobile.
5. Record the actual Netlify URL, use it to generate a sitemap and add canonical references, then submit the site to Google Search Console using an owner-authorized Google account. Indexing and customers are not guaranteed.
6. No checkout is present. Do not advertise paid features or publish a payment link before merchant identity and secure automatic delivery are active and verified.

Monthly Netlify Free limits are hard-capped; traffic growth may pause the website until the quota refreshes. Zero spending is prioritized above uninterrupted hosting.

Support address: brendenlea05ai@gmail.com.