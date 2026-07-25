import os
from datetime import datetime
from playwright.sync_api import Page, expect
import allure


def _screenshot(page, name: str) -> None:
    """截图并附加到Allure报告"""
    ts = datetime.now().strftime("%H%M%S")
    path = os.path.join("allure-results", f"{name}_{ts}.png")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    page.screenshot(path=path)
    allure.attach.file(path, name=name, attachment_type=allure.attachment_type.PNG)


@allure.feature("录制测试")
@allure.story("test")
def test(page: Page) -> None:
    with allure.step("步骤 1: 导航到必应首页"):
        page.goto("https://cn.bing.com/")
        _screenshot(page, "step_1")
    with allure.step("步骤 2: 点击搜索框"):
        page.locator("#sb_form_q").click()
        _screenshot(page, "step_2")
    with allure.step("步骤 3: 在搜索框中填入\"hello\""):
        page.locator("#sb_form_q").fill("hello")
        _screenshot(page, "step_3")
    with allure.step("步骤 4: 按下Enter"):
        page.locator("#sb_form_q").press("Enter")
        _screenshot(page, "step_4")
    with allure.step("步骤 5: 断言可见: #sb_form_q"):
        expect(page.locator("#sb_form_q")).to_be_visible()
        _screenshot(page, "step_5")
    with allure.step("步骤 6: 断言值: #sb_form_q = \"hello\""):
        expect(page.locator("#sb_form_q")).to_have_value("hello")
        _screenshot(page, "step_6")
