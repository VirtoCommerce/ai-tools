# VCST-4499 - Python + Pytest + Playwright Automation Examples

**Framework:** Python 3.10+ | Pytest | Playwright
**Date:** 2026-01-29
**Ticket:** VCST-4499

---

## Project Setup

### Requirements

```txt
# requirements.txt
pytest==7.4.3
pytest-playwright==0.4.3
playwright==1.40.0
pytest-xdist==3.5.0  # For parallel execution
pytest-html==4.1.1  # HTML reporting
allure-pytest==2.13.2  # Allure reporting
axe-playwright-python==0.1.3  # Accessibility testing
Pillow==10.1.0  # Screenshot comparison
```

### Installation

```bash
pip install -r requirements.txt
playwright install chromium firefox webkit
```

### Project Structure

```
tests/
├── conftest.py                 # Fixtures and configuration
├── pages/
│   ├── __init__.py
│   ├── base_page.py
│   ├── cart_page.py
│   └── pickup_modal_page.py    # Page Object for BOPIS modal
├── test_bopis/
│   ├── __init__.py
│   ├── test_tc001_map_stability.py
│   ├── test_tc002_desktop_flow.py
│   ├── test_tc003_mobile_toggle.py
│   ├── test_tc004_search.py
│   ├── test_tc005_filters.py
│   ├── test_tc006_map_interactions.py
│   ├── test_tc007_location_card.py
│   ├── test_tc008_scroll_behavior.py
│   ├── test_tc009_responsive.py
│   ├── test_tc010_localization.py
│   ├── test_tc011_performance.py
│   ├── test_tc012_error_handling.py
│   ├── test_tc013_cross_browser.py
│   ├── test_tc014_accessibility.py
│   └── test_tc015_integration.py
├── test_regression/
│   ├── __init__.py
│   ├── test_reg001_delivery.py
│   ├── test_reg002_cart_ops.py
│   ├── test_reg003_modals.py
│   ├── test_reg004_checkout.py
│   ├── test_reg005_payment.py
│   └── test_reg006_order_history.py
├── utils/
│   ├── __init__.py
│   ├── helpers.py
│   └── test_data.py
└── pytest.ini                  # Pytest configuration
```

---

## Configuration Files

### pytest.ini

```ini
[pytest]
markers =
    smoke: Smoke tests that run quickly
    critical: Critical priority tests (P0)
    high: High priority tests (P1)
    medium: Medium priority tests (P2)
    low: Low priority tests (P3)
    bopis: BOPIS pickup location tests
    regression: Regression tests
    desktop: Desktop viewport tests
    mobile: Mobile viewport tests
    cross_browser: Cross-browser tests
    slow: Tests that take longer to execute

addopts =
    --html=reports/report.html
    --self-contained-html
    --verbose
    --strict-markers
    -ra
    --tb=short

testpaths = tests
python_files = test_*.py
python_classes = Test*
python_functions = test_*

# Playwright specific
base_url = https://virtostart-demo-store.govirto.com
```

### conftest.py

```python
"""Pytest fixtures and configuration for BOPIS tests."""
import pytest
from typing import Generator
from playwright.sync_api import Page, Browser, BrowserContext, Playwright
from pages.cart_page import CartPage
from pages.pickup_modal_page import PickupModalPage


@pytest.fixture(scope="session")
def browser_type_launch_args(browser_type_launch_args):
    """Browser launch arguments."""
    return {
        **browser_type_launch_args,
        "args": [
            "--disable-blink-features=AutomationControlled",
        ],
    }


@pytest.fixture(scope="session")
def browser_context_args(browser_context_args, pytestconfig):
    """Browser context arguments with viewport and base_url."""
    return {
        **browser_context_args,
        "viewport": {"width": 1920, "height": 1080},
        "base_url": pytestconfig.getini("base_url"),
        "record_video_dir": "reports/videos",
        "record_video_size": {"width": 1280, "height": 720},
    }


@pytest.fixture
def cart_page(page: Page) -> CartPage:
    """Create CartPage instance."""
    return CartPage(page)


@pytest.fixture
def pickup_modal(page: Page) -> PickupModalPage:
    """Create PickupModalPage instance."""
    return PickupModalPage(page)


@pytest.fixture
def add_products_to_cart(page: Page, cart_page: CartPage):
    """Fixture to add products to cart before tests."""
    cart_page.navigate()
    if cart_page.is_cart_empty():
        # Add sample products
        cart_page.add_sample_products(count=2)
    yield
    # Cleanup if needed


@pytest.fixture
def desktop_viewport(page: Page):
    """Set desktop viewport."""
    page.set_viewport_size({"width": 1920, "height": 1080})
    yield


@pytest.fixture
def mobile_viewport(page: Page):
    """Set mobile viewport."""
    page.set_viewport_size({"width": 375, "height": 667})
    yield


@pytest.fixture
def tablet_viewport(page: Page):
    """Set tablet viewport."""
    page.set_viewport_size({"width": 768, "height": 1024})
    yield
```

---

## Page Object Models

### base_page.py

```python
"""Base page object with common functionality."""
from typing import Optional
from playwright.sync_api import Page, Locator, expect


class BasePage:
    """Base page object."""

    def __init__(self, page: Page):
        self.page = page

    def navigate(self, path: str = ""):
        """Navigate to a path."""
        self.page.goto(path)

    def wait_for_load_state(self, state: str = "networkidle"):
        """Wait for page load state."""
        self.page.wait_for_load_state(state)

    def take_screenshot(self, name: str):
        """Take a screenshot."""
        self.page.screenshot(path=f"reports/screenshots/{name}.png")

    def get_element(self, selector: str) -> Locator:
        """Get element by selector."""
        return self.page.locator(selector)

    def get_by_test_id(self, test_id: str) -> Locator:
        """Get element by test ID."""
        return self.page.get_by_test_id(test_id)

    def get_bounding_box(self, selector: str) -> dict:
        """Get element bounding box."""
        return self.page.locator(selector).bounding_box()
```

### pickup_modal_page.py

```python
"""Page Object for BOPIS Pickup Location Modal."""
from typing import Optional, List
from playwright.sync_api import Page, Locator, expect
from .base_page import BasePage


class PickupModalPage(BasePage):
    """BOPIS Pickup Location Modal page object."""

    # Selectors
    MODAL = '[data-testid="pickup-modal"]'
    MAP_CONTAINER = '[data-testid="map-container"]'
    LOCATION_LIST = '[data-testid="location-list"]'
    SEARCH_INPUT = '[data-testid="search-input"]'
    CLEAR_SEARCH_BTN = '[data-testid="clear-search"]'
    LOCATION_ITEM = '.location-item'
    MAP_MARKER = '[data-marker-id]'
    INFO_WINDOW = '.gm-style-iw'
    SELECT_BUTTON = '[data-testid="select-location-btn"]'
    LOCATION_CARD = '[data-testid="location-card"]'
    CONFIRM_BUTTON = '[data-testid="confirm-button"]'
    CANCEL_BUTTON = '[data-testid="cancel-button"]'
    TOGGLE_MAP_BTN = '[data-testid="toggle-map"]'
    TOGGLE_LIST_BTN = '[data-testid="toggle-list"]'
    FILTER_AVAILABLE = '[data-testid="filter-available"]'
    FILTER_DISTANCE = '[data-testid="filter-distance"]'
    CLEAR_FILTERS = '[data-testid="clear-filters"]'

    def __init__(self, page: Page):
        super().__init__(page)

    def is_modal_visible(self) -> bool:
        """Check if modal is visible."""
        return self.get_element(self.MODAL).is_visible()

    def wait_for_modal_open(self, timeout: int = 5000):
        """Wait for modal to open."""
        self.page.wait_for_selector(self.MODAL, state="visible", timeout=timeout)
        # Wait for map to load
        self.page.wait_for_selector(self.MAP_CONTAINER, state="visible")
        self.page.wait_for_load_state("networkidle")

    def get_map_dimensions(self) -> dict:
        """Get map container dimensions."""
        return self.get_bounding_box(self.MAP_CONTAINER)

    def search_location(self, query: str):
        """Search for a location."""
        search = self.get_element(self.SEARCH_INPUT)
        search.fill(query)
        self.page.wait_for_timeout(500)  # Debounce delay

    def clear_search(self):
        """Clear search field."""
        self.get_element(self.CLEAR_SEARCH_BTN).click()

    def get_visible_locations_count(self) -> int:
        """Get count of visible locations."""
        return self.get_element(f"{self.LOCATION_ITEM}:visible").count()

    def get_all_locations_count(self) -> int:
        """Get count of all locations."""
        return self.get_element(self.LOCATION_ITEM).count()

    def click_location_in_list(self, index: int = 0):
        """Click a location in the list."""
        self.get_element(self.LOCATION_ITEM).nth(index).click()

    def click_map_marker(self, marker_id: str):
        """Click a marker on the map."""
        self.get_element(f'[data-marker-id="{marker_id}"]').click()

    def is_info_window_visible(self) -> bool:
        """Check if info window is visible."""
        return self.get_element(self.INFO_WINDOW).is_visible()

    def get_info_window_count(self) -> int:
        """Get count of visible info windows."""
        return self.get_element(self.INFO_WINDOW).count()

    def click_select_in_info_window(self):
        """Click Select button in info window."""
        self.get_element(self.SELECT_BUTTON).click()

    def is_location_card_visible(self) -> bool:
        """Check if location card is visible."""
        return self.get_element(self.LOCATION_CARD).is_visible()

    def confirm_location_selection(self):
        """Click Confirm button on location card."""
        self.get_element(self.CONFIRM_BUTTON).click()

    def cancel_location_selection(self):
        """Click Cancel button on location card."""
        self.get_element(self.CANCEL_BUTTON).click()

    def toggle_to_map_view(self):
        """Toggle to map view (mobile)."""
        self.get_element(self.TOGGLE_MAP_BTN).click()

    def toggle_to_list_view(self):
        """Toggle to list view (mobile)."""
        self.get_element(self.TOGGLE_LIST_BTN).click()

    def apply_availability_filter(self):
        """Apply availability filter."""
        self.get_element(self.FILTER_AVAILABLE).click()

    def apply_distance_filter(self):
        """Apply distance filter."""
        self.get_element(self.FILTER_DISTANCE).click()

    def clear_all_filters(self):
        """Clear all filters."""
        self.get_element(self.CLEAR_FILTERS).click()

    def scroll_location_list(self, pixels: int = 100):
        """Scroll the location list."""
        self.page.evaluate(f"""
            document.querySelector('{self.LOCATION_LIST}').scrollBy(0, {pixels})
        """)

    def get_list_scroll_position(self) -> int:
        """Get location list scroll position."""
        return self.page.evaluate(f"""
            document.querySelector('{self.LOCATION_LIST}').scrollTop
        """)
```

---

## Test Examples

### TC-001: Basic Map Stability

```python
"""TC-001: Basic Map Stability (Primary Bug Fix)."""
import pytest
from playwright.sync_api import Page, expect
from pages.cart_page import CartPage
from pages.pickup_modal_page import PickupModalPage


@pytest.mark.smoke
@pytest.mark.critical
@pytest.mark.bopis
class TestTC001MapStability:
    """Test map stability during search operations."""

    def test_map_dimensions_stable_during_search(
        self,
        page: Page,
        cart_page: CartPage,
        pickup_modal: PickupModalPage,
        add_products_to_cart,
        desktop_viewport
    ):
        """Test that map dimensions remain stable during search and clear operations.

        VCST-4499: Primary bug fix - map should not jump during search/clear.
        """
        # Navigate to cart
        cart_page.navigate()

        # Open pickup modal
        cart_page.select_pickup_option()
        cart_page.click_select_pickup_location()
        pickup_modal.wait_for_modal_open()

        # Capture initial map dimensions
        initial_bounds = pickup_modal.get_map_dimensions()
        assert initial_bounds is not None, "Map container not found"

        initial_height = initial_bounds["height"]
        initial_width = initial_bounds["width"]
        initial_x = initial_bounds["x"]
        initial_y = initial_bounds["y"]

        # Search for location
        pickup_modal.search_location("Mall")
        page.wait_for_timeout(500)

        # Verify map dimensions unchanged after search
        bounds_after_search = pickup_modal.get_map_dimensions()
        assert bounds_after_search["height"] == initial_height, \
            f"Map height changed: {initial_height} -> {bounds_after_search['height']}"
        assert bounds_after_search["width"] == initial_width, \
            f"Map width changed: {initial_width} -> {bounds_after_search['width']}"
        assert bounds_after_search["x"] == initial_x, \
            f"Map X position changed: {initial_x} -> {bounds_after_search['x']}"
        assert bounds_after_search["y"] == initial_y, \
            f"Map Y position changed: {initial_y} -> {bounds_after_search['y']}"

        # Clear search
        pickup_modal.clear_search()
        page.wait_for_timeout(500)

        # Verify map dimensions unchanged after clear
        bounds_after_clear = pickup_modal.get_map_dimensions()
        assert bounds_after_clear["height"] == initial_height, \
            "Map height changed after clear"
        assert bounds_after_clear["width"] == initial_width, \
            "Map width changed after clear"
        assert bounds_after_clear["x"] == initial_x, \
            "Map X position changed after clear"
        assert bounds_after_clear["y"] == initial_y, \
            "Map Y position changed after clear"

        # Repeat 3 times to ensure consistency
        for iteration in range(3):
            pickup_modal.search_location(f"Location {iteration}")
            page.wait_for_timeout(300)

            bounds = pickup_modal.get_map_dimensions()
            assert bounds["height"] == initial_height, \
                f"Iteration {iteration}: Map height changed"
            assert bounds["width"] == initial_width, \
                f"Iteration {iteration}: Map width changed"

            pickup_modal.clear_search()
            page.wait_for_timeout(300)

            bounds = pickup_modal.get_map_dimensions()
            assert bounds["height"] == initial_height, \
                f"Iteration {iteration}: Map height changed after clear"


    def test_no_visual_jump_during_operations(
        self,
        page: Page,
        cart_page: CartPage,
        pickup_modal: PickupModalPage,
        add_products_to_cart
    ):
        """Test that there's no visual 'jump' or layout shift during operations."""
        cart_page.navigate()
        cart_page.select_pickup_option()
        cart_page.click_select_pickup_location()
        pickup_modal.wait_for_modal_open()

        # Take initial screenshot
        pickup_modal.take_screenshot("map_initial")
        initial_bounds = pickup_modal.get_map_dimensions()

        # Perform search
        pickup_modal.search_location("Test")
        page.wait_for_timeout(500)

        # Take screenshot after search
        pickup_modal.take_screenshot("map_after_search")
        search_bounds = pickup_modal.get_map_dimensions()

        # Verify position unchanged (no jump)
        position_tolerance = 2  # 2px tolerance for sub-pixel rendering
        assert abs(search_bounds["x"] - initial_bounds["x"]) <= position_tolerance, \
            "Map jumped horizontally"
        assert abs(search_bounds["y"] - initial_bounds["y"]) <= position_tolerance, \
            "Map jumped vertically"
```

---

### TC-002: Desktop View - Location Selection Flow

```python
"""TC-002: Desktop View - Location Selection Flow."""
import pytest
from playwright.sync_api import Page, expect
from pages.cart_page import CartPage
from pages.pickup_modal_page import PickupModalPage


@pytest.mark.smoke
@pytest.mark.critical
@pytest.mark.bopis
@pytest.mark.desktop
class TestTC002DesktopFlow:
    """Test desktop location selection flow."""

    def test_desktop_layout_and_selection_flow(
        self,
        page: Page,
        cart_page: CartPage,
        pickup_modal: PickupModalPage,
        add_products_to_cart,
        desktop_viewport
    ):
        """Test complete desktop location selection flow."""
        # Navigate and open modal
        cart_page.navigate()
        cart_page.select_pickup_option()
        cart_page.click_select_pickup_location()
        pickup_modal.wait_for_modal_open()

        # Verify desktop layout (side-by-side)
        list_locator = pickup_modal.get_element(pickup_modal.LOCATION_LIST)
        map_locator = pickup_modal.get_element(pickup_modal.MAP_CONTAINER)

        expect(list_locator).to_be_visible()
        expect(map_locator).to_be_visible()

        # Verify list is on the left of map
        list_box = list_locator.bounding_box()
        map_box = map_locator.bounding_box()
        assert list_box["x"] < map_box["x"], "List should be on left of map"

        # Click first location in list
        initial_location_count = pickup_modal.get_all_locations_count()
        assert initial_location_count > 0, "No locations available"

        pickup_modal.click_location_in_list(0)
        page.wait_for_timeout(1000)  # Wait for map pan animation

        # Verify info window opens
        assert pickup_modal.is_info_window_visible(), "Info window did not open"

        # Click second location
        if initial_location_count > 1:
            pickup_modal.click_location_in_list(1)
            page.wait_for_timeout(1000)

            # Verify only one info window visible (race condition check)
            info_window_count = pickup_modal.get_info_window_count()
            assert info_window_count == 1, \
                f"Expected 1 info window, found {info_window_count}"

        # Click Select button in info window
        pickup_modal.click_select_in_info_window()
        page.wait_for_timeout(500)

        # Verify PickupLocationCard opens
        assert pickup_modal.is_location_card_visible(), \
            "PickupLocationCard did not open"

        # Verify card content
        card = pickup_modal.get_element(pickup_modal.LOCATION_CARD)
        expect(card.get_by_test_id("location-name")).to_be_visible()
        expect(card.get_by_test_id("location-address")).to_be_visible()
        expect(card.get_by_test_id("location-hours")).to_be_visible()

        # Confirm selection
        pickup_modal.confirm_location_selection()
        page.wait_for_timeout(500)

        # Verify modal closed
        assert not pickup_modal.is_modal_visible(), "Modal did not close"

        # Verify location appears in cart
        cart_location = cart_page.get_selected_pickup_location()
        assert cart_location is not None, "No pickup location in cart"
        assert len(cart_location) > 0, "Pickup location text empty"


    @pytest.mark.parametrize("location_index", [0, 1, 2])
    def test_select_different_locations(
        self,
        page: Page,
        cart_page: CartPage,
        pickup_modal: PickupModalPage,
        add_products_to_cart,
        desktop_viewport,
        location_index: int
    ):
        """Test selecting different locations by index."""
        cart_page.navigate()
        cart_page.select_pickup_option()
        cart_page.click_select_pickup_location()
        pickup_modal.wait_for_modal_open()

        total_locations = pickup_modal.get_all_locations_count()
        if location_index >= total_locations:
            pytest.skip(f"Not enough locations (need {location_index + 1}, have {total_locations})")

        pickup_modal.click_location_in_list(location_index)
        page.wait_for_timeout(1000)

        assert pickup_modal.is_info_window_visible()
        pickup_modal.click_select_in_info_window()

        assert pickup_modal.is_location_card_visible()
        pickup_modal.confirm_location_selection()

        assert not pickup_modal.is_modal_visible()
```

---

### TC-003: Mobile View - List/Map Toggle

```python
"""TC-003: Mobile View - List/Map Toggle."""
import pytest
from playwright.sync_api import Page, expect
from pages.cart_page import CartPage
from pages.pickup_modal_page import PickupModalPage


@pytest.mark.smoke
@pytest.mark.critical
@pytest.mark.bopis
@pytest.mark.mobile
class TestTC003MobileToggle:
    """Test mobile list/map toggle functionality."""

    def test_mobile_toggle_functionality(
        self,
        page: Page,
        cart_page: CartPage,
        pickup_modal: PickupModalPage,
        add_products_to_cart,
        mobile_viewport
    ):
        """Test list/map toggle on mobile devices."""
        # Navigate and open modal
        cart_page.navigate()
        cart_page.select_pickup_option()
        cart_page.click_select_pickup_location()
        pickup_modal.wait_for_modal_open()

        # Verify list view is default
        list_locator = pickup_modal.get_element(pickup_modal.LOCATION_LIST)
        map_locator = pickup_modal.get_element(pickup_modal.MAP_CONTAINER)

        expect(list_locator).to_be_visible()
        # Map may be hidden or off-screen on mobile

        # Verify toggle button visible
        toggle_map_btn = pickup_modal.get_element(pickup_modal.TOGGLE_MAP_BTN)
        expect(toggle_map_btn).to_be_visible()

        # Switch to map view
        pickup_modal.toggle_to_map_view()
        page.wait_for_timeout(500)

        # Verify map visible, list hidden
        expect(map_locator).to_be_visible()
        expect(list_locator).not_to_be_visible()

        # Switch back to list view
        pickup_modal.toggle_to_list_view()
        page.wait_for_timeout(500)

        # Verify list visible, map hidden
        expect(list_locator).to_be_visible()
        expect(map_locator).not_to_be_visible()

        # Verify no horizontal scroll
        has_horizontal_scroll = page.evaluate("""
            () => document.documentElement.scrollWidth > document.documentElement.clientWidth
        """)
        assert not has_horizontal_scroll, "Page has horizontal scroll on mobile"


    def test_mobile_location_selection_flow(
        self,
        page: Page,
        cart_page: CartPage,
        pickup_modal: PickupModalPage,
        add_products_to_cart,
        mobile_viewport
    ):
        """Test complete location selection on mobile."""
        cart_page.navigate()
        cart_page.select_pickup_option()
        cart_page.click_select_pickup_location()
        pickup_modal.wait_for_modal_open()

        # Switch to map view
        pickup_modal.toggle_to_map_view()
        page.wait_for_timeout(500)

        # Click a marker
        markers = pickup_modal.get_element(pickup_modal.MAP_MARKER)
        marker_count = markers.count()
        assert marker_count > 0, "No markers visible"

        markers.first.click()
        page.wait_for_timeout(500)

        # Verify info window
        assert pickup_modal.is_info_window_visible()

        # Select location
        pickup_modal.click_select_in_info_window()
        page.wait_for_timeout(500)

        # Verify location card fits mobile screen
        card = pickup_modal.get_element(pickup_modal.LOCATION_CARD)
        card_box = card.bounding_box()
        assert card_box["width"] <= 375, "Card exceeds mobile viewport width"

        # Confirm
        pickup_modal.confirm_location_selection()
        assert not pickup_modal.is_modal_visible()
```

---

### TC-004: Search Functionality

```python
"""TC-004: Search Functionality."""
import pytest
from playwright.sync_api import Page, expect
from pages.cart_page import CartPage
from pages.pickup_modal_page import PickupModalPage


@pytest.mark.high
@pytest.mark.bopis
class TestTC004Search:
    """Test search functionality."""

    def test_partial_search_filters_results(
        self,
        page: Page,
        cart_page: CartPage,
        pickup_modal: PickupModalPage,
        add_products_to_cart
    ):
        """Test that partial search filters results correctly."""
        cart_page.navigate()
        cart_page.select_pickup_option()
        cart_page.click_select_pickup_location()
        pickup_modal.wait_for_modal_open()

        # Get initial location count
        initial_count = pickup_modal.get_visible_locations_count()
        assert initial_count > 0, "No locations available"

        # Search for partial match
        pickup_modal.search_location("Mall")
        page.wait_for_timeout(1000)

        # Verify filtered results
        filtered_count = pickup_modal.get_visible_locations_count()
        assert filtered_count <= initial_count, \
            "Filtered count should be less than or equal to initial"

        # Verify all visible locations contain search term
        visible_locations = pickup_modal.get_element(
            f"{pickup_modal.LOCATION_ITEM}:visible"
        )
        for i in range(visible_locations.count()):
            location_text = visible_locations.nth(i).inner_text().lower()
            assert "mall" in location_text, \
                f"Location {i} does not contain search term 'mall'"

        # Clear search
        pickup_modal.clear_search()
        page.wait_for_timeout(500)

        # Verify all locations restored
        restored_count = pickup_modal.get_visible_locations_count()
        assert restored_count == initial_count, \
            "Not all locations restored after clear"


    def test_search_debouncing(
        self,
        page: Page,
        cart_page: CartPage,
        pickup_modal: PickupModalPage,
        add_products_to_cart
    ):
        """Test that search debounces rapid typing."""
        cart_page.navigate()
        cart_page.select_pickup_option()
        cart_page.click_select_pickup_location()
        pickup_modal.wait_for_modal_open()

        # Monitor API calls
        api_calls = []

        def log_request(request):
            if "locations" in request.url and "search" in request.url:
                api_calls.append(request.url)

        page.on("request", log_request)

        # Type rapidly
        search_input = pickup_modal.get_element(pickup_modal.SEARCH_INPUT)
        search_text = "Mall"
        for char in search_text:
            search_input.type(char, delay=50)  # 50ms between keystrokes

        page.wait_for_timeout(1000)  # Wait for debounce

        # Verify reasonable API call count
        assert len(api_calls) < len(search_text), \
            f"Too many API calls: {len(api_calls)} for {len(search_text)} characters"
        assert len(api_calls) <= 2, \
            f"Expected 1-2 API calls due to debounce, got {len(api_calls)}"


    @pytest.mark.parametrize("search_term,expected_behavior", [
        ("", "all_visible"),
        ("Mall", "filtered"),
        ("XXXINVALIDXXX", "empty_or_error"),
        ("123 Main St", "address_search"),
    ])
    def test_various_search_scenarios(
        self,
        page: Page,
        cart_page: CartPage,
        pickup_modal: PickupModalPage,
        add_products_to_cart,
        search_term: str,
        expected_behavior: str
    ):
        """Test various search scenarios."""
        cart_page.navigate()
        cart_page.select_pickup_option()
        cart_page.click_select_pickup_location()
        pickup_modal.wait_for_modal_open()

        initial_count = pickup_modal.get_all_locations_count()

        pickup_modal.search_location(search_term)
        page.wait_for_timeout(1000)

        if expected_behavior == "all_visible":
            assert pickup_modal.get_visible_locations_count() == initial_count
        elif expected_behavior == "filtered":
            assert pickup_modal.get_visible_locations_count() <= initial_count
        elif expected_behavior == "empty_or_error":
            # Should show empty state or error, not crash
            count = pickup_modal.get_visible_locations_count()
            assert count >= 0  # Just verify no crash
        elif expected_behavior == "address_search":
            # Map should zoom/pan, verify no crash
            assert pickup_modal.is_modal_visible()
```

---

### TC-006: Map Interaction & Info Windows

```python
"""TC-006: Map Interaction & Info Windows."""
import pytest
from playwright.sync_api import Page, expect
from pages.cart_page import CartPage
from pages.pickup_modal_page import PickupModalPage


@pytest.mark.high
@pytest.mark.bopis
class TestTC006MapInteractions:
    """Test map interactions and info window race conditions."""

    def test_single_info_window_race_condition(
        self,
        page: Page,
        cart_page: CartPage,
        pickup_modal: PickupModalPage,
        add_products_to_cart
    ):
        """Test that only one info window is visible at a time (race condition check)."""
        cart_page.navigate()
        cart_page.select_pickup_option()
        cart_page.click_select_pickup_location()
        pickup_modal.wait_for_modal_open()

        # Get all markers
        markers = pickup_modal.get_element(pickup_modal.MAP_MARKER)
        marker_count = markers.count()

        assert marker_count >= 2, "Need at least 2 markers for this test"

        # Click first marker
        markers.nth(0).click()
        page.wait_for_timeout(300)
        assert pickup_modal.is_info_window_visible()

        # Immediately click second marker
        markers.nth(1).click()
        page.wait_for_timeout(300)

        # Verify only one info window visible
        info_window_count = pickup_modal.get_info_window_count()
        assert info_window_count == 1, \
            f"Race condition detected: {info_window_count} info windows visible"


    def test_rapid_marker_clicks_no_crash(
        self,
        page: Page,
        cart_page: CartPage,
        pickup_modal: PickupModalPage,
        add_products_to_cart
    ):
        """Test that rapidly clicking markers doesn't cause crashes or multiple windows."""
        cart_page.navigate()
        cart_page.select_pickup_option()
        cart_page.click_select_pickup_location()
        pickup_modal.wait_for_modal_open()

        markers = pickup_modal.get_element(pickup_modal.MAP_MARKER)
        marker_count = min(markers.count(), 5)  # Test up to 5 markers

        # Rapidly click multiple markers
        for i in range(marker_count):
            markers.nth(i).click()
            page.wait_for_timeout(100)  # Very short delay

        # Give time for all operations to complete
        page.wait_for_timeout(1000)

        # Verify application is stable
        assert pickup_modal.is_modal_visible(), "Modal disappeared/crashed"

        # Verify only one info window
        info_window_count = pickup_modal.get_info_window_count()
        assert info_window_count <= 1, \
            f"Multiple info windows after rapid clicks: {info_window_count}"


    def test_info_window_closes_on_background_click(
        self,
        page: Page,
        cart_page: CartPage,
        pickup_modal: PickupModalPage,
        add_products_to_cart
    ):
        """Test that clicking map background closes info window."""
        cart_page.navigate()
        cart_page.select_pickup_option()
        cart_page.click_select_pickup_location()
        pickup_modal.wait_for_modal_open()

        # Click a marker
        markers = pickup_modal.get_element(pickup_modal.MAP_MARKER)
        markers.first.click()
        page.wait_for_timeout(500)

        assert pickup_modal.is_info_window_visible()

        # Click map background (offset from markers)
        map_container = pickup_modal.get_element(pickup_modal.MAP_CONTAINER)
        map_box = map_container.bounding_box()

        # Click in the center of map (likely background)
        page.mouse.click(
            map_box["x"] + map_box["width"] / 2,
            map_box["y"] + map_box["height"] / 2
        )
        page.wait_for_timeout(500)

        # Info window should close
        assert not pickup_modal.is_info_window_visible(), \
            "Info window did not close on background click"
```

---

### TC-011: Performance Testing

```python
"""TC-011: Performance Testing."""
import pytest
import time
from playwright.sync_api import Page
from pages.cart_page import CartPage
from pages.pickup_modal_page import PickupModalPage


@pytest.mark.medium
@pytest.mark.bopis
@pytest.mark.slow
class TestTC011Performance:
    """Test performance metrics."""

    def test_modal_open_performance(
        self,
        page: Page,
        cart_page: CartPage,
        pickup_modal: PickupModalPage,
        add_products_to_cart
    ):
        """Test modal open time is within acceptable range."""
        cart_page.navigate()
        cart_page.select_pickup_option()

        # Measure modal open time
        start_time = time.time()
        cart_page.click_select_pickup_location()
        pickup_modal.wait_for_modal_open()
        end_time = time.time()

        open_duration = (end_time - start_time) * 1000  # Convert to ms

        # Assert reasonable open time (<2s for normal location count)
        assert open_duration < 2000, \
            f"Modal took too long to open: {open_duration:.0f}ms"

        print(f"Modal open time: {open_duration:.0f}ms")


    def test_search_response_time(
        self,
        page: Page,
        cart_page: CartPage,
        pickup_modal: PickupModalPage,
        add_products_to_cart
    ):
        """Test search response time."""
        cart_page.navigate()
        cart_page.select_pickup_option()
        cart_page.click_select_pickup_location()
        pickup_modal.wait_for_modal_open()

        # Measure search response
        start_time = time.time()
        pickup_modal.search_location("Mall")
        page.wait_for_selector(f"{pickup_modal.LOCATION_ITEM}:visible")
        end_time = time.time()

        search_duration = (end_time - start_time) * 1000

        # Search should respond quickly (<500ms)
        assert search_duration < 500, \
            f"Search took too long: {search_duration:.0f}ms"

        print(f"Search response time: {search_duration:.0f}ms")


    def test_no_memory_leaks_on_repeated_operations(
        self,
        page: Page,
        cart_page: CartPage,
        pickup_modal: PickupModalPage,
        add_products_to_cart
    ):
        """Test for memory leaks by opening/closing modal repeatedly."""
        cart_page.navigate()
        cart_page.select_pickup_option()

        # Get initial memory (if available)
        initial_memory = page.evaluate("() => performance.memory?.usedJSHeapSize")

        if initial_memory is None:
            pytest.skip("performance.memory not available")

        # Open and close modal 10 times
        for _ in range(10):
            cart_page.click_select_pickup_location()
            pickup_modal.wait_for_modal_open()
            page.keyboard.press("Escape")  # Close modal
            page.wait_for_timeout(500)

        # Get final memory
        final_memory = page.evaluate("() => performance.memory.usedJSHeapSize")

        # Memory should not increase significantly (allow 20% increase)
        memory_increase_ratio = final_memory / initial_memory
        assert memory_increase_ratio < 1.2, \
            f"Memory leak detected: {memory_increase_ratio:.2f}x increase"

        print(f"Memory increase: {(memory_increase_ratio - 1) * 100:.1f}%")
```

---

### TC-014: Accessibility Testing

```python
"""TC-014: Accessibility Testing."""
import pytest
from playwright.sync_api import Page, expect
from axe_playwright_python.sync_playwright import Axe
from pages.cart_page import CartPage
from pages.pickup_modal_page import PickupModalPage


@pytest.mark.low
@pytest.mark.bopis
class TestTC014Accessibility:
    """Test accessibility compliance."""

    def test_axe_accessibility_scan(
        self,
        page: Page,
        cart_page: CartPage,
        pickup_modal: PickupModalPage,
        add_products_to_cart
    ):
        """Run axe-core accessibility scan on modal."""
        cart_page.navigate()
        cart_page.select_pickup_option()
        cart_page.click_select_pickup_location()
        pickup_modal.wait_for_modal_open()

        # Run axe scan
        axe = Axe()
        axe.inject(page)
        results = axe.run(page, context=pickup_modal.MODAL)

        # Check for violations
        violations = results["violations"]
        critical_violations = [v for v in violations if v["impact"] == "critical"]
        serious_violations = [v for v in violations if v["impact"] == "serious"]

        # Assert no critical violations
        assert len(critical_violations) == 0, \
            f"Critical accessibility violations found: {critical_violations}"

        # Print summary
        print(f"Accessibility scan results:")
        print(f"  Critical: {len(critical_violations)}")
        print(f"  Serious: {len(serious_violations)}")
        print(f"  Total violations: {len(violations)}")


    def test_keyboard_navigation(
        self,
        page: Page,
        cart_page: CartPage,
        pickup_modal: PickupModalPage,
        add_products_to_cart
    ):
        """Test full keyboard navigation through modal."""
        cart_page.navigate()
        cart_page.select_pickup_option()

        # Open modal with keyboard
        cart_page.focus_select_location_button()
        page.keyboard.press("Enter")
        pickup_modal.wait_for_modal_open()

        # Tab through elements
        page.keyboard.press("Tab")
        focused_element = page.evaluate("() => document.activeElement.tagName")
        assert focused_element in ["INPUT", "BUTTON", "A"], \
            f"Focus not on interactive element: {focused_element}"

        # Test Escape closes modal
        page.keyboard.press("Escape")
        page.wait_for_timeout(500)
        assert not pickup_modal.is_modal_visible(), \
            "Modal did not close on Escape"


    def test_focus_indicators_visible(
        self,
        page: Page,
        cart_page: CartPage,
        pickup_modal: PickupModalPage,
        add_products_to_cart
    ):
        """Test that focus indicators are visible."""
        cart_page.navigate()
        cart_page.select_pickup_option()
        cart_page.click_select_pickup_location()
        pickup_modal.wait_for_modal_open()

        # Tab to first interactive element
        page.keyboard.press("Tab")

        # Check for visible focus indicator
        has_outline = page.evaluate("""
            () => {
                const el = document.activeElement;
                const styles = window.getComputedStyle(el);
                return styles.outline !== 'none' ||
                       styles.outlineWidth !== '0px' ||
                       styles.boxShadow !== 'none';
            }
        """)

        assert has_outline, "No visible focus indicator on active element"
```

---

## Running Tests

### Run All Tests

```bash
pytest tests/
```

### Run Specific Priority

```bash
# Critical tests only
pytest -m critical

# High priority tests
pytest -m high

# Smoke tests
pytest -m smoke
```

### Run Specific Test Suite

```bash
# BOPIS tests only
pytest -m bopis

# Regression tests only
pytest -m regression
```

### Run Cross-Browser

```bash
# Run on all browsers
pytest --browser chromium --browser firefox --browser webkit

# Run on specific browser
pytest --browser firefox
```

### Parallel Execution

```bash
# Run tests in parallel (4 workers)
pytest -n 4

# Run in parallel with specific markers
pytest -m "critical or high" -n auto
```

### Generate HTML Report

```bash
pytest --html=reports/report.html --self-contained-html
```

### Headed Mode (See Browser)

```bash
pytest --headed

# With slow motion
pytest --headed --slowmo 1000
```

---

## CI/CD Integration

### GitHub Actions Example

```yaml
# .github/workflows/bopis-tests.yml
name: BOPIS Automated Tests

on:
  pull_request:
    branches: [main, dev]
  push:
    branches: [main]
  schedule:
    - cron: '0 0 * * *'  # Daily at midnight

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        browser: [chromium, firefox, webkit]

    steps:
      - uses: actions/checkout@v3

      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.10'

      - name: Install dependencies
        run: |
          pip install -r requirements.txt
          playwright install --with-deps ${{ matrix.browser }}

      - name: Run smoke tests
        run: pytest -m smoke --browser ${{ matrix.browser }}

      - name: Run critical tests
        if: always()
        run: pytest -m critical --browser ${{ matrix.browser }}

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: test-results-${{ matrix.browser }}
          path: reports/
```

---

**Document Version:** 1.0
**Framework:** Python 3.10+ | Pytest | Playwright
**Last Updated:** 2026-01-29
