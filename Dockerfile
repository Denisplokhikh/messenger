 # 1. Базовый легковесный образ Python
FROM python:3.11-slim
    
# 2. Отключаем буферизацию вывода Python и создание .pyc файлов
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
    
    # 3. Задаем рабочую директорию внутри контейнера
WORKDIR /app
    
    # 4. Сначала копируем только requirements.txt (для кэширования слоёв Docker)
COPY requirements.txt .
    
    # 5. Устанавливаем зависимости
RUN pip install --no-cache-dir -r requirements.txt
    
    # 6. Копируем остальной исходный код проекта
COPY . .
    
    # 7. Указываем порт, который слушает приложение
EXPOSE 8000
    
    # 8. Команда запуска сервера
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]