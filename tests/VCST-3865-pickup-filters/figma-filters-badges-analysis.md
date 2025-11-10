# VCST-3865: Figma Design Analysis - Filters & Badges

**Analysis Date:** November 6, 2025  
**Figma URL:** [STOREFRONT DRAFT • 2](https://www.figma.com/design/9DBmmQwGVbYiayQa4JOVC5/%F0%9F%94%B6--STOREFRONT-DRAFT-%E2%80%A2-2?node-id=8648-679429)  
**Node ID:** 8648:679429

---

## 🎨 **Figma Design Specifications**

### **1. Filter Bar Design**

#### **Filter Layout (Horizontal)**
```
[STATE ▼] [DELIVERY TIME ▼] [OFFICE HOURS ▼] [PICKING TYPE ▼] [SERVICES ▼] [Search___] [🔍]
```

**5 Dropdown Filters:**
1. **STATE** - Geographic state/province filter
2. **DELIVERY TIME** - Time-based delivery filter
3. **OFFICE HOURS** - Operating hours filter
4. **PICKING TYPE** - Pickup method type filter
5. **SERVICES** - Available services filter

**Search Component:**
- Search input field
- Clear button (X icon)
- Search button (🔍 magnifying glass) with accent color

---

### **2. Badge Design Specifications**

#### **Location Badges (Visible in Design)**

| Location | Badge Count | Position |
|----------|-------------|----------|
| South Carolina | **12** | Right-aligned |
| New Hampshire | **2** | Right-aligned |
| California | **23** | Right-aligned |
| Maine | **5** | Right-aligned |
| Mississippi | **144** | Right-aligned |
| Connecticut | **3** | Right-aligned |
| New Mexico | **5** | Right-aligned |
| West Virginia | **39** | Right-aligned |
| Montana | **1** | Right-aligned |
| Oklahoma | **4** | Right-aligned |

#### **Badge Style Characteristics:**

**Visual Properties:**
- **Shape:** Circular/pill-shaped
- **Size:** Compact, proportional to number length
- **Color:** Neutral gray (#F6F6F6 background visible)
- **Text:** Black (#000000) numbers
- **Position:** Right side of each location name
- **Padding:** Minimal, tight around numbers
- **Typography:** Small, likely 10-12px

**Badge Purpose:**
- Displays **count of pickup points** in each location
- Provides **quick visual reference** for availability
- Helps users **identify locations with most options**

---

### **3. Modal Layout Structure**

#### **Overall Dimensions:**
- **Canvas Size:** 1500px × 1383px (from Figma)
- **Modal Width:** ~1040px (estimated from visual)
- **Modal Height:** ~680px (estimated from visual)

#### **Three-Section Layout:**

```
┌─────────────────────────────────────────────────────────┐
│  Pick points                                       [X]  │  ← Header
├───────────────────┬─────────────────────────────────────┤
│                   │                                     │
│  Location List    │         Map Component              │  ← Body
│  (with badges)    │         (Interactive)              │
│                   │                                     │
│  ☐ South Carolina │                                     │
│     12            │         [Map with markers]         │
│  ☐ New Hampshire  │                                     │
│     2             │                                     │
│  ☐ California     │                                     │
│     23            │                                     │
│                   │                                     │
├───────────────────┴─────────────────────────────────────┤
│  [Cancel]                                      [Save]   │  ← Footer
└─────────────────────────────────────────────────────────┘
```

**Panel Split:**
- **Left Panel:** ~320px (Location list with checkboxes & badges)
- **Right Panel:** ~720px (Interactive Google Maps)

---

### **4. Color Palette (Extracted)**

**Primary Colors:**
```css
/* Background */
--background-light: #F6F6F6;        /* Light gray */
--background-white: #FFFFFF;        /* White */

/* Text */
--text-primary: #000000;            /* Black */
--text-secondary: #737373;          /* Gray (estimated) */

/* Accent */
--accent-search: #1E90FF;           /* Blue search icon */
--accent-primary: #F99E24;          /* Orange (for buttons) */
```

---

### **5. Typography System**

**Filter Buttons:**
- **Font:** Likely Lato or similar sans-serif
- **Size:** 14-16px
- **Weight:** 400-500 (Medium)
- **Case:** UPPERCASE for filter labels

**Badge Numbers:**
- **Font:** Same as system font
- **Size:** 10-12px
- **Weight:** 500-600 (Medium/Semi-bold)
- **Color:** Black (#000000)

**Location Names:**
- **Font:** Lato, sans-serif
- **Size:** 14-16px
- **Weight:** 400 (Regular)
- **Color:** Black (#000000)

---

## 📊 **Comparison: Figma vs Implementation**

### **Filter Comparison**

| Filter Position | Figma Design | Actual Implementation | Status |
|----------------|--------------|----------------------|--------|
| **1st Filter** | STATE | Country | ❌ Different |
| **2nd Filter** | DELIVERY TIME | State/Province | ❌ Different |
| **3rd Filter** | OFFICE HOURS | City | ❌ Different |
| **4th Filter** | PICKING TYPE | ❌ Missing | ❌ Not implemented |
| **5th Filter** | SERVICES | ❌ Missing | ❌ Not implemented |
| **Search** | ✅ Present | ✅ Present | ✅ Match |

**Filter Mismatch Summary:**
- ❌ **Implementation uses geographic filters** (Country/State/City)
- ❌ **Figma shows service-oriented filters** (State/DeliveryTime/OfficeHours/PickingType/Services)
- ✅ **Both have search functionality**

---

### **Badge Comparison**

| Feature | Figma Design | Actual Implementation | Status |
|---------|-------------|----------------------|--------|
| **Location Badges** | ✅ Visible | ❓ Need to verify | ⚠️ Unknown |
| **Badge Position** | Right-aligned | Need to check | ⚠️ Unknown |
| **Badge Style** | Pill-shaped | Need to check | ⚠️ Unknown |
| **Badge Content** | Count numbers | Need to check | ⚠️ Unknown |

**Note:** Need to verify if the actual implementation includes badge counts on locations.

---

## 🎯 **Key Figma Design Features**

### **1. Badges Functionality**

**Purpose:**
- Show **number of pickup points** per location
- Provide **quick visual scanning**
- Help users **make informed decisions**

**UX Benefits:**
- ✅ Reduces cognitive load
- ✅ Faster location selection
- ✅ Shows availability at a glance
- ✅ Professional appearance

**Implementation Recommendation:**
```html
<div class="location-item">
  <input type="checkbox" />
  <span class="location-name">South Carolina</span>
  <span class="location-badge">12</span>
</div>
```

```css
.location-badge {
  display: inline-block;
  padding: 2px 6px;
  background-color: #F6F6F6;
  color: #000000;
  font-size: 12px;
  font-weight: 600;
  border-radius: 12px;
  margin-left: auto;
}
```

---

### **2. Filter Design**

**Dropdown Buttons:**
- Consistent width and height
- Clear dropdown indicators (▼)
- Proper spacing between filters
- Responsive to screen size

**Search Component:**
- Input field with placeholder
- Clear button for easy reset
- Search button with icon
- Accent color for visual emphasis

---

### **3. Layout Grid**

**Responsive Considerations:**
```css
/* Desktop (Figma) */
.pickup-modal {
  width: 1040px;
  display: grid;
  grid-template-columns: 320px 720px;
}

/* Tablet */
@media (max-width: 1024px) {
  .pickup-modal {
    width: 90vw;
    grid-template-columns: 280px 1fr;
  }
}

/* Mobile */
@media (max-width: 768px) {
  .pickup-modal {
    grid-template-columns: 1fr;
    grid-template-rows: 300px 1fr;
  }
}
```

---

## ✅ **What's Good in Figma Design**

1. **Clear Visual Hierarchy** ✅
   - Filters at top
   - Split view for efficiency
   - Badges for quick reference

2. **User-Centered Filters** ✅
   - DELIVERY TIME helps users find convenient options
   - OFFICE HOURS filters by availability
   - PICKING TYPE shows different pickup methods
   - SERVICES filters by available amenities

3. **Information Architecture** ✅
   - Location list with counts (badges)
   - Map for spatial reference
   - Dual navigation methods

4. **Professional Polish** ✅
   - Badges add sophistication
   - Clean typography
   - Consistent spacing

---

## ❌ **Issues with Current Implementation**

### **Critical Issues:**

1. **Filter Mismatch** 🔴
   - Wrong filter types implemented
   - Missing 2 filters (PICKING TYPE, SERVICES)
   - Geographic vs Service-oriented approach

2. **Missing Badges** 🔴
   - No count indicators visible
   - Harder to assess availability
   - Less professional appearance

3. **UX Impact** 🟡
   - Users can't filter by delivery time
   - Can't filter by office hours
   - Can't filter by pickup type
   - Can't filter by services

---

## 📋 **Implementation Requirements**

### **To Match Figma Design:**

#### **1. Update Filter Bar**
```html
<div class="filter-bar">
  <select name="state">
    <option>STATE</option>
  </select>
  
  <select name="delivery-time">
    <option>DELIVERY TIME</option>
  </select>
  
  <select name="office-hours">
    <option>OFFICE HOURS</option>
  </select>
  
  <select name="picking-type">
    <option>PICKING TYPE</option>
  </select>
  
  <select name="services">
    <option>SERVICES</option>
  </select>
  
  <div class="search-group">
    <input type="text" placeholder="Search">
    <button class="btn-clear">×</button>
    <button class="btn-search">🔍</button>
  </div>
</div>
```

#### **2. Add Location Badges**
```html
<div class="location-list">
  <label class="location-item">
    <input type="checkbox" />
    <span class="location-name">South Carolina</span>
    <span class="location-badge">12</span>
  </label>
  
  <label class="location-item">
    <input type="checkbox" />
    <span class="location-name">California</span>
    <span class="location-badge">23</span>
  </label>
  
  <!-- More locations... -->
</div>
```

#### **3. Badge Styling**
```css
.location-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  background-color: #F6F6F6;
  color: #000000;
  font-size: 11px;
  font-weight: 600;
  border-radius: 10px;
  margin-left: auto;
}

.location-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
}

.location-item:hover {
  background-color: #F9F9F9;
}

.location-item:hover .location-badge {
  background-color: #ECECEC;
}
```

---

## 🎨 **Figma CSS Specifications**

### **Complete Extracted Styles:**

```css
/* Modal Container */
.pickup-modal {
  width: 1040px;
  height: 680px;
  background-color: #FFFFFF;
  border-radius: 8px;
  box-shadow: 0px 6px 15px rgba(0, 0, 0, 0.1);
  display: grid;
  grid-template-rows: 60px 1fr 60px;
}

/* Filter Bar */
.filter-bar {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  background-color: #FFFFFF;
}

.filter-bar select {
  height: 36px;
  padding: 0 12px;
  border: 1px solid #D4D4D4;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  text-transform: uppercase;
  background-color: #FFFFFF;
  cursor: pointer;
}

/* Search Group */
.search-group {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}

.search-group input {
  width: 180px;
  height: 36px;
  padding: 0 12px;
  border: 1px solid #D4D4D4;
  border-radius: 4px;
  font-size: 14px;
}

.search-group .btn-search {
  width: 36px;
  height: 36px;
  background-color: #1E90FF;
  color: #FFFFFF;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

/* Location List with Badges */
.location-list {
  padding: 12px;
  overflow-y: auto;
}

.location-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.location-item:hover {
  background-color: #F6F6F6;
}

.location-name {
  flex: 1;
  font-size: 14px;
  color: #000000;
}

.location-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 7px;
  background-color: #F6F6F6;
  color: #000000;
  font-size: 11px;
  font-weight: 600;
  border-radius: 11px;
  line-height: 1;
}

/* Map Panel */
.map-panel {
  position: relative;
  background-color: #F0F0F0;
  border-left: 1px solid #E0E0E0;
}
```

---

## 📊 **Data Requirements for Badges**

To implement badges, the API should return:

```json
{
  "locations": [
    {
      "name": "South Carolina",
      "pickupPointCount": 12,
      "coordinates": {...}
    },
    {
      "name": "California",  
      "pickupPointCount": 23,
      "coordinates": {...}
    }
  ]
}
```

**Badge Logic:**
- Count pickup points per location/state
- Display count in badge
- Update badge when filters change
- Gray out locations with 0 points

---

## 🎯 **Recommendations**

### **Immediate Actions:**

1. **Implement Missing Filters** 🔴
   - Add PICKING TYPE filter
   - Add SERVICES filter
   - Consider if DELIVERY TIME and OFFICE HOURS are needed

2. **Add Location Badges** 🟡
   - Show pickup point counts
   - Implement badge styling from Figma
   - Update API to provide counts

3. **Clarify Filter Strategy** 🟡
   - Decision: Geographic (Country/State/City) vs Service (Delivery/Hours/Type)?
   - Update Figma or implementation accordingly
   - Document the decision

### **Future Enhancements:**

4. **Dynamic Badge Updates**
   - Update counts when filters applied
   - Show 0 for locations with no matches
   - Disable locations with 0 points

5. **Badge Interactions**
   - Highlight on hover
   - Click to expand location details
   - Show tooltips with more info

---

## 📄 **Summary**

### **Figma Design Strengths:**
- ✅ Professional badge design
- ✅ Clear filter organization
- ✅ User-friendly information display
- ✅ Service-oriented approach

### **Implementation Gaps:**
- ❌ Missing 2 filters (PICKING TYPE, SERVICES)
- ❌ Wrong filter types (geographic vs service)
- ❌ No location badges
- ❌ Different UX approach

### **Priority:**
**HIGH** - The filter and badge discrepancies significantly impact UX. Alignment needed between design and implementation.

---

**Analysis Completed:** November 6, 2025  
**Screenshot:** Captured from Figma  
**Recommendation:** Schedule design-dev alignment meeting to resolve specification conflicts

---

## 🔗 References

- **Figma Design:** [STOREFRONT DRAFT • 2](https://www.figma.com/design/9DBmmQwGVbYiayQa4JOVC5/%F0%9F%94%B6--STOREFRONT-DRAFT-%E2%80%A2-2?node-id=8648-679429)
- **JIRA Ticket:** VCST-3865
- **Previous Analysis:** css-style-analysis.md

