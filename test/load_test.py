import asyncio
import time
import httpx

BASE_URL = "http://localhost:8000"
CHAT_ID = 6  # ID существующего чата
TEST_DURATION_SECONDS = 10  # Длительность теста в секундах
TARGET_RPS = 10  # 50 сообщений в секунду


async def get_auth_token(client: httpx.AsyncClient) -> str:
    """Авторизация и получение JWT токена"""
    response = await client.post(
        f"{BASE_URL}/api/v1/auth/login",
        data={"username": "test", "password": "123456"},
    )
    response.raise_for_status()
    return response.json()["access_token"]


async def send_single_message(
    client: httpx.AsyncClient, token: str, message_num: int, stats: dict
):
    """Отправка одного сообщения и замер статуса"""
    headers = {"Authorization": f"Bearer {token}"}
    payload = {"content": f"Стресс-тест сообщение #{message_num}"}

    start = time.perf_counter()
    try:
        resp = await client.post(
            f"{BASE_URL}/api/v1/chats/{CHAT_ID}/messages",
            json=payload,
            headers=headers,
            timeout=5.0,
        )
        latency = (time.perf_counter() - start) * 1000  # в миллисекундах
        if resp.status_code == 201:
            stats["success"] += 1
            stats["latencies"].append(latency)
        else:
            stats["errors"] += 1
    except Exception as e:
        stats["errors"] += 1


async def main():
    stats = {"success": 0, "errors": 0, "latencies": []}

    # Пул HTTP-соединений, чтобы не открывать TCP-соединение заново на каждый запрос
    limits = httpx.Limits(max_connections=100, max_keepalive_connections=50)

    async with httpx.AsyncClient(limits=limits) as client:
        print("Авторизация...")
        token = await get_auth_token(client)
        print("Токен получен. Начинаем тест...")

        total_messages = 0
        overall_start = time.perf_counter()

        for sec in range(TEST_DURATION_SECONDS):
            sec_start = time.perf_counter()

            # Запускаем пачку из 50 параллельных корутин
            tasks = [
                send_single_message(client, token, total_messages + i + 1, stats)
                for i in range(TARGET_RPS)
            ]
            await asyncio.gather(*tasks)
            total_messages += TARGET_RPS

            # Ждём остаток секунды, чтобы выдерживать ровно 50 сообщений в секунду
            elapsed = time.perf_counter() - sec_start
            sleep_time = max(0.0, 1.0 - elapsed)
            print(
                f"Секунда {sec + 1}/{TEST_DURATION_SECONDS}: 50 отправлено за {elapsed:.3f}с"
            )
            await asyncio.sleep(sleep_time)

        overall_duration = time.perf_counter() - overall_start

    # Итоги теста
    avg_latency = (
        sum(stats["latencies"]) / len(stats["latencies"]) if stats["latencies"] else 0
    )
    print("\n" + "=" * 40)
    print(f"Всего времени: {overall_duration:.2f} сек")
    print(f"Успешно: {stats['success']}")
    print(f"Ошибок: {stats['errors']}")
    print(f"Средняя задержка (latency): {avg_latency:.1f} мс")
    print(f"Фактический RPS: {stats['success'] / overall_duration:.1f} msg/sec")
    print("=" * 40)


if __name__ == "__main__":
    asyncio.run(main())
