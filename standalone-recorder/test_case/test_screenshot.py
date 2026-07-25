import re
from playwright.sync_api import Page, expect


def test_screenshot(page: Page) -> None:
    page.goto("https://cn.bing.com/")
    page.locator("#sb_form_q").click()
    page.locator("#sb_form_q").fill("playwright")
    # Screenshot assertion: save screenshot for visual comparison
    page.locator("#sb_form_q").screenshot(path="screenshots/test_screenshot-4.png")