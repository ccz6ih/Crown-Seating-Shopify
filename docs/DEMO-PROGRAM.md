# Crown Seating — 30-Day Demo Program

**Status:** Spec / pre-build. Nothing in the working theme has been changed yet.
**Owner:** Craig
**Last updated:** 2026-06-29

---

## 1. Goal

Let a customer start a **30-day demo** of any stool directly from its product page. The
demo is a **$300** charge (black vinyl only), real shipping calculated at checkout, capped
at **2 demo units** at a time. Every demo order is **tagged `demo`** so HubSpot picks it up
and runs a lifecycle of check-in + end-of-trial emails.

We do this **without touching the working configurator**. All new code is additive and
gated, built and tested on a **duplicated product template** first.

---

## 2. Decisions (locked)

| Decision | Choice | Notes |
|---|---|---|
| Demo price | **$300 flat**, black vinyl only | Not all-in; shipping is separate |
| Shipping | **Existing Shopify shipping rates** (~$97) at checkout | No custom shipping logic to build |
| Modeling | **One `30-Day Demo` product**, $300 black variant | Stool model captured as a line-item property |
| Placement | **Secondary CTA panel on the product page** | New standalone section, added to a duplicated template first |
| 2-stool limit | **Hard cap of 2 demo units** | Enforced in cart JS; server-side function optional (see §7) |
| Order tagging | **Shopify Flow** adds tag `demo` on order create | HubSpot syncs the tag |

### Still to confirm
- **Return shipping policy wording.** End-of-trial: purchase → credit return shipping; or
  return at customer's expense. Confirm the exact promise before it goes in email copy.
- **"30 days from received"** — ideally the clock starts at *delivery*. If delivery date
  isn't flowing into HubSpot, we approximate from the fulfillment/ship date + transit (see §8).
- **Assembled upcharge.** Terms mention an extra fee for assembled demos. Out of scope for v1
  (demos ship unassembled). Flag if you want an assembled option later.

---

## 3. Customer journey

```
Product page
   │  sees "Not ready to buy? Try it for 30 days — $300" panel
   ▼
Clicks "Start a 30-Day Demo"
   │  AJAX adds Demo variant ($300) + properties (model, color=Black, _demo=true)
   │  cart JS checks: total demo units ≤ 2  → else block with message
   ▼
Cart  →  Checkout
   │  pays $300 + existing shipping rate (~$97)
   ▼
Order created
   │  Shopify Flow: line item is the Demo product → add order tag `demo`
   │              → (optional) add customer tag `demo-active`, internal note
   ▼
HubSpot syncs order + contact (tag/property)
   │  enroll in "Demo Program" workflow, clock starts
   ▼
Day 0 welcome → Day ~2 shipped → Day 14 check-in → Day 25 reminder
   → Day 30 end-of-trial (buy w/ return-ship credit, or return) → Day 30+ ops follow-up
```

---

## 4. How the current product page works (context)

- Products `crown-stool` and `crown-stool-arms` use the custom section
  [`crown-product-configurator.liquid`](../sections/crown-product-configurator.liquid)
  via templates `product.crown-stool.json` / `product.crown-stool-arms.json`.
- It is **not** a normal variant picker. "Add to cart" does an **AJAX multi-line
  `/cart/add.js`**: base stool variant + hidden upgrade variants (`upgrade_variant_id`) +
  line-item properties (`Upholstery Material`, `Color`, `Arm Configuration`, etc.).
  See [crown-product-configurator.liquid:748-818](../sections/crown-product-configurator.liquid#L748-L818).
- **Implication for us:** the demo CTA can reuse the exact same `/cart/add.js` pattern. It
  does not need to live inside the configurator — a separate section calling the same
  endpoint is cleaner and keeps the working file untouched.

---

## 5. Shopify admin setup (do this first, no code)

1. **Create the Demo product**
   - Title: `30-Day Stool Demo` (handle `30-day-stool-demo`)
   - Price: **$300.00**
   - Option: `Color` = `Black Vinyl` (single variant)
   - **Charge tax / requires shipping:** requires shipping = **on** (so existing rates apply)
   - **Product type:** `Demo`  **and** add product **tag:** `demo`
   - Inventory: not tracked (or track loosely — it's a program, not stock)
   - Visibility: keep it out of main collections/search; it's added via the button, not browsed
   - **Record the variant ID** → goes into the section setting (§6).
2. **Confirm shipping rates** already cover the demo product's shipping (~$97). No change if
   rates are weight/price based and the demo product has a sensible weight.
3. Leave the existing `page.demo-program.json` for now; we'll update its terms copy at rollout
   (it currently shows the old $200/$300 tiered program — see §10).

---

## 6. Theme build (additive, safe)

### 6a. New standalone section — `sections/crown-demo-cta.liquid`
A self-contained "Try before you buy" panel. **Does not import or modify the configurator.**

Section settings:
- `demo_variant_id` (text) — the Demo product variant ID from §5
- `demo_price` (number, default 300)
- `heading` / `subtext` (text) — e.g. "Not ready to commit?"
- `terms_page` (url) — link to the demo terms page
- `max_demo_units` (number, default 2)
- `color_scheme`

Rendered markup (concept):
```
<section class="crown-demo">
  <h3>Try it in your own space for 30 days</h3>
  <p>$300 demo · ships in black vinyl · shipping calculated at checkout</p>
  <button id="crown-demo-start" data-variant="{{ demo_variant_id }}"
          data-model="{{ product.title | escape }}"
          data-handle="{{ product.handle }}"
          data-max="{{ section.settings.max_demo_units }}">
    Start a 30-Day Demo — ${{ demo_price }}
  </button>
  <a href="{{ terms_page }}">See demo program terms</a>
</section>
```

JS on click (mirrors the configurator's pattern):
1. `fetch('/cart.js')` → sum quantities of demo line items (match by variant id or
   `properties._demo`).
2. If `(existing demo qty + 1) > max` → show inline message
   ("You can demo up to 2 stools at a time"), stop.
3. Else `POST /cart/add.js` with:
   ```json
   {
     "items": [{
       "id": <demo_variant_id>,
       "quantity": 1,
       "properties": {
         "Model": "<product.title>",        // visible — e.g. "Durango C90SS"
         "Upholstery": "Black Vinyl",        // visible
         "Trial": "30 days",                 // visible
         "_demo": "true",                    // hidden — Flow/automation flag
         "_demo_model_handle": "<product.handle>"  // hidden — clean key
       }
     }]
   }
   ```
   Cart/checkout/order line reads cleanly, e.g.:
   ```
   30-Day Demo Stool
     Model: Durango C90SS
     Upholstery: Black Vinyl
     Trial: 30 days
     $300.00
   ```
4. Redirect to `/cart`.

> Properties prefixed with `_` are hidden from the customer in cart/checkout but visible on
> the order — used for `_demo` flagging and the model handle.

### 6b. Duplicated template for testing
- Copy `templates/product.crown-stool.json` → **`templates/product.crown-stool.demo-test.json`**.
- Add the `crown-demo-cta` section to the duplicated template's `order` array.
- Create/assign a **test product** to this template (Admin → product → Theme template →
  `crown-stool.demo-test`). Working products keep their original template → **zero risk**.

### 6c. Rollout (after approval)
- Add the `crown-demo-cta` section to the real `product.crown-stool.json` and
  `product.crown-stool-arms.json` templates.
- Delete the `.demo-test` template (or keep as a staging sandbox).

### Files touched
| File | Change | When |
|---|---|---|
| `sections/crown-demo-cta.liquid` | **new** | Build |
| `templates/product.crown-stool.demo-test.json` | **new** (duplicate) | Build/test |
| `locales/en.default.schema.json` | add section schema strings | Build |
| `templates/product.crown-stool.json` | add section to `order` | Rollout only |
| `templates/product.crown-stool-arms.json` | add section to `order` | Rollout only |
| `crown-product-configurator.liquid` | **none** | — |

---

## 7. The 2-stool limit — depth options

- **v1 (theme JS):** check `/cart.js` before adding; block if it would exceed 2. Also cap
  quantity on the cart line. Good enough for honest users; can be bypassed by a determined
  user editing requests.
- **v2 (bulletproof, optional):** a **Shopify cart/checkout validation Function** that
  rejects checkout when demo line items > 2. Server-side, can't be bypassed. Build only if
  abuse becomes real.

---

## 8. Order tagging — Shopify Flow (no code)

Flow: **`Tag demo orders`**
- **Trigger:** Order created
- **Condition:** any line item where `product.hasTag "demo"` is true (or `product.type == "Demo"`)
- **Actions:**
  1. Add **order tag** `demo`
  2. (optional) Add **customer tag** `demo-active`
  3. (optional) Add order note: `Demo program — clock starts at delivery`

HubSpot's Shopify connector syncs orders and contacts; the `demo` tag (or a synced order
property) is the **enrollment trigger** for the workflow in §9.

---

## 9. HubSpot lifecycle (config, not theme code)

Enroll contacts whose order has tag `demo`. Clock = delivery date if available, else
ship date + estimated transit (§2 open item).

| Day | Email | Purpose |
|---|---|---|
| 0 | **Welcome / what to expect** | Confirm demo started, terms, how to reach a rep |
| ~2 | **Shipped** | Tracking; assembly note (ships unassembled) |
| **14** | **Check-in** *(the "two-week" touch you asked for)* | How's the fit? Buy / swap / return options; offer a call |
| 25 | **5 days left** | Gentle reminder of options + dealer discount |
| **30** | **Trial ending** | Purchase (return shipping credited) **or** return at own expense; dealer discount if buying within 2 weeks |
| 30+ | **Ops follow-up** *(internal task, not auto-charge)* | If not returned/purchased: rep follows up; charge full retail per terms only after human review |

> Recommend the Day 30+ step be an **internal task**, not an automated charge — auto-charging
> a card for "full retail" is a chargeback/PR risk. Keep a human in the loop.

Emails: send from HubSpot for tracking/enrollment, or from Shopify/Klaviyo if that's where
sending lives today — confirm which system owns transactional vs marketing sends.

---

## 10. Retire / update the old demo page

`templates/page.demo-program.json` currently states the **old** program: $200 continental /
$300 AK-HI-PR-Canada, customer pays return shipping, "charged full retail if not returned in
30 days." At rollout, rewrite this page to match the new $300 + live-shipping program and the
confirmed return policy. Keep the link target for the section's "See terms" button pointing here.

---

## 11. Testing plan

1. **Add-to-cart:** demo button adds the $300 variant with all properties; cart shows model +
   "Black Vinyl"; `_demo` hidden from customer but present on the draft order.
2. **2-stool cap:** add 2 demos → 3rd is blocked with the message; cap holds across different
   product pages (same cart).
3. **Shipping:** checkout shows the existing shipping rate (~$97) on top of $300.
4. **Flow tagging:** place a test order → confirm order tag `demo` appears; confirm it reaches
   HubSpot.
5. **HubSpot enrollment:** test contact enrolls; Day-0 email fires; timeline offsets correct.
6. **Working page untouched:** original stool product pages and configurator behave exactly as
   before (regression check on a normal product).
7. **Mobile + scheme:** CTA panel responsive and on-brand.

---

## 12. Rollout checklist

- [ ] Demo product created, variant ID recorded, tagged `demo`
- [ ] `crown-demo-cta.liquid` built + schema strings added
- [ ] Duplicated template tested with a test product
- [ ] Shopify Flow live and verified end-to-end
- [ ] HubSpot workflow built, email copy approved (return policy confirmed)
- [ ] Old demo-program page rewritten to new terms
- [ ] Section added to real `product.crown-stool` + `product.crown-stool-arms` templates
- [ ] Final regression on a live product page
- [ ] Remove `.demo-test` template

---

## 13. What Claude can build vs. what you do in admin

| Claude (in this repo) | You (Shopify/HubSpot admin) |
|---|---|
| `crown-demo-cta.liquid` section + JS | Create Demo product, record variant ID |
| Duplicate template, schema strings | Assign test product to the template |
| Rewrite demo-program page copy | Build Shopify Flow (`demo` tag) |
| Email copy drafts (MD) | Build HubSpot workflow + connect emails |
| Optional Shopify validation Function | Confirm shipping rates cover the demo |
```
