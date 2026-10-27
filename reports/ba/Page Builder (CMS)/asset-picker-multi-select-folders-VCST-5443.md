# Documentation — VCST-5443: Asset Library picker in the Designer (multi-select, folders) + Image carousel

In the Page Builder **Designer** you can now choose several images at once for a block that shows a set of images, create folders without leaving the page, and upload several files in one go. A new **Image carousel** section uses multi-select to build a slide show from the images you pick.

## For administrators

**Open the picker:** open a page in the **Designer** → select a section → on its **Content** tab click **Choose from Asset Library or drag and drop here**.

### Add an image carousel
1. In the Designer, add the **Image carousel** section.
2. On the **Content** tab, under **Images**, click **Choose from Asset Library or drag and drop here**.
3. Click every image you want. A selected image shows a check mark in its corner, and the footer shows how many are selected, e.g. **3 selected**. Click an image again to unselect it.
4. You can open other folders while selecting; the images you already picked stay selected.
5. Click **Select**. The images are added in the order you clicked them, and each one becomes a slide.
6. Click **Save**.

To add more images later, open the picker again and select them: they are added after the existing ones.

### Create a folder from the picker
1. In the picker, click **New folder** (next to **Upload**).
2. Enter a name and press **Enter** or click ✓. Click ✕ or press **Esc** to cancel.
3. The picker opens the new folder, and files you upload now go into it. Images you had already selected stay selected.

### What changed

| Field / control | What it does | Example |
|---|---|---|
| **Image carousel** section (new) | Shows the selected images as slides with previous/next arrows | Title, Subtitle, Images, Slide height |
| **Images** (Image carousel) | Takes several images; the picker opens in multi-select mode | 4 images → 4 slides |
| **Slide height** | Height of the slides | Auto, Small, Medium, Large |
| **New folder** (picker toolbar) | Creates a folder in the current folder | `summer sale` |
| Folder name rules | Same as the Assets library: 3–63 characters, lowercase letters, numbers, spaces and single dashes; no dash at the start or end | `summer-sale` is accepted, `Summer` is rejected |
| **Upload** (picker toolbar) | Uploads several files at once. In a single-image field the last uploaded file is selected | 3 files in one pass |
| Single-image fields (Image, Slider, Features, Call to Action with Image) | Unchanged: one image; clicking another image replaces the choice | — |
| Permissions | **Upload** and **New folder** are shown only to users with the `platform:asset:create` permission; others can still choose existing images | — |

## For developers

A section setting of type `images` opens the Designer picker in multi-select mode when it declares `"multiple": true`. Without it (the default), the picker allows one image. The new storefront section `client-app/plugins/builder-preview/schemas/sections/image-carousel.json` is the first theme section that uses it:

```json
{
  "id": "images",
  "label": "Images",
  "type": "images",
  "multiple": true,
  "tab": "Content"
}
```

The page content stores a multi-image setting as an **array of asset URLs in selection order**, and a single-image setting as one URL string:

```json
"type": "image-carousel",
"height": "auto",
"images": [
  "{{ASSET_BASE}}/stores/B2B-store/Page Builder/folder-x/x3-blue.png",
  "{{ASSET_BASE}}/stores/B2B-store/Page Builder/folder-x/x1-red.png"
]
```

Folders are created with the existing `POST {{BACK_URL}}/api/assets/folder` endpoint (body `{ "name", "parentUrl" }`, response `204`); no new backend endpoint was added.

---
*VCST-5443 · verified on vcst-qa (PageBuilderModule PR #166 + theme PR #2595) · verdict: PASS WITH NOTES ·
Not documented: narrow/mobile widths (the Designer has no mobile layout); file-list (`files`) controls (no theme section uses one); picker label localization (English only, out of scope) ·
Evidence: `reports/tickets/Sprint26-20/VCST-5443/` · Audiences derived from layer `admin-spa`, plus developer for the new `multiple` schema key*
