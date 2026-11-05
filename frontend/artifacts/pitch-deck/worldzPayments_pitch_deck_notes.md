# worldzPayments — pitch deck speaker notes

Prepared from the current product source and brand guidelines. November 2026.

## 1. Get paid. Keep your keys.

WorldzPayments is a merchant payment workspace built around wallet ownership and verifiable settlement on NEAR. Introduce the product as an implemented software build seeking pilot validation, not as audited or scaled production infrastructure.

## 2. The problem

These are the merchant workflow problems the product is designed to address. They are product hypotheses, not findings from a quantified customer survey. Avoid claiming research or adoption that has not been supplied.

## 3. The solution

The product combines the merchant interface and payment flow. The merchant service verifies payout completion; the routing contract may temporarily hold order funds while asynchronous payout legs execute. Do not describe it as funds never entering a contract.

## 4. Target merchants

This is a proposed initial customer profile and market-entry wedge. The deck does not present a market-size estimate because no validated sizing or merchant research was supplied. Begin with businesses and customers already able to use NEAR wallets.

## 5. The merchant product

Show the current merchant dashboard. All screenshot activity is fixture data and must not be presented as traction, actual payment volume or customer count. The app also includes payment links, payment history, analytics, settings and documentation.

## 6. The customer experience

The receipt is a product-consistent illustration, not a live customer transaction. Both the displayed receipt and PDF share a data model. Payer names are optional, customer-supplied details; the payer wallet is recorded independently. Merchant fees and net amounts remain available in the dashboard rather than the customer receipt.

## 7. Settlement architecture

This reflects the signed-order protocol and current service implementation. The backend checks transaction/receipt results and reconciles router state and payout legs. Do not imply instant or guaranteed settlement, zero smart-contract risk, or a completed independent security audit.

## 8. Developer adoption

The documentation now covers 18 product and developer topics with copyable examples and a downloadable guide. The source client is included in this repository. There is no separately packaged npm SDK, and issuing a key in Settings does not currently enable Bearer auth on merchant endpoints.

## 9. Revenue model

The code defines a 30-basis-point default fee and a 500-basis-point protocol cap. Illustrative fees are simply processed volume multiplied by 0.003. These are gross fees, not net revenue or profit. No adoption, take-rate optimization or revenue history is being asserted.

## 10. Positioning

Frame this as a comparison of approaches rather than a sweeping claim about competitors. Other services may offer similar capabilities; no competitor pricing, market share or feature benchmark has been validated for this deck.

## 11. Go-to-market

This is a proposed distribution plan, not a report of existing partnerships or customer acquisition performance. No partner logos, paid relationships or signed pilot commitments are implied.

## 12. Current build and launch gates

Distinguish implemented code from deployed and independently validated readiness. The repository contains frontend, backend, protocol, router and tests, but deployment configuration and complete live wallet validation are separate concerns. Any live results should be added only when supported by evidence.

## 13. Roadmap

All roadmap items are proposed. The existing product offers fixed-amount payment links, not a standalone invoice builder or recurring subscriptions. Public SDK packaging, Bearer/API-key auth, fulfilment connectors and broader reporting require additional implementation and validation. Shopify checkout and walletless fiat checkout are planned expansion tracks; the next slide records their engineering estimates and external dependencies.

## 14. Checkout expansion roadmap

Both integrations were added to the roadmap at the owner's request and are not current product capabilities. Shopify scope: NEAR appears as a payment method inside Shopify checkout. Estimate: 4–8+ weeks of engineering, plus Shopify partner access, review and approval time. Walletless scope: the buyer pays fiat via card or bank without connecting a NEAR wallet. Estimate: several more weeks, depending on the payment provider, custody/settlement model and approvals. No fixed launch dates or approval guarantees are implied.

## 15. Mobile app roadmap

The owner requested a mobile app on the roadmap. The proposed scope is a merchant-focused iOS and Android experience for creating and sharing payment links, reviewing payment history and receipts, payment notifications and NEAR wallet connectivity. This is planned work, not a shipped app. No delivery estimate was supplied, so scope and timeline remain to be defined after discovery. The mobile app does not itself imply walletless fiat checkout; that is a separate roadmap track.

## 16. Pilot success measures

These are proposed measurement categories, not actual KPI values. Do not substitute sample dashboard counts or fee illustrations for real traction. Measure success using reliable settlement and repeat merchant usage.

## 17. The pilot ask

Default ask: early merchant pilots and ecosystem/developer collaboration. No fundraising amount, founder biography, email address, revenue or team claim has been invented. Add the owner's chosen contact details and any evidence-backed fundraising ask before an investor-specific send-out.

## Source basis

- Product guide: frontend/src/lib/docs/content.ts
- Brand selection and geometry: frontend/src/lib/brand.ts
- API and session behavior: backend/src/api.rs and backend/src/auth.rs
- Settlement protocol: docs/near-signed-order-v1.md and backend/src/orders.rs
- Default fee: crates/near-protocol/src/lib.rs (DEFAULT_FEE_BPS = 30)
- Webhook delivery: backend/src/webhooks.rs
- Receipt contents: frontend/src/lib/near/receipt-details.ts

All product screenshots and sample receipts use illustrative data. Distribution, roadmap and pilot metrics are proposals. Revenue arithmetic is illustrative, not a forecast. Founder/contact details and any fundraising target were not supplied; no such details have been invented.
