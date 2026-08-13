from playwright.sync_api import sync_playwright
from pathlib import Path

SHOTS = Path(__file__).parent / "shots"
SHOTS.mkdir(exist_ok=True)


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 820})
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)))

        page.goto("http://localhost:5173")
        page.wait_for_load_state("networkidle")
        page.wait_for_selector(".menu-view", timeout=10000)
        page.screenshot(path=str(SHOTS / "01_menu.png"), full_page=True)

        page.get_by_role("button", name="开始新游戏").click()
        page.wait_for_selector(".map-view", timeout=10000)
        page.screenshot(path=str(SHOTS / "02_map.png"), full_page=True)

        page.locator(".map-node.reachable").first.click()
        page.wait_for_timeout(800)
        page.screenshot(path=str(SHOTS / "03_scene.png"), full_page=True)

        if page.locator(".battle-view").count() > 0:
            page.wait_for_selector(".hand-zone .card", timeout=10000)
            playable = page.locator(".hand-zone .card:not(.disabled)")
            if playable.count() > 0:
                playable.first.click()
                page.wait_for_timeout(400)
            page.screenshot(path=str(SHOTS / "04_battle_after_play.png"), full_page=True)
            page.get_by_role("button", name="结束回合").click()
            page.wait_for_timeout(1500)
            page.screenshot(path=str(SHOTS / "05_after_end_turn.png"), full_page=True)

        print("PAGE_ERRORS:", errors)
        browser.close()


if __name__ == "__main__":
    main()
