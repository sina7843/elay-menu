# Coverage report — handoff → implementation

Sources audited: `handoff/docs/handoff.md` (product authority), `handoff/docs/brand-book.md`, the 28 screens in
`handoff/screens/html|png`, and the 46 components in `handoff/design-system`. Where they disagreed, the stated
authority order was applied (handoff.md for behaviour, tokens/CSS for visuals). Paths are relative to `apps/web/src`
unless noted. Test files: `apps/web/e2e/customer.spec.ts` (C), `stall-admin.spec.ts` (S), `super-admin.spec.ts` (SA),
API tests `apps/api/test/*.test.ts` (API), shared unit tests `packages/shared/src/*.test.ts` (U).

Status legend: **Done** = implemented on live API data and covered by the listed tests; **Done (visual)** = also
compared by eye with the reference PNG at 390 px, using screenshots of the running app (`SCREEN_DIR=… npm run screens
-w @elay/web`). There is no automated pixel comparison.

## Screens (28)

| # | Reference | Route | Source | Tests | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | Main | `/` | `customer/views/HomeView.vue` | C: main page order, cart | Done (visual 390/320/1024) |
| 2 | Editorial-Category | `/category/:id` | `customer/views/CategoryView.vue` | C: category chips | Done (visual) |
| 3 | Editorial-Stall | `/stall/:id` | `customer/views/StallView.vue` | C: closed/open stall, S: hours | Done (visual) |
| 4 | Editorial-Order | `/order` | `customer/views/OrderView.vue` | C: order list, sold-out/deleted | Done (visual) |
| 5 | Cust-Deals | `/deals` | `customer/views/PromoListView.vue` | C: discounts | Done |
| 6 | Cust-Popular | `/popular` | `customer/views/PromoListView.vue` | C: main page (rail), API popularity | Done |
| 7 | Cust-Search | `/search?q=` | `customer/views/SearchView.vue` | C: search | Done |
| 8 | Cust-NoResult | `/search?q=` (no hits) | `customer/views/SearchView.vue` | C: search | Done |
| 9 | Cust-Filter | sheet on `/` and `/search` | `customer/components/FilterSheet.vue` | C: filter sheet | Done (visual) |
| 10 | Cust-EmptyOrder | `/order` (empty) | `customer/views/OrderView.vue` | C: order list | Done |
| 11 | Cust-ClosedStall | `/stall/:id` (closed) | `customer/views/StallView.vue` | C: closed stall | Done |
| 12 | Cust-Loading | any customer route while loading | `customer/components/MenuSkeleton.vue` | C: 8 s timeout | Done |
| 13 | Cust-Offline («منو باز نشد», first-load failure) | any customer route | `customer/CustomerLayout.vue` | C: first load failure, timeout | Done (visual) |
| 14 | Cust-Unavailable (global closure) | every customer route | `customer/CustomerLayout.vue` | C: global closure, SA: settings | Done (visual) |
| 15 | Admin-Login (shared) | `/admin/login` | `views/AdminLogin.vue` | S: role redirects | Done (visual) |
| 16 | Admin-Empty | `/admin/stall` (no foods) | `admin/stall/FoodsView.vue` | S: first run | Done (visual) |
| 17 | Admin-Foods | `/admin/stall` | `admin/stall/FoodsView.vue` | S: availability, delete | Done (visual) |
| 18 | Admin-FoodForm | `/admin/stall/foods/:id` | `admin/stall/FoodFormView.vue` | S: discount | Done (visual) |
| 19 | Admin-FoodNew | `/admin/stall/foods/new` | `admin/stall/FoodFormView.vue` | S: first run (validation) | Done (visual) |
| 20 | Admin-Crop | overlay in food form / logo upload | `admin/components/ImageCropper.vue` | S: first run, SA: create stall | Done (visual) |
| 21 | Admin-Dialog | overlay in food form | `admin/stall/FoodFormView.vue` | S: delete dialog | Done (visual) |
| 22 | Admin-Categories | `/admin/stall/categories` | `admin/stall/CategoriesView.vue` | S: categories | Done (visual) |
| 23 | Admin-Stall | `/admin/stall/profile` | `admin/stall/ProfileView.vue` | S: hours | Done (visual) |
| 24 | Admin-Account | `/admin/stall/account` | `admin/stall/AccountView.vue` | S: change password | Done (visual) |
| 25 | SA-Stalls | `/admin/super` | `admin/super/StallsView.vue` | SA: list/create | Done (visual) |
| 26 | SA-StallForm | `/admin/super/stalls/new`, `/admin/super/stalls/:id` | `admin/super/StallFormView.vue` | SA: create, reset, edit, delete | Done (visual) |
| 27 | SA-Categories | `/admin/super/categories` | `admin/super/CategoriesView.vue` | SA: categories | Done (visual) |
| 28 | SA-Settings | `/admin/super/settings` | `admin/super/SettingsView.vue` | SA: settings | Done (visual) |

The offline **Banner** (cached menu shown without a fresh copy) is a component state, not one of the 28 screens:
`customer/components/CustHeader.vue`, tests C: offline cached menu, real offline reload (service worker).

## Components (46)

All 46 root classes from `design-system/components/bundle.css` are used by the app (checked by scanning `apps/web/src`):

| Component | Used in |
| --- | --- |
| Header, Banner | `customer/components/CustHeader.vue` |
| SearchField | `customer/components/SearchField.vue` |
| CategoryTabs | `customer/views/StallView.vue` |
| OrderBar | `customer/components/OrderBar.vue` |
| Button | customer and panel views |
| QuantityControl | `customer/components/AddControl.vue`, `customer/views/OrderView.vue` |
| StallFilterChip, CategoryHeader | `customer/views/CategoryView.vue` |
| Switch | `FilterSheet.vue`, `admin/components/PanelSwitch.vue` (all panel switches) |
| FilterSheet | `customer/components/FilterSheet.vue` |
| CategoryTile, StallTile, StallChip | `customer/components/*.vue` |
| SectionHeader, PromoSection, FoodCard | `customer/views/HomeView.vue`, `PromoListView.vue`, `FoodCard.vue` |
| FoodImage | `customer/components/FoodImage.vue` (also every panel food preview) |
| FoodRow, PriceTag, Badge | `customer/components/FoodRow.vue`, `PriceTag.vue`, `StallView.vue` |
| StallHeader, ClosedNotice, Divider | `customer/views/StallView.vue` |
| OrderGroup, OrderNotice | `customer/views/OrderView.vue` |
| EmptyState, Skeleton | customer layout/views, panel layouts |
| Dialog | order clear-list, food delete, stall reset/delete |
| Toast | `admin/components/AdminToast.vue` |
| AdminHeader, AdminTabBar | `admin/stall/StallLayout.vue`, `admin/super/SuperLayout.vue` |
| AdminFoodRow, SetupSteps | `admin/stall/FoodsView.vue` |
| FormField, ActionBar, CategoryPicker | panel forms |
| ImageUploader, ImageCropper | `FoodFormView.vue`, `admin/components/LogoUpload.vue`, `ImageCropper.vue` |
| AccountMenu | `admin/components/AccountPanel.vue` |
| SortableList | `admin/components/SortableList.vue` |
| WorkingHours | `admin/stall/ProfileView.vue` (+ `TimeSelect.vue`) |
| StallCard, CredentialBox | `admin/super/StallsView.vue`, `StallFormView.vue` |
| IconPicker | `admin/super/CategoriesView.vue` |
| LoginForm | `views/AdminLogin.vue` |

## handoff.md rules

| Section / rule | Implementation | Tests |
| --- | --- | --- |
| QR opens the first page; menu URL never changes, read-only in settings | `PUBLIC_MENU_URL` deployment config, shown read-only (`SettingsView.vue`, API `/api/admin/foodcourt`); no QR generation | API: unconfigured (null) and configured value returned read-only, PUT with `publicMenuUrl` rejected; SA settings: unconfigured warning |
| No table, table number or order submission | No such data or endpoints; order list is device-only | C: order list stores ids/quantities only |
| Customer screens table (14) | Screens 1–14 above | C |
| Data: foodcourt, stall, account, categories, food, local order item, add counter | `packages/shared/src/schemas.ts`, `apps/api/src/db.ts` | U, API |
| Order list: + becomes stepper; trash at 1 in the list; survives closing the page | `cart.ts`, `AddControl.vue`, `OrderView.vue` | C: order list |
| Payment: grouped per stall, read to that stall's cashier, «تعداد ×» first | `OrderView.vue` | C: order list |
| Discount: price × (1 − percent) rounded to 1,000; old price struck; only between dates | `packages/shared/src/money.ts` (never above original), server pricing | U, API menu, C: discounts, S: discount |
| Sold out: stays in lists, not in rails/«همه» pages; same state in the order list | API `loadMenu`/`topFive`, `FoodRow.vue`, `OrderView.vue` | API menu, C: sold out |
| Closed stall: dimmed tile «بسته»; menu visible, «سفارش از [ساعت]» instead of + | `StallTile.vue`, `AddControl.vue`, `StallView.vue` | C: closed stall |
| Popular: max 5 ranked by 7-day adds; anonymous counter only | API `weeklyAdds`/`topFive`, `/api/public/popularity`, `cart.ts` | API popularity, C |
| Search: food, description, stall, category; ی/ي, ک/ك, ZWNJ ignored | `packages/shared/src/search.ts`, API search, offline fallback | U, API search, C: search |
| Photos square (cropper); transparent photo fills tint tile | `ImageCropper.vue`, API media pipeline | API media, S: first run |
| Loading skeleton, «منو باز نشد» after 8 s, offline Banner, closed menu screen only | `menu.ts`, `CustomerLayout.vue`, `public/sw.js` | C: timeout, offline, closure |
| Stall panel table (Login … Account) | Screens 15–24 | S |
| Super panel table (Stalls, StallForm, Categories, Settings) | Screens 25–28 | SA |
| Availability switch saves at once with Toast | `FoodsView.vue` (rollback on failure) | S: availability |
| Discount 1–90 %, Jalali dates, live rounded preview, auto-off after end date | `FoodFormView.vue`, shared rules | S: discount, U |
| Category with foods cannot be deleted; stall delete removes foods and manager | API 409, `delete-stall.ts`; dialogs state the effects | API admin, S/SA categories, SA delete |
| Temporary password shown once; «رمز تازه» invalidates the old one; forgotten password → super admin | API reset, `StallFormView.vue` credential box, `AccountPanel.vue` | API admin, SA reset |
| Change password: current, new (≥ 8, letters + digits), confirm; save disabled until confirmed | `AccountPanel.vue`, shared `ChangePasswordInputSchema` | S/SA password |
| «الان باز است» switch inverts state until the next working interval | shared `overrideFor`, `ProfileView.vue` | U, API admin, S: hours |
| Stall without foods hidden from customers | API `loadMenu` | API menu, S first run, SA create |
| Save buttons show «در حال ذخیره…» with `el-spinner` and cannot be pressed twice | all panel forms (`busy` guards, disabled while pending) | not tested directly |

## brand-book.md

| Topic | Implementation |
| --- | --- |
| Persian RTL, `dir="rtl" lang="fa"`, Persian digits with «٬» | `index.html`, `App.vue`, `customer/format.ts` (`Intl` fa-IR) |
| Rokh FaNum only, metric overrides (ascent 94 %, descent 34 %, line gap 0) | `styles/fonts/rokh.css` (copied verbatim), fonts bundled in images |
| Tokens and component CSS | `styles/tokens.css`, `styles/bundle.css` (copied); app-only rules in `styles/app.css` |
| 390 px reference, 480 px max column, side padding `space-4` | `.app-column`, fixed bars constrained to the column |
| Sharp corners; pill only for touch controls; shadows only on promo cards/plates | bundle CSS unchanged |
| Header zigzag only under the header; panels without zigzag | `CustHeader.vue`, `ad-top` |
| Accent usage, section colours, open/closed always with a word | bundle CSS + views |
| Logo tiles on `plate`, never round; stall chip next to food outside its stall page | `StallTile`, `StallChip`, `FoodRow showStall` |
| No-photo tribal tiles | `FoodImage.vue` (three handoff variants by food id) |
| Touch targets ≥ 44 px, focus ring | C keyboard test scans five pages; app.css fixes for short tabs, «همه» links, outline stepper |
| Panels: AdminTabBar, ActionBar in forms, accent FAB, delete last with dialog, Toast after save | panel layouts and forms |
| Icons inline with `currentColor`, no emoji | `components/ElIcon.vue` |

## Deliberate differences (with reason)

- Search page shows the filter button next to the clear button (reference shows clear only) so filters stay reachable.
- Hours use a quarter-hour select (44 px tall; reference box 36 px): touch targets, and «۲۴:۰۰» cannot be entered in a native time input.
- Stall-panel note drops «رنگ کاشی لوگو»: handoff.md states there is no logo tile colour.
- Crop has drag, slider, wheel and keys; no rotate button or pinch.
- Temporary passwords are displayed in a Latin monospace font and digits are accepted in either script (Rokh FaNum draws ASCII digits as Persian).
- Customer header shows the foodcourt logo from settings when one is uploaded (SA-Settings: «در هدر همه‌ی صفحه‌های منو می‌آید»), otherwise the bundled Elay logo.
