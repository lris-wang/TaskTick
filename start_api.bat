@echo off
cd /d "C:\Users\30667\Desktop\TaskTick-master\services\api"
set PYTHONPATH=C:\Users\30667\Desktop\TaskTick-master\services\api
"C:\Program Files\PyManager\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8000
