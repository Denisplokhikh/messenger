from slowapi import Limiter
from slowapi.util import get_remote_address

# get_remote_address просто берет request.client.host,
# куда Uvicorn (благодаря флагам в Dockerfile) уже положил настоящий IP от Nginx
limiter = Limiter(key_func=get_remote_address)
