"""Exercise an isolated build in the runner's Chrome, without production data."""

import os
import secrets
import sqlite3
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


def check(page, context, origin, database, code):
    password = secrets.token_urlsafe(20)
    phrase = secrets.token_urlsafe(20)
    username = "browser-fixture"
    errors = []
    sync_responses = []
    page.on(
        "response",
        lambda r: (
            sync_responses.append(r.status)
            if r.url.endswith("/api/offline/sync")
            else None
        ),
    )
    page.on("pageerror", lambda exc: errors.append(str(exc)))
    page.goto(origin + "/account/#activate")
    page.get_by_label("Одноразовый код из Railway").fill(code)
    page.get_by_label("Логин", exact=True).fill(username)
    page.get_by_label("Пароль", exact=True).fill(password)
    page.get_by_role("button", name="Создать аккаунт").click()
    cover = page.locator(".rq-cover h1")
    expect(cover).to_be_visible()

    for width, height in [(3440, 1440), (1280, 800), (390, 844), (320, 650)]:
        page.set_viewport_size({"width": width, "height": height})
        expect(cover).to_be_in_viewport()
        assert (
            page.evaluate("document.documentElement.scrollWidth") <= width
        ), f"Overflow at {width}px"
        print(f"Verified dashboard at {width} × {height}", flush=True)

    page.set_viewport_size({"width": 1500, "height": 900})
    page.locator(".rq-assistant-toggle").click()
    panel = page.get_by_role("complementary", name="Ассистент")
    panel.get_by_label("Запрос к ассистенту").fill("Проверка отсутствующей модели")
    panel.get_by_role("button", name="Спросить").click()
    expect(panel.get_by_role("status")).to_contain_text("настроить ключ провайдера")
    panel.get_by_role("button", name="Закрыть панель").click()

    nav = page.locator(".rq-side")
    page.get_by_label("Учебная дата").fill("2026-11-27")
    nav.get_by_role("button", name="Сценарии", exact=True).click()
    compare = page.locator("section").filter(
        has=page.get_by_role("heading", name="Оставаться на последнюю пару?")
    )
    expect(
        compare.get_by_role("heading", name="Пропустить последний урок")
    ).to_be_visible()
    options = compare.get_by_role("article")
    pair = options.filter(has=page.get_by_role("heading", name="Пропустить всю пару"))
    pair.get_by_role("button", name="Подставить в симулятор").click()
    expect(page.locator(".rq-body input[type='checkbox']:checked")).to_have_count(2)
    with sqlite3.connect(database) as db:
        assert (
            db.execute(
                "SELECT COUNT(*) FROM entries WHERE kind IN ('decision','attendance')"
            ).fetchone()[0]
            == 0
        )
    for name in [
        "Учёба",
        "Сценарии",
        "Дорога",
        "Дела",
        "Время",
        "Oracle",
        "Архив и заметки",
        "Управление",
        "Настройки",
    ]:
        nav.get_by_role("button", name=name, exact=True).click()
        expect(page.locator(".rq-top strong")).to_have_text(name)
    page.get_by_label("Фраза офлайн-доступа").fill(phrase)
    page.get_by_role("button", name="Сохранить для дороги").click()
    expect(page.get_by_text("Черновиков на устройстве · 0")).to_be_visible()
    page.wait_for_function(
        "navigator.serviceWorker.controller?.scriptURL.endsWith('/account/worker.js')"
    )

    # Simulate a cold start in the train. Only cached shell assets and encrypted data exist.
    context.set_offline(True)
    page.reload(wait_until="domcontentloaded")
    page.get_by_label("Фраза офлайн-доступа").fill(phrase)
    page.get_by_role("button", name="Открыть сохранённую копию").click()
    page.get_by_label("Задача в офлайн-черновики").fill(
        "Уникальная задача для проверки"
    )
    page.get_by_role("button", name="Записать", exact=True).click()
    expect(page.get_by_text("Черновиков на устройстве · 1")).to_be_visible()
    context.set_offline(False)
    expect(nav).to_be_visible()
    nav.get_by_role("button", name="Настройки", exact=True).click()
    expect(page.get_by_text("Черновиков на устройстве · 0")).to_be_visible()
    assert sync_responses == [200], sync_responses
    page.get_by_role("button", name="Синхронизировать", exact=True).click()
    expect(page.get_by_text("Копия и черновики синхронизированы")).to_be_visible()
    with sqlite3.connect(database) as db:
        rows = db.execute(
            "SELECT json_extract(body,'$.title') FROM entries WHERE kind='task'"
        ).fetchall()
        assert rows == [("Уникальная задача для проверки",)], rows
    nav.get_by_role("button", name="Выйти", exact=True).click()
    expect(page.get_by_role("heading", name="Вход в аккаунт")).to_be_visible()
    page.get_by_label("Логин", exact=True).fill(username)
    page.get_by_label("Пароль", exact=True).fill(password)
    page.get_by_role("button", name="Войти", exact=True).click()
    nav.get_by_role("button", name="Обзор", exact=True).click()
    expect(cover).to_be_visible()
    page.reload()
    expect(cover).to_be_visible()
    assert not errors, errors
    print(
        "Verified first login, private navigation, unavailable AI, offline cold start, automatic sync, logout and session restore"
    )


def main():
    origin = "http://127.0.0.1:18741"
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with tempfile.TemporaryDirectory() as temp:
        database = str(Path(temp) / "acceptance.sqlite3")
        code = secrets.token_urlsafe(32)
        env = {
            **os.environ,
            "REQUIEM_DB": database,
            "REQUIEM_ORIGIN": origin,
            "REQUIEM_ACTIVATION_CODE": code,
        }
        server = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "uvicorn",
                "server.main:app",
                "--host",
                "127.0.0.1",
                "--port",
                "18741",
                "--no-access-log",
            ],
            env=env,
        )
        try:
            for _ in range(100):
                if server.poll() is not None:
                    raise RuntimeError("Fixture server stopped")
                try:
                    with opener.open(origin + "/health", timeout=1):
                        break
                except OSError:
                    time.sleep(0.1)
            else:
                raise RuntimeError("Fixture server did not start")
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(channel="chrome")
                try:
                    context = browser.new_context(
                        viewport={"width": 1440, "height": 900}
                    )
                    page = context.new_page()
                    expect.set_options(timeout=12_000)
                    check(page, context, origin, database, code)
                finally:
                    browser.close()
        finally:
            server.terminate()
            server.wait(timeout=10)


if __name__ == "__main__":
    main()
