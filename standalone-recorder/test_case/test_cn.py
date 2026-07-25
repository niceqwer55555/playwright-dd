import os
import re
from datetime import datetime
from playwright.sync_api import Page, expect
import allure


def _screenshot(page, name: str) -> None:
    """Take a screenshot and attach to Allure report."""
    ts = datetime.now().strftime("%H%M%S")
    path = os.path.join("allure-results", f"{name}_{ts}.png")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    page.screenshot(path=path)
    allure.attach.file(path, name=name, attachment_type=allure.attachment_type.PNG)


@allure.feature("录制测试")
@allure.story("test_cn")
def test_cn(page: Page) -> None:
    with allure.step("步骤 1: 导航到 https://cn.bing.com/"):
        page.goto("https://cn.bing.com/")
        _screenshot(page, "step_1")
    with allure.step("步骤 3: 导航到 https://cn.bing.com/search?q=SK%e6%8e%8c%e9%97%a8%e4%ba%ba%e5%a4%a9%e4%bb%b7%e7%a6%bb%e5%a9%9a%e6%a1%88%e5%88%a4%e4%ba%86&efirst=0&ecount=50&filters=tnTID%3a%22DSBOS_1F46A363938746EC8E5D139F5B888059%22+tnVersion%3a%22a59a7b3f2f2749358d4800fa43e0a419%22+Segment%3a%22popularnow.carousel%22+tnCol%3a%220%22+tnOrder%3a%223d88d18b-e5b0-4e5f-b670-b3495a3fbc2e%22&form=HPNN01"):
        page.goto("https://cn.bing.com/search?q=SK%e6%8e%8c%e9%97%a8%e4%ba%ba%e5%a4%a9%e4%bb%b7%e7%a6%bb%e5%a9%9a%e6%a1%88%e5%88%a4%e4%ba%86&efirst=0&ecount=50&filters=tnTID%3a%22DSBOS_1F46A363938746EC8E5D139F5B888059%22+tnVersion%3a%22a59a7b3f2f2749358d4800fa43e0a419%22+Segment%3a%22popularnow.carousel%22+tnCol%3a%220%22+tnOrder%3a%223d88d18b-e5b0-4e5f-b670-b3495a3fbc2e%22&form=HPNN01")
        _screenshot(page, "step_3")
    with allure.step("步骤 4: 点击 link[name=\"SK掌门人天价离婚案判了\"] > span:nth-child(2)"):
        page.locator("link[name=\"SK掌门人天价离婚案判了\"] > span:nth-child(2)").click()
        _screenshot(page, "step_4")
    with allure.step("步骤 6: 断言截图: #sb_form_q"):
        # Screenshot assertion: save screenshot for visual comparison
        page.locator("#sb_form_q").screenshot(path="screenshots/test_cn-6.png")
        _screenshot(page, "step_6")
    with allure.step("步骤 7: 断言ARIA快照: #sb_form_q"):
        expect(page.locator("#sb_form_q")).to_match_aria_snapshot("- searchbox \"在此处输入你的搜索 — 输入时会显示搜索建议\"")  # ARIA snapshot - adjust if needed
        _screenshot(page, "step_7")
    with allure.step("步骤 8: 断言值: #sb_form_q = \"SK掌门人天价离婚案判了\""):
        expect(page.locator("#sb_form_q")).to_have_value("SK掌门人天价离婚案判了")
        _screenshot(page, "step_8")
    with allure.step("步骤 9: 断言值: #sb_form_q = \"SK掌门人天价离婚案判了\""):
        expect(page.locator("#sb_form_q")).to_have_value("SK掌门人天价离婚案判了")
        _screenshot(page, "step_9")
    with allure.step("步骤 10: 断言可见: #sb_form_q"):
        expect(page.locator("#sb_form_q")).to_be_visible()
        _screenshot(page, "step_10")