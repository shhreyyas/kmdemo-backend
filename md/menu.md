# App-Side Integration Guide — Menu Module

> **Platform:** Multi-Business Catering SaaS
> **Scope:** Mobile / Web frontend integration with Menu APIs
> **Prerequisite:** User is authenticated and holds a valid JWT token

---

## Table of Contents

1. [Core Concepts](#1-core-concepts)
2. [App Initialisation Flow](#2-app-initialisation-flow)
3. [Menu List Screen](#3-menu-list-screen)
4. [Create Menu Item Screen](#4-create-menu-item-screen)
5. [Edit Menu Item Screen](#5-edit-menu-item-screen)
6. [Delete Menu Item](#6-delete-menu-item)
7. [Menu Detail Screen](#7-menu-detail-screen)
8. [UX Rules & Guidelines](#8-ux-rules--guidelines)
9. [Suggested UI Patterns](#9-suggested-ui-patterns)
10. [Future Enhancements](#10-future-enhancements)

---

## 1. Core Concepts

The menu system has two visibility tiers. The app must handle them differently at every interaction point.

| Type | Visibility | Editable | Deletable |
|---|---|---|---|
| **Global** | All users | No — edit triggers a private copy | No |
| **Private (My Menu)** | Creator only | Yes | Yes |

> A private copy is created automatically by the backend when a user edits a global item. The original global item is never modified.

---

## 2. App Initialisation Flow

### Step 1 — Fetch Businesses After Login

Immediately after login, fetch the user's businesses to establish the active business context.

**API:** `GET /api/v1/businesses`

Display a **Business Selection Screen** if the user has multiple businesses. Once selected, store the active business ID locally:

```json
{
  "active_business_id": "biz_001"
}
```

---

### Step 2 — Set Business Context Header

Every subsequent API request must include the active business ID as a header:

```http
x-business-id: biz_001
```

> If this header is missing, the backend will reject the request. Ensure it is attached globally via your Axios interceptor or equivalent.

---

## 3. Menu List Screen

**API:** `GET /api/v1/get-menu-list`

### Response Structure

```json
{
  "success": true,
  "data": [
    {
      "id": "menu_1",
      "name": "Paneer Butter Masala",
      "is_global": true
    },
    {
      "id": "menu_2",
      "name": "My Special Dish",
      "is_global": false,
      "created_by_me": true
    }
  ]
}
```

---

### UI Rendering by Item Type

**Global Items (`is_global: true`)**

- Display a `Global` label/badge on the item card
- Show an **"Add to My Menu"** button instead of a standard Edit icon
- Tapping Edit or "Add to My Menu" triggers the copy-on-update flow (see §5)
- Do not show a Delete option

**Private Items (`is_global: false`, `created_by_me: true`)**

- Display a `My Item` label/badge on the item card
- Show Edit and Delete actions
- Both actions are fully available

---

### Filters

Filters can be applied as query parameters:

| Filter | Query Param | Example Values |
|---|---|---|
| Category | `category` | `starter`, `main_course`, `dessert` |
| Food type | `food_type` | `veg`, `non_veg` |

**Example:**

```
GET /api/v1/get-menu-list?category=starter&food_type=veg
```

Render filter controls as **chips or a filter bar** at the top of the list. Active filters should be visually highlighted.

---

### Sorting (Recommended)

Display items in this order to surface the most actionable items first:

1. User's private items (My Items)
2. Global items

---

### Empty States

| Scenario | Message |
|---|---|
| No items at all | "Create your first menu item" with a primary CTA button |
| No items match active filters | "No items match your filters" with a "Clear filters" link |

---

## 4. Create Menu Item Screen

**API:** `POST /api/v1/create-menu`

### Form Fields

| Field | Type | Required |
|---|---|---|
| Name | Text | Yes |
| Price per person | Number | Yes |
| Category | Select | Yes |
| Food type | Select (`veg` / `non_veg`) | Yes |
| Image | URL string (`image_url`) | No |
| Description | Free text (`description`), max 5000 chars | No |
| Ingredients | Dynamic list | No |

### Behaviour

- The item is always saved as private (`is_global: false`).
- **`_id` is auto-generated** by the server (UUID). Do not send `_id` or `id` in the request body.
- `created_by` and `business_id` are set server-side — do not send them in the request body.
- On success, append the new item to the list and scroll to it.

---

## 5. Edit Menu Item Screen

**API:** `PUT /api/v1/update-menu-item/:id`

The edit behaviour differs based on the item type. The backend handles the distinction automatically, but the app must set the correct expectations for the user.

---

### Case 1 — Editing a Private Item

No special handling needed. Send the update request; the item is updated in place.

**Success toast:** `"Item updated successfully"`

---

### Case 2 — Editing a Global Item (Copy-on-Update)

When a user taps Edit on a global item:

1. Optionally show a confirmation prompt: *"This will save a copy to your menu. The original will remain unchanged."*
2. Send the same `PUT /api/v1/update-menu-item/:id` request with the updated fields.
3. The backend creates a new private copy; the original is untouched.

**After success:**
- Show toast: `"Item saved to your menu"`
- Refresh the menu list
- Optionally highlight or scroll to the newly created item

---

## 6. Delete Menu Item

**API:** `DELETE /api/v1/delete-menu-item/:id`

- Show a confirmation dialog before calling the API: *"Are you sure you want to delete this item?"*
- This action is only available on private items (`created_by_me: true`).
- On success, remove the item from the list immediately (optimistic UI) or after the response.

> Never show a Delete option on global items.

---

## 7. Menu Detail Screen

**API:** `GET /api/v1/get-menu-item/:id`

### Display

| Field | Notes |
|---|---|
| Name | — |
| Description | From `description` when present |
| Image | From `image_url` when present |
| Category & food type | Show as badges |
| Ingredients | Itemised list with individual costs |
| Estimated cost | `sum(ingredients[].cost)` |
| Profit | `price_per_person - estimated_cost` |
| Profit margin | `(profit / price_per_person) * 100` — display as `%` |

- For **global items**, show an **"Add to My Menu"** CTA at the bottom instead of Edit/Delete actions.
- For **private items**, show Edit and Delete actions.

---

## 8. UX Rules & Guidelines

### Critical Rules

| Rule | Detail |
|---|---|
| Never allow direct editing of global items | Always treat as copy-on-update. Disable the standard edit flow; show "Add to My Menu" instead |
| Always label item type | Every card must clearly show `Global` or `My Item` so users understand what they are interacting with |
| Confirm before destructive actions | Show a confirmation dialog before any Delete call |

### Error Handling

| Scenario | User-Facing Message |
|---|---|
| Network error | "No internet connection. Please try again." |
| 403 on edit/delete | "You don't have permission to modify this item." |
| 404 on load | "This item no longer exists." |
| 500 server error | "Something went wrong. Please try again later." |

---

## 9. Suggested UI Patterns

### Tab / Chip Filter Bar

Render one of these patterns at the top of the Menu List screen to allow quick filtering:

**Option A — Tabs**

```
[ All Items ]  [ My Items ]
```

**Option B — Chips (Recommended)**

```
[ All ]  [ My Items ]  [ Veg ]  [ Non-Veg ]
```

Chips allow multiple filters to be combined (e.g. My Items + Veg).

---

### Item Card Structure

```
┌──────────────────────────────────────┐
│  Paneer Butter Masala     [Global]   │
│  Main Course • Veg                   │
│  ₹15 / person                        │
│                    [ Add to My Menu ]│
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│  My Special Dish          [My Item]  │
│  Starter • Non-Veg                   │
│  ₹18 / person                        │
│                       [Edit][Delete] │
└──────────────────────────────────────┘
```

---

## 10. Future Enhancements

| Feature | Notes |
|---|---|
| Favourite items | Star/bookmark menu items for quick access |
| Add to Package | Link menu items to quote/package builder (next module) |
| Cost calculator UI | Visual breakdown of ingredient cost vs. selling price |
| Image upload | Attach a photo to a menu item |
| AI menu suggestions | Suggest items based on event type or past usage |

---

## Summary

| Rule | Behaviour |
|---|---|
| Global menu | Read-only; edit triggers a private copy |
| My menu | Fully editable and deletable |
| Other users' items | Never visible — filtered server-side |
| Business context | `x-business-id` header required on every API call |

---

> **Next:** Package Builder UI Flow or Payment Flow Integration