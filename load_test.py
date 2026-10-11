import asyncio
import statistics
import time
import httpx

# ==================== НАСТРОЙКИ ТЕСТА ====================
BASE_URL = "http://localhost:8000"
TARGET_RPS = 50          # Количество сообщений в секунду
DURATION_SECONDS = 10    # Длительность теста в секундах

# Тестовые пользователи для автоматического создания чата
USER_1 = {"username": "load_tester_1", "email": "tester1@load.local", "password": "loadpassword123"}
USER_2 = {"username": "load_tester_2", "email": "tester2@load.local", "password": "loadpassword123"}
# ========================================================


async def register_user_if_needed(client: httpx.AsyncClient, user_data: dict) -> int:
    """Регистрирует пользователя, если он ещё не зарегистрирован, и возвращает его ID."""
    reg_resp = await client.post(f"{BASE_URL}/api/v1/auth/register", json=user_data)
    if reg_resp.status_code == 201:
        return reg_resp.json()["id"]

    # Если уже зарегистрирован — логинимся и узнаем ID через /users/me
    login_resp = await client.post(
        f"{BASE_URL}/api/v1/auth/login",
        data={"username": user_data["username"], "password": user_data["password"]},
    )
    login_resp.raise_for_status()
    token = login_resp.json()["access_token"]

    me_resp = await client.get(
        f"{BASE_URL}/api/v1/users/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    me_resp.raise_for_status()
    return me_resp.json()["id"]


async def get_or_create_test_chat(client: httpx.AsyncClient) -> tuple[str, int]:
    """
    Автоматически подготавливает пользователей и чат для нагрузки.
    Возвращает (JWT токен первого пользователя, chat_id).
    """
    print("[1/3] Подготовка тестовых пользователей...")
    u1_id = await register_user_if_needed(client, USER_1)
    u2_id = await register_user_if_needed(client, USER_2)

    # Логинимся первым пользователем
    print("[2/3] Авторизация и получение токена...")
    login_resp = await client.post(
        f"{BASE_URL}/api/v1/auth/login",
        data={"username": USER_1["username"], "password": USER_1["password"]},
    )
    login_resp.raise_for_status()
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Создаём прямой диалог между USER_1 и USER_2
    print("[3/3] Подготовка чата...")
    chat_resp = await client.post(
        f"{BASE_URL}/api/v1/chats/direct",
        json={"recipient_id": u2_id},
        headers=headers,
    )
    chat_resp.raise_for_status()
    chat_id = chat_resp.json()["id"]

    return token, chat_id


async def send_single_message(
    client: httpx.AsyncClient,
    chat_id: int,
    headers: dict,
    msg_num: int,
    stats: dict,
):
    """Отправляет одно сообщение и фиксирует время отклика."""
    payload = {"content": f"Load test message #{msg_num}"}
    start = time.perf_counter()

    try:
        resp = await client.post(
            f"{BASE_URL}/api/v1/chats/{chat_id}/messages",
            json=payload,
            headers=headers,
            timeout=10.0,
        )
        latency_ms = (time.perf_counter() - start) * 1000.0

        if resp.status_code == 201:
            stats["success"] += 1
            stats["latencies"].append(latency_ms)
        else:
            stats["errors"] += 1
            stats["error_details"].append(f"HTTP {resp.status_code}: {resp.text}")
    except Exception as exc:
        stats["errors"] += 1
        stats["error_details"].append(str(exc))


async def run_load_test():
    stats = {
        "success": 0,
        "errors": 0,
        "latencies": [],
        "error_details": [],
    }

    # Пул соединений для высокой пропускной способности
    limits = httpx.Limits(max_connections=150, max_keepalive_connections=100)

    async with httpx.AsyncClient(limits=limits) as client:
        try:
            token, chat_id = await get_or_create_test_chat(client)
        except Exception as exc:
            print(f"\n[ОШИБКА] Не удалось инициализировать тест: {exc}")
            print(f"Убедитесь, что сервер запущен по адресу: {BASE_URL}")
            return

        headers = {"Authorization": f"Bearer {token}"}
        total_target_messages = TARGET_RPS * DURATION_SECONDS

        print("\n" + "=" * 55)
        print(f" НАЧАЛО ТЕСТА")
        print(f" Чат ID:               {chat_id}")
        print(f" Целевой RPS:          {TARGET_RPS} сообщений/сек")
        print(f" Длительность:         {DURATION_SECONDS} секунд")
        print(f" Всего сообщений:      {total_target_messages}")
        print("=" * 55 + "\n")

        msg_counter = 0
        overall_start = time.perf_counter()

        for sec in range(DURATION_SECONDS):
            sec_start = time.perf_counter()

            # Запускаем батч из 50 параллельных запросов
            batch = [
                send_single_message(client, chat_id, headers, msg_counter + i + 1, stats)
                for i in range(TARGET_RPS)
            ]
            await asyncio.gather(*batch)
            msg_counter += TARGET_RPS

            elapsed_sec = time.perf_counter() - sec_start
            sleep_needed = max(0.0, 1.0 - elapsed_sec)

            print(
                f"Секунда {sec + 1:2d}/{DURATION_SECONDS} | "
                f"Отправлено: {TARGET_RPS} | "
                f"Время батча: {elapsed_sec * 1000:6.1f} ms | "
                f"Успешно: {stats['success']:4d} | Ошибок: {stats['errors']}"
            )

            if sleep_needed > 0:
                await asyncio.sleep(sleep_needed)

        total_time = time.perf_counter() - overall_start

    # Расчёт итоговой статистики
    latencies = stats["latencies"]
    avg_lat = statistics.mean(latencies) if latencies else 0.0
    min_lat = min(latencies) if latencies else 0.0
    max_lat = max(latencies) if latencies else 0.0
    p95_lat = statistics.quantiles(latencies, n=20)[18] if len(latencies) >= 20 else max_lat
    actual_rps = stats["success"] / total_time if total_time > 0 else 0.0

    print("\n" + "=" * 55)
    print(" РЕЗУЛЬТАТЫ ТЕСТИРОВАНИЯ")
    print("=" * 55)
    print(f"Общее время теста:         {total_time:.2f} сек")
    print(f"Успешных сообщений (201):   {stats['success']} / {total_target_messages}")
    print(f"Ошибок:                    {stats['errors']}")
    print(f"Фактический RPS:           {actual_rps:.1f} msg/sec")
    print(f"Минимальный отклик (min):  {min_lat:.1f} ms")
    print(f"Средний отклик (avg):      {avg_lat:.1f} ms")
    print(f"95-й перцентиль (p95):     {p95_lat:.1f} ms")
    print(f"Максимальный отклик (max): {max_lat:.1f} ms")
    print("=" * 55)

    if stats["errors"] > 0:
        print("\nПримеры ошибок:")
        for err in stats["error_details"][:5]:
            print(f" - {err}")


if __name__ == "__main__":
    asyncio.run(run_load_test())
