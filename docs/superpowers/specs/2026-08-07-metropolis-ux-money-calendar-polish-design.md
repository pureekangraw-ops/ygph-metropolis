# METROPOLIS UX, Money, and Calendar Polish Design

## Scope

Implement the approved owner ideas in `pureekangraw-ops/ygph-metropolis` only.

1. STORE sale shipping cost
   - Sale gross remains the customer bill and receivable basis.
   - Optional checkbox `มีค่าจัดส่ง` enables a shipping-cost input.
   - Shipping cost is STORE cash OUT, linked to the sale, once only.
   - Example: received sale 500 baht, shipping cost 50 baht => STORE cash effect 450 baht.
   - Shipping cost must not increase the customer bill or receivable.
   - Do not add a dedicated shipping row to the live STORE report UI.

2. Multi-installment obligations
   - `จำนวนงวด = N` with first due date D creates N monthly CALENDAR queues using the same day when possible and the last valid day for shorter months.
   - Existing obligations that declare multiple installments but are missing future queues are reconciled idempotently; completed/cancelled installment queue records count as existing and are never recreated.

3. Calendar mobile cards
   - Selected-date cards must not collapse titles into one-character columns.
   - Amount/status remain readable and action buttons wrap inside the card.
   - Leading decorative row artwork is hidden on compact screens.

4. Launcher interaction
   - The whole app card is the navigation target, so remove the top-right `↗` affordance.

5. Launcher icons
   - Replace the launcher icons with coherent monochrome SVG marks using each app identity color: STORE storefront, RIDE scooter/rider, LEDGER ledger/baht, CALENDAR calendar grid.

6. Import confirmation UX
   - The explicit Review Center action `ตกลง นำเข้าข้อมูล` is the owner confirmation for imported records.
   - Imported new obligation queues are marked locally verified at import time and must not immediately ask for a second `ยืนยันข้อมูลถูกต้อง` modal.
   - This change applies only to queues created by the accepted import; unrelated existing VERIFY queues keep their current safety behavior.

## Constraints

- Preserve encrypted IndexedDB/vault architecture and State Schema 4.
- No direct IndexedDB writes outside the existing commit path.
- Preserve integer satang accounting and action-key idempotency.
- Do not clear site data.
- Keep changes additive where practical; avoid a broad `app.js` refactor.
- Advance the Service Worker release so installed clients can receive the new assets.
